// Números do painel: funil por período (eventos), metas e ritmo, taxas, gargalo, simulador,
// leitura do mercado (pesquisa das abordagens), conversão por origem/cidade e tempo de ciclo.
// Topo do funil (Lead, MQL) em EMPRESAS (esforço); do SQL em diante em VEÍCULOS (necessidade do cliente).
import { paraISO, deISO, somarDias, inicioDaSemana } from './datas.js';

const dia = (ts) => paraISO(new Date(ts));
const taxa = (a, b) => (b ? a / b : null);
export const ETAPAS_META = ['leads', 'mql', 'sql', 'vendas', 'associados'];
export const ROTULO_META = { leads: 'Leads', mql: 'MQL', sql: 'SQL', vendas: 'Vendas', associados: 'Associados' };
export const UNIDADE_META = { leads: 'empresas', mql: 'empresas', sql: 'veículos cotados', vendas: 'veículos', associados: 'veículos' };

// Período: 'semana' (segunda a domingo) ou 'mes'. ref = qualquer dia dentro dele. fim é exclusivo.
export function periodo(tipo, ref) {
  if (tipo === 'mes') {
    const d = deISO(ref);
    const ini = paraISO(new Date(d.getFullYear(), d.getMonth(), 1));
    const fim = paraISO(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    return { tipo, ini, fim, rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }
  const ini = inicioDaSemana(ref);
  return { tipo, ini, fim: somarDias(ini, 7), rotulo: `${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${somarDias(ini, 6).slice(8, 10)}/${somarDias(ini, 6).slice(5, 7)}` };
}
export const deslocar = (p, n) => (p.tipo === 'mes'
  ? periodo('mes', paraISO(new Date(deISO(p.ini).getFullYear(), deISO(p.ini).getMonth() + n, 1)))
  : periodo('semana', somarDias(p.ini, 7 * n)));

// Funil do período, pelos eventos registrados nele.
export function funil(contatos, p) {
  const no = contatos.filter((c) => { const d = dia(c.data); return d >= p.ini && d < p.fim; });
  const leadsCom = (ev) => new Set(no.filter((c) => c.evento === ev).map((c) => c.lead_id));
  const veic = (ev, ultimoPorLead = false) => {
    const cs = no.filter((c) => c.evento === ev).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (!ultimoPorLead) return cs.reduce((n, c) => n + (c.veiculos || 0), 0);
    const ult = new Map(cs.map((c) => [c.lead_id, c.veiculos || 0]));
    return [...ult.values()].reduce((a, b) => a + b, 0);
  };
  const e = {
    leads: leadsCom('abordagem').size,
    mql: leadsCom('mql').size,
    sql_empresas: leadsCom('sql').size, sql: veic('sql', true),
    vendas_empresas: leadsCom('venda').size, vendas: veic('venda'),
    associados_empresas: leadsCom('associado').size, associados: veic('associado'),
    no_show: no.filter((c) => c.evento === 'no_show').length,
  };
  const perdas = {};
  for (const c of no.filter((x) => x.evento === 'perda')) {
    const et = c.etapa || 'lead';
    perdas[et] ??= { total: 0, motivos: {} };
    perdas[et].total++;
    const m = c.motivo || 'Sem motivo';
    perdas[et].motivos[m] = (perdas[et].motivos[m] || 0) + 1;
  }
  return { ...e, perdas, taxas: taxasDe(e) };
}

export function taxasDe(e) {
  return {
    lead_mql: taxa(e.mql, e.leads),
    mql_sql: taxa(e.sql_empresas, e.mql),
    sql_venda: taxa(e.vendas, e.sql), // em veículos: vendidos ÷ cotados
    venda_assoc: taxa(e.associados, e.vendas),
    total_empresas: taxa(e.associados_empresas, e.leads),
    veic_por_cotacao: taxa(e.sql, e.sql_empresas),
    veic_por_associado: taxa(e.associados, e.associados_empresas),
    no_show: taxa(e.no_show, e.mql),
  };
}

// Metas: mensais na configuração; a semana é ÷ 4.
export function metasDo(config, tipo) {
  const m = config?.metas || {};
  return Object.fromEntries(ETAPAS_META.map((k) => [k, m[k] ? (tipo === 'semana' ? m[k] / 4 : m[k]) : null]));
}

// Fração esperada do período até hoje (velocímetro): semana anda em 5 dias (seg a sex; sáb/dom = 100%),
// mês anda pelos dias corridos. Períodos passados = 100%, futuros = 0%.
export function esperadoAteHoje(p, hoje) {
  if (hoje >= p.fim) return 1;
  if (hoje < p.ini) return 0;
  if (p.tipo === 'semana') {
    const n = Math.round((deISO(hoje) - deISO(p.ini)) / 86400000) + 1; // seg = 1
    return Math.min(n, 5) / 5;
  }
  const total = Math.round((deISO(p.fim) - deISO(p.ini)) / 86400000);
  const n = Math.round((deISO(hoje) - deISO(p.ini)) / 86400000) + 1;
  return n / total;
}

// Taxas que as metas pressupõem (para comparar com as reais e achar o gargalo).
export function taxasDasMetas(metas, veicPorCotacao) {
  const vpc = veicPorCotacao || 1;
  return {
    lead_mql: taxa(metas.mql, metas.leads),
    mql_sql: metas.sql && metas.mql ? metas.sql / vpc / metas.mql : null,
    sql_venda: taxa(metas.vendas, metas.sql),
    venda_assoc: taxa(metas.associados, metas.vendas),
  };
}

const PASSAGENS = [
  { k: 'lead_mql', rotulo: 'Lead → MQL', base: 'leads' },
  { k: 'mql_sql', rotulo: 'MQL → SQL', base: 'mql' },
  { k: 'sql_venda', rotulo: 'SQL → Venda (veículos)', base: 'sql' },
  { k: 'venda_assoc', rotulo: 'Venda → Associado (veículos)', base: 'vendas' },
];
export const AMOSTRA_MINIMA = 5;

// Compara cada taxa real com a esperada pelas metas; o gargalo é a que está mais abaixo (com amostra mínima).
export function passagens(f, esperadas) {
  const lista = PASSAGENS.map((p) => {
    const real = f.taxas[p.k];
    const esp = esperadas[p.k];
    const amostra = f[p.base];
    return { ...p, real, esperada: esp, amostra, poucos: amostra < AMOSTRA_MINIMA, razao: real != null && esp ? real / esp : null };
  });
  const candidatos = lista.filter((x) => !x.poucos && x.razao != null && x.razao < 1);
  const pior = candidatos.sort((a, b) => a.razao - b.razao)[0];
  return lista.map((x) => ({ ...x, gargalo: pior?.k === x.k }));
}

// Simulador de trás para a frente: quantos leads para fechar `associados` veículos.
export function simular({ associados, lead_mql, mql_sql, sql_venda, venda_assoc, veic_por_cotacao }) {
  const ok = [lead_mql, mql_sql, sql_venda, venda_assoc, veic_por_cotacao].every((v) => v > 0);
  if (!ok || !(associados > 0)) return null;
  const vendas = associados / venda_assoc;
  const sql = vendas / sql_venda;
  const sqlEmpresas = sql / veic_por_cotacao;
  const mql = sqlEmpresas / mql_sql;
  const leads = mql / lead_mql;
  return { associados, vendas, sql, sqlEmpresas, mql, leads, leadsSemana: leads / 4, leadsDia: leads / 20 };
}

// Taxas de partida do simulador: as reais (todo o histórico) quando há amostra, senão as das metas, senão um chute.
export const TAXAS_CHUTE = { lead_mql: 0.3, mql_sql: 0.33, sql_venda: 0.3, venda_assoc: 0.67, veic_por_cotacao: 3 };
export function taxasIniciais(fTudo, esperadas) {
  const r = {};
  const fonte = {};
  for (const p of PASSAGENS) {
    if (fTudo[p.base] >= AMOSTRA_MINIMA && fTudo.taxas[p.k] > 0) { r[p.k] = fTudo.taxas[p.k]; fonte[p.k] = 'real'; }
    else if (esperadas[p.k] > 0) { r[p.k] = esperadas[p.k]; fonte[p.k] = 'meta'; }
    else { r[p.k] = TAXAS_CHUTE[p.k]; fonte[p.k] = 'chute'; }
  }
  if (fTudo.sql_empresas >= AMOSTRA_MINIMA && fTudo.taxas.veic_por_cotacao) { r.veic_por_cotacao = fTudo.taxas.veic_por_cotacao; fonte.veic_por_cotacao = 'real'; }
  else { r.veic_por_cotacao = TAXAS_CHUTE.veic_por_cotacao; fonte.veic_por_cotacao = 'chute'; }
  return { taxas: r, fonte };
}

// Empresas abordadas no período (pela abordagem; leads "segurados" desdobrados não contam).
function abordadas(leads, contatos, p, cidade) {
  const ids = new Set(contatos.filter((c) => c.evento === 'abordagem' && dia(c.data) >= p.ini && dia(c.data) < p.fim).map((c) => c.lead_id));
  return leads.filter((l) => ids.has(l.id) && !l.lead_pai_id && (!cidade || l.cidade === cidade));
}

// Leitura do mercado: o que a pesquisa das abordagens mostrou.
export function mercado(leads, contatos, p, cidade = null) {
  const abord = abordadas(leads, contatos, p, cidade);
  const pesquisadas = abord.filter((l) => l.falou_decisor === true && l.n_veiculos != null);
  const comVeic = pesquisadas.filter((l) => l.n_veiculos > 0);
  const soma = (xs, f) => xs.reduce((n, x) => n + (f(x) || 0), 0);
  const seg = (l) => Math.min(l.n_segurados ?? 0, l.n_veiculos);
  const todos = comVeic.filter((l) => seg(l) === l.n_veiculos);
  const nenhum = comVeic.filter((l) => seg(l) === 0);
  const parte = comVeic.filter((l) => seg(l) > 0 && seg(l) < l.n_veiculos);
  const frota = { 1: 0, 2: 0, 3: 0, '4+': 0 };
  for (const l of comVeic) frota[l.n_veiculos >= 4 ? '4+' : l.n_veiculos]++;
  const porSeg = new Map();
  for (const l of comVeic.filter((x) => seg(x) > 0)) {
    const nome = (l.seguradora || 'Não informada').trim();
    const chave = nome.toLocaleLowerCase('pt-BR');
    const s = porSeg.get(chave) || { nome, empresas: 0, veiculos: 0, notas: [] };
    s.empresas++; s.veiculos += seg(l);
    if (l.nota_seguro != null) s.notas.push(l.nota_seguro);
    porSeg.set(chave, s);
  }
  const seguradoras = [...porSeg.values()]
    .map((s) => ({ ...s, nota_media: s.notas.length ? s.notas.reduce((a, b) => a + b, 0) / s.notas.length : null }))
    .sort((a, b) => b.empresas - a.empresas || b.veiculos - a.veiculos);
  const notas = [0, 1, 2, 3, 4, 5].map((n) => comVeic.filter((l) => seg(l) > 0 && l.nota_seguro === n).length);
  const comNota = comVeic.filter((l) => seg(l) > 0 && l.nota_seguro != null);
  const motivos = {};
  for (const l of comVeic.filter((x) => seg(x) < x.n_veiculos && x.motivo_sem_seguro)) motivos[l.motivo_sem_seguro] = (motivos[l.motivo_sem_seguro] || 0) + 1;
  const vencimentos = {};
  for (const l of comVeic.filter((x) => seg(x) > 0 && x.vencimento_seguro)) {
    const m = l.vencimento_seguro.slice(0, 7);
    vencimentos[m] = (vencimentos[m] || 0) + seg(l);
  }
  const veiculos = soma(comVeic, (l) => l.n_veiculos);
  const segurados = soma(comVeic, seg);
  return {
    abordadas: abord.length,
    pesquisadas: pesquisadas.length,
    falou_decisor: abord.filter((l) => l.falou_decisor === true).length,
    sem_veiculos: pesquisadas.length - comVeic.length,
    com_veiculos: comVeic.length,
    veiculos, segurados, sem_seguro: veiculos - segurados,
    empresas_todos_segurados: todos.length, empresas_nenhum_segurado: nenhum.length, empresas_parte_segurada: parte.length,
    frota, seguradoras, notas,
    nota_media: comNota.length ? comNota.reduce((n, l) => n + l.nota_seguro, 0) / comNota.length : null,
    satisfeitos: comNota.filter((l) => l.nota_seguro >= 4).length,
    motivos, vencimentos: Object.fromEntries(Object.entries(vencimentos).sort()),
    cidades: [...new Set(abordadas(leads, contatos, p, null).map((l) => l.cidade).filter(Boolean))].sort(),
  };
}

// Das empresas abordadas no período, quantas chegaram a cada etapa (a qualquer tempo), por origem e por cidade.
export function conversaoPor(campo, leads, contatos, p) {
  const abord = abordadas(leads, contatos, p, null);
  const chegou = new Map();
  for (const c of contatos) {
    if (!['mql', 'sql', 'venda', 'associado'].includes(c.evento)) continue;
    if (!chegou.has(c.lead_id)) chegou.set(c.lead_id, new Set());
    chegou.get(c.lead_id).add(c.evento);
  }
  const grupos = new Map();
  for (const l of abord) {
    const g = (campo === 'origem' ? (l.origem === 'indicacao' ? 'Indicação' : 'Abordagem') : l.cidade) || 'Não informada';
    const x = grupos.get(g) || { grupo: g, leads: 0, mql: 0, sql: 0, venda: 0, associado: 0 };
    x.leads++;
    const s = chegou.get(l.id) || new Set();
    for (const e of ['mql', 'sql', 'venda', 'associado']) if (s.has(e)) x[e]++;
    grupos.set(g, x);
  }
  return [...grupos.values()].map((x) => ({ ...x, taxa_mql: taxa(x.mql, x.leads), taxa_total: taxa(x.associado, x.leads) }))
    .sort((a, b) => b.leads - a.leads);
}

// Tempo de ciclo (dias, mediana e média) entre etapas, em todo o histórico.
export function ciclo(contatos) {
  const primeiro = new Map();
  for (const c of [...contatos].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    const k = `${c.lead_id}|${c.evento}`;
    if (!primeiro.has(k)) primeiro.set(k, new Date(c.data));
  }
  const ids = new Set(contatos.map((c) => c.lead_id));
  const trecho = (de, ate) => {
    const dias = [];
    for (const id of ids) {
      const a = primeiro.get(`${id}|${de}`); const b = primeiro.get(`${id}|${ate}`);
      if (a && b && b >= a) dias.push((b - a) / 86400000);
    }
    dias.sort((x, y) => x - y);
    return { n: dias.length, mediana: dias.length ? dias[Math.floor(dias.length / 2)] : null, media: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null };
  };
  return {
    lead_mql: trecho('abordagem', 'mql'), mql_sql: trecho('mql', 'sql'), sql_venda: trecho('sql', 'venda'),
    venda_assoc: trecho('venda', 'associado'), total: trecho('abordagem', 'associado'),
  };
}
