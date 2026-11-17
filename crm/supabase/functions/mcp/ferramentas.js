// Ações do conector "Micro CRM" (tools MCP). Reaproveitam a lógica testada do app (lib/).
// Regras: só diz "salvo" depois que o banco confirmou; nada é apagado; nunca sugere o que fazer.
import { pesquisaVazia, pesquisaDoLead, analisar, opsPesquisa, opsEditarLead, limparLead, MOTIVOS_SEM_SEGURO } from './lib/pesquisa.js';
import { ACOES, MOTIVOS_PERDA, EVENTOS, TIPOS_PROXIMO, faltaNoFollowup, opsFollowup, estaNaAgenda, esfriando, rotuloEtapa } from './lib/etapas.js';
import { acaoAtiva, opsNovaAcao, resumoAcao, nomeDaAcao, textoPeriodoAcao } from './lib/acoes.js';
import { agendaDe, compromissoDosOps, horariosLivres, ocupadosDoCRM } from './lib/agenda.js';
import { periodo, funil, metasDo, esperadoAteHoje, passagens, taxasDasMetas, mercado } from './lib/painel.js';
import { retornoPorIntervalo, voltaPorIntervalo, opsContatoCurto, faltaNoContatoCurto, PERFIS } from './lib/relacionamento.js';
import { situacaoLead } from './lib/situacao.js';
import { hojeISO, somarDias, deISO } from './lib/datas.js';
import { carregar, gravar, idsEstaveis } from './dados.js';
import { entrar, textoBrasilia } from './fuso.js';
import { parecidos, parecido, normalizar } from './nomes.js';

export const LINK_APP = 'https://micro-crm-virid.vercel.app';

// ---------- utilidades ----------
class Falha extends Error {}
const RE = { data: /^\d{4}-\d{2}-\d{2}$/, hora: /^([01]\d|2[0-3]):[0-5]\d$/, mes: /^\d{4}-(0[1-9]|1[0-2])$/ };
const vazio = (v) => v == null || (typeof v === 'string' && !v.trim());
function conferir(args, campo, tipo) {
  const v = args[campo];
  if (vazio(v)) return;
  const ok = tipo === 'data' ? RE.data.test(v) && !Number.isNaN(deISO(v).getTime())
    : tipo === 'hora' ? RE.hora.test(v) : tipo === 'mes' ? RE.mes.test(v) : true;
  const exemplo = { data: 'AAAA-MM-DD', hora: 'HH:MM (24h)', mes: 'AAAA-MM' }[tipo];
  if (!ok) throw new Falha(`"${campo}" deve estar no formato ${exemplo}; veio "${v}".`);
}
const inteiro = (args, campo, min, max) => {
  const v = args[campo];
  if (v == null) return;
  if (!Number.isInteger(v) || v < min || (max != null && v > max)) throw new Falha(`"${campo}" deve ser um número inteiro${max != null ? ` de ${min} a ${max}` : ` a partir de ${min}`}.`);
};

function contexto(ctx, d) {
  const agora = entrar(ctx.agora || new Date());
  return { agora, hoje: hojeISO(agora), agenda: agendaDe(d.config), dias: d.config?.dias_esfriando || 7 };
}
const acharLead = (d, id) => {
  if (vazio(id)) throw new Falha('Informe o lead_id (use buscar_leads para achar).');
  const l = d.leads.find((x) => x.id === id);
  if (!l) throw new Falha(`Lead ${id} não encontrado.`);
  return l;
};
function resumo(d, l, c) {
  const s = situacaoLead(l, d.contatosDe(l.id), { hoje: c.hoje, diasEsfriando: c.dias });
  return { lead_id: l.id, empresa: l.empresa, situacao: s.linha, alertas: s.alertas };
}

// O que o Claude deve fazer no Google Agenda depois de uma gravação.
function compromisso(l, agenda) {
  if (l.arquivado || !l.data_proximo_passo) return null;
  const descricao = (detalhes) => `${detalhes}\n${LINK_APP}`;
  if (l.proximo_tipo === 'vencimento') {
    return { dia_inteiro: true, data: l.data_proximo_passo, titulo: `Vencimento do seguro – ${l.empresa}`,
      descricao: descricao([l.seguradora ? `Seguradora: ${l.seguradora}` : null, l.decisor_nome ? `Decisor: ${l.decisor_nome}` : null,
        l.decisor_whatsapp ? `WhatsApp: ${l.decisor_whatsapp}` : null, 'Marcado pelo Micro CRM'].filter(Boolean).join('\n')) };
  }
  const c = compromissoDosOps([{ tabela: 'leads', linha: l }], agenda);
  if (!c) return null;
  return { dia_inteiro: false, inicio: textoBrasilia(c.inicio), fim: textoBrasilia(c.fim), titulo: c.titulo, local: c.local, descricao: descricao(c.detalhes) };
}
const chaveAgenda = (l) => (l ? [l.arquivado, l.proximo_tipo, l.data_proximo_passo, String(l.hora_proximo_passo || '').slice(0, 5), l.empresa].join('|') : '');
function instrucaoAgenda(antes, depois, agenda) {
  const novo = compromisso(depois, agenda);
  const id = antes?.google_event_id || depois.google_event_id || null;
  const base = { lead_id: depois.id, empresa: depois.empresa };
  if (!novo) return id ? { ...base, acao: 'cancelar', google_event_id: id } : { ...base, acao: 'nenhuma' };
  if (!id) return { ...base, acao: 'criar', evento: novo, depois: 'Chame vincular_evento com o id do evento criado.' };
  if (antes && chaveAgenda(antes) === chaveAgenda(depois)) return { ...base, acao: 'nenhuma', google_event_id: id };
  return { ...base, acao: 'mover', google_event_id: id, evento: novo };
}

// Grava com ids estáveis e devolve o resultado (Regra nº 1).
async function executar(ctx, d, ops, idOperacao) {
  const id = idOperacao || crypto.randomUUID();
  const existentes = new Set([...d.leads.map((l) => l.id), ...d.contatos.map((x) => x.id), ...d.acoes.map((a) => a.id)]);
  const estaveis = await idsEstaveis(ops, id, existentes);
  let r;
  try { r = await gravar(ctx.sb, estaveis); } catch (e) { r = { salvo: false, erro: e?.message || String(e), gravadas: '?', de: estaveis.length }; }
  if (!r.salvo) {
    throw new Falha(`NÃO SALVO: ${r.erro} (${r.gravadas} de ${r.de} partes gravadas). `
      + `Para completar sem duplicar, chame de novo exatamente com os mesmos dados e id_operacao="${id}".`);
  }
  return estaveis;
}
// Depois de gravar: os dados como ficaram (sem reler o banco).
function aplicar(d, ops) {
  const leads = new Map(d.leads.map((l) => [l.id, l]));
  const contatos = [...d.contatos];
  const acoes = new Map(d.acoes.map((a) => [a.id, a]));
  for (const { tabela, linha } of ops) {
    if (tabela === 'leads') leads.set(linha.id, { ...(leads.get(linha.id) || {}), ...linha });
    else if (tabela === 'contatos') contatos.push(linha);
    else if (tabela === 'acoes') acoes.set(linha.id, { ...(acoes.get(linha.id) || {}), ...linha });
  }
  const porLead = new Map();
  for (const x of contatos) { if (!porLead.has(x.lead_id)) porLead.set(x.lead_id, []); porLead.get(x.lead_id).push(x); }
  return { ...d, leads: [...leads.values()], contatos, acoes: [...acoes.values()], contatosDe: (id) => porLead.get(id) || [] };
}
function respostaGravacao(d, ops, c, extra = {}) {
  const depois = aplicar(d, ops);
  const leadsOps = ops.filter((o) => o.tabela === 'leads').map((o) => depois.leads.find((l) => l.id === o.linha.id));
  return {
    salvo: true,
    ...extra,
    leads: leadsOps.map((l) => resumo(depois, l, c)),
    google_agenda: leadsOps.map((l) => instrucaoAgenda(d.leads.find((x) => x.id === l.id), l, c.agenda)).filter((x) => x.acao !== 'nenhuma'),
  };
}

// Campos da pesquisa (visita ou retorno) vindos do Claude -> formulário do app.
function formDe(args, base) {
  for (const [c, t] of [['data', 'data'], ['hora', 'hora'], ['vencimento', 'mes']]) conferir(args, c, t);
  inteiro(args, 'veiculos', 0); inteiro(args, 'segurados', 0); inteiro(args, 'nota', 0, 5);
  const f = { ...base };
  const tem = (k) => args[k] !== undefined;
  for (const k of ['empresa', 'origem', 'indicado_por', 'decisor_nome', 'decisor_whatsapp', 'seguradora', 'vencimento', 'observacao', 'data', 'hora']) {
    if (tem(k)) f[k] = args[k] ?? '';
  }
  for (const k of ['falou_decisor', 'agendou_reuniao', 'nota', 'criar_lead_segurados']) if (tem(k)) f[k] = args[k];
  if (tem('veiculos') || tem('veiculos_mais')) {
    const n = args.veiculos ?? (args.veiculos_mais ? 4 : null);
    f.veiculos = n == null ? null : n >= 4 ? '4+' : n;
    f.veiculos_qtd = n != null && n >= 4 && !args.veiculos_mais ? String(n) : '';
  }
  if (tem('segurados')) {
    const n = args.segurados;
    f.segurados = n == null ? null : n >= 4 ? '4+' : n;
    f.segurados_qtd = n != null && n >= 4 ? String(n) : '';
  }
  if (tem('motivo_sem_seguro')) {
    const m = String(args.motivo_sem_seguro || '').trim();
    const conhecido = MOTIVOS_SEM_SEGURO.find((x) => x !== 'Outro' && normalizar(x) === normalizar(m));
    f.motivo_sem_seguro = !m ? null : conhecido || 'Outro';
    f.motivo_outro = conhecido || !m ? '' : m;
  }
  return f;
}

// ---------- ações ----------
async function registrarVisita(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  const acao = acaoAtiva(d.acoes);
  if (!acao || acao.finalizada_em) throw new Falha('Não há ação de vendas ativa. Pergunte a cidade (e a rua) e crie com acao_de_vendas.');
  if (vazio(args.empresa)) return { salvo: false, falta: ['Empresa'] };
  if (!args.mesmo_assim_nova) {
    const iguais = parecidos(args.empresa, d.leads);
    if (iguais.length) {
      return {
        salvo: false,
        aviso: 'Já existe empresa com nome parecido. Confirme com o usuário se é a mesma.',
        parecidos: iguais.slice(0, 5).map((l) => resumo(d, l, c)),
        como_seguir: 'Se for a mesma empresa, use registrar_contato com o lead_id. Se for outra, chame de novo com mesmo_assim_nova=true.',
      };
    }
  }
  const f = formDe({ criar_lead_segurados: true, ...args }, { ...pesquisaVazia(), cidade: acao.cidade });
  const a = analisar(f);
  if (a.falta.length) return { salvo: false, falta: a.falta, observacao: 'Nada foi gravado. Pergunte só o que falta, uma coisa por vez.' };
  const ops = await executar(ctx, d, opsPesquisa(f, { acao, agora: c.agora }), args.id_operacao);
  return respostaGravacao(d, ops, c, { acao_de_vendas: nomeDaAcao(acao) });
}

async function registrarContato(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  const lead = acharLead(d, args.lead_id);
  const tipo = args.tipo;
  conferir(args, 'data', 'data'); conferir(args, 'hora', 'hora');
  let ops;
  if (tipo === 'relacionamento') {
    const falta = faltaNoContatoCurto(args);
    if (falta.length) return { salvo: false, falta };
    ops = opsContatoCurto(lead, args, c.agora);
  } else if (tipo === 'retorno_pesquisa') {
    if (lead.arquivado) throw new Falha('Lead arquivado.');
    if (lead.etapa !== 'lead') throw new Falha(`A pesquisa só se refaz em Lead; este está em ${rotuloEtapa(lead.etapa)}. Use a ação de etapa.`);
    const base = { ...pesquisaDoLead(lead), falou_decisor: null, data: '', hora: '', agendou_reuniao: null, observacao: '' };
    const f = formDe(args, base);
    const a = analisar(f);
    if (a.falta.length) return { salvo: false, falta: a.falta, observacao: 'Nada foi gravado.' };
    ops = opsPesquisa(f, { lead, modo: 'retorno', filhos: d.leads.filter((l) => l.lead_pai_id === lead.id), agora: c.agora });
  } else {
    if (lead.arquivado) throw new Falha('Lead arquivado.');
    const possiveis = ACOES[lead.etapa]?.map((x) => x.valor) || [];
    if (!possiveis.includes(tipo)) {
      throw new Falha(`Em ${rotuloEtapa(lead.etapa)} os tipos possíveis são: ${['relacionamento', ...(lead.etapa === 'lead' ? ['retorno_pesquisa'] : []), ...possiveis].join(', ')}.`);
    }
    inteiro(args, 'veiculos', 1);
    const lista = MOTIVOS_PERDA[lead.etapa] || [];
    const m = String(args.motivo || '').trim();
    const conhecido = lista.find((x) => x !== 'Outro' && normalizar(x) === normalizar(m));
    const pedido = { acao: tipo, veiculos: args.veiculos, data: args.data || '', hora: args.hora || '', observacao: args.observacao || '',
      motivo: !m ? '' : conhecido || 'Outro', motivo_outro: conhecido || !m ? '' : m };
    const falta = faltaNoFollowup(lead.etapa, pedido);
    if (falta.length) return { salvo: false, falta, motivos_de_perda: tipo === 'perda' ? lista : undefined };
    ops = opsFollowup(lead, pedido, c.agora);
  }
  ops = await executar(ctx, d, ops, args.id_operacao);
  return respostaGravacao(d, ops, c);
}

async function agenda(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  conferir(args, 'inicio', 'data'); conferir(args, 'fim', 'data');
  const ini = args.inicio || c.hoje;
  const fim = args.fim || ini;
  if (fim < ini) throw new Falha('"fim" é antes de "inicio".');
  if (fim > somarDias(ini, 31)) throw new Falha('Peça no máximo 31 dias de cada vez.');
  const item = (l, extra) => ({ ...resumo(d, l, c), google_event_id: l.google_event_id || null, ...extra });
  const ativos = d.leads.filter((l) => !l.arquivado);
  const atrasados = ini <= c.hoje
    ? ativos.filter((l) => estaNaAgenda(l, c.hoje) && l.data_proximo_passo < c.hoje)
      .sort((a, b) => a.data_proximo_passo.localeCompare(b.data_proximo_passo))
      .map((l) => item(l, { tipo: TIPOS_PROXIMO[l.proximo_tipo] || null, era_para: l.data_proximo_passo, hora: l.hora_proximo_passo?.slice(0, 5) || null }))
    : [];
  const compromissos = ativos.filter((l) => l.data_proximo_passo >= ini && l.data_proximo_passo <= fim && estaNaAgenda(l, fim))
    .sort((a, b) => `${a.data_proximo_passo} ${a.hora_proximo_passo || '99'}`.localeCompare(`${b.data_proximo_passo} ${b.hora_proximo_passo || '99'}`))
    .map((l) => item(l, { tipo: TIPOS_PROXIMO[l.proximo_tipo] || null, data: l.data_proximo_passo, hora: l.hora_proximo_passo?.slice(0, 5) || null }));
  const retornos = ativos.map((l) => ({ l, r: voltaPorIntervalo(l, d.contatosDe(l.id), d.config, fim) })).filter((x) => x.r)
    .sort((a, b) => a.r.data.localeCompare(b.r.data))
    .map(({ l, r }) => item(l, { perfil: PERFIS[r.perfil], intervalo_dias: r.dias, volta_em: r.data, ultimo_contato: r.ultimo }));
  const frios = ativos.map((l) => ({ l, n: esfriando(l, d.contatosDe(l.id), c.dias, c.hoje) })).filter((x) => x.n)
    .sort((a, b) => b.n - a.n).map(({ l, n }) => item(l, { dias_sem_contato: n }));

  const dias = [];
  for (let x = ini; x <= fim; x = somarDias(x, 1)) dias.push(x);
  const ocupadosCrm = dias.flatMap((x) => ocupadosDoCRM(d.leads.filter((l) => !l.arquivado), x, c.agenda)
    .map((o) => ({ inicio: textoBrasilia(o.inicio), fim: textoBrasilia(o.fim) })));
  const r = {
    periodo: { inicio: ini, fim, hoje: c.hoje },
    atrasados, compromissos, retornos_por_intervalo: retornos, esfriando: frios,
    ocupados_pelo_crm: ocupadosCrm,
    horario_de_trabalho: c.agenda,
  };
  if (Array.isArray(args.ocupados_google)) {
    if (dias.length > 7) throw new Falha('Para horários livres, peça no máximo 7 dias.');
    const google = args.ocupados_google.map((o, i) => {
      const a = Date.parse(o?.inicio); const b = Date.parse(o?.fim);
      if (Number.isNaN(a) || Number.isNaN(b)) throw new Falha(`ocupados_google[${i}]: use inicio e fim com data, hora e fuso (ex.: 2026-11-12T14:00:00-03:00).`);
      return { inicio: entrar(a), fim: entrar(b) };
    });
    r.horarios_livres = Object.fromEntries(dias.map((x) => [x, horariosLivres(x, [...google, ...ocupadosDoCRM(d.leads.filter((l) => !l.arquivado), x, c.agenda)], c.agenda, c.agora)]));
    r.duracao_min = c.agenda.duracao;
  } else {
    r.horarios_livres = 'Para calcular, chame de novo com ocupados_google (os eventos do Google Agenda desses dias).';
  }
  return r;
}

const CAMPOS_FICHA = ['origem', 'indicado_por', 'cidade', 'falou_decisor', 'decisor_nome', 'decisor_whatsapp', 'n_veiculos', 'veiculos_mais',
  'n_segurados', 'seguradora', 'vencimento_seguro', 'nota_seguro', 'motivo_sem_seguro', 'bandeira', 'motivo_bandeira', 'motivo_nao', 'observacao', 'arquivado'];
const CAMPOS_PUBLICOS = ['cnpj', 'razao_social', 'nome_fantasia', 'situacao_cadastral', 'data_abertura', 'socios', 'cnae', 'porte', 'endereco',
  'telefones', 'instagram', 'maps_url', 'enriquecimento'];

async function fichaLead(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  let l;
  if (!vazio(args.lead_id)) l = acharLead(d, args.lead_id);
  else if (!vazio(args.nome)) {
    const exatos = d.leads.filter((x) => normalizar(x.empresa) === normalizar(args.nome));
    const achados = exatos.length ? exatos : d.leads.filter((x) => parecido(args.nome, x.empresa));
    if (!achados.length) return { encontrado: false, mensagem: `Nenhuma empresa parecida com "${args.nome}".` };
    if (achados.length > 1) return { encontrado: false, varios: achados.slice(0, 10).map((x) => resumo(d, x, c)), mensagem: 'Mais de uma empresa: confirme qual.' };
    [l] = achados;
  } else throw new Falha('Informe lead_id ou nome.');
  const cs = [...d.contatosDe(l.id)].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const acao = d.acoes.find((a) => a.id === l.acao_id);
  return {
    ...resumo(d, l, c),
    etapa: rotuloEtapa(l.etapa),
    pesquisa: Object.fromEntries(CAMPOS_FICHA.map((k) => [k, l[k] ?? null])),
    dados_publicos: l.enriquecido_em ? { ...Object.fromEntries(CAMPOS_PUBLICOS.map((k) => [k, l[k] ?? null])), enriquecido_em: textoBrasilia(new Date(l.enriquecido_em)) } : null,
    proximo_passo: l.data_proximo_passo ? { tipo: TIPOS_PROXIMO[l.proximo_tipo] || null, descricao: l.proximo_passo, data: l.data_proximo_passo, hora: l.hora_proximo_passo?.slice(0, 5) || null } : null,
    retorno_por_intervalo: (() => { const r = retornoPorIntervalo(l, cs, d.config); return r ? { perfil: PERFIS[r.perfil], intervalo_dias: r.dias, volta_em: r.data } : null; })(),
    google_event_id: l.google_event_id || null,
    acao_de_vendas: acao ? nomeDaAcao(acao) : null,
    abordado_em: textoBrasilia(new Date(l.criado_em)),
    historico: cs.map((x) => ({ quando: textoBrasilia(new Date(x.data)), evento: EVENTOS[x.evento] || x.evento, etapa: rotuloEtapa(x.etapa),
      falou_decisor: x.decisor, veiculos: x.veiculos, motivo: x.motivo, observacao: x.observacao })),
    relacionados: d.leads.filter((x) => x.id === l.lead_pai_id || x.lead_pai_id === l.id).map((x) => ({ ...resumo(d, x, c), relacao: x.id === l.lead_pai_id ? 'lead principal' : 'veículos segurados' })),
  };
}

async function buscarLeads(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  inteiro(args, 'min_veiculos', 0); inteiro(args, 'limite', 1, 50);
  const etapa = args.etapa ? String(args.etapa).toLowerCase() : null;
  const r = d.leads.filter((l) => (args.incluir_arquivados || !l.arquivado)
    && (!args.texto || parecido(args.texto, l.empresa) || normalizar(l.empresa).includes(normalizar(args.texto)) || normalizar(l.decisor_nome).includes(normalizar(args.texto)))
    && (!args.cidade || normalizar(l.cidade) === normalizar(args.cidade))
    && (!etapa || l.etapa === etapa)
    && (args.bandeira == null || !!l.bandeira === args.bandeira)
    && (args.min_veiculos == null || (l.n_veiculos ?? -1) >= args.min_veiculos))
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const limite = args.limite || 20;
  return { total: r.length, mostrando: Math.min(r.length, limite), leads: r.slice(0, limite).map((l) => resumo(d, l, c)) };
}

async function acaoDeVendas(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  const mostrar = (dd, a) => {
    const r = resumoAcao(a, dd.leads, dd.contatos);
    return { acao_id: a.id, nome: nomeDaAcao(a), cidade: a.cidade, rua: a.endereco, quando: textoPeriodoAcao(r, a),
      registros: r.registros, chegaram_a_mql: r.mql, chegaram_a_sql: r.sql, associados: r.associados };
  };
  if (args.operacao === 'criar') {
    if (vazio(args.cidade)) return { salvo: false, falta: ['Cidade'] };
    const ops = await executar(ctx, d, opsNovaAcao({ cidade: args.cidade, endereco: args.rua }, d.acoes, c.agora), args.id_operacao);
    const depois = aplicar(d, ops);
    return { salvo: true, ativa: mostrar(depois, acaoAtiva(depois.acoes)), finalizadas: ops.length - 1 };
  }
  const a = acaoAtiva(d.acoes);
  return a && !a.finalizada_em ? { ativa: mostrar(d, a) } : { ativa: null, mensagem: 'Nenhuma ação de vendas ativa.' };
}

async function corrigirLead(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  const lead = acharLead(d, args.lead_id);
  const { lead_id, id_operacao, data, hora, ...campos } = args;
  conferir(args, 'data', 'data'); conferir(args, 'hora', 'hora');
  if (!Object.keys(campos).length && vazio(data) && vazio(hora)) return { salvo: false, falta: ['O que corrigir'] };
  let ops = Object.keys(campos).length ? opsEditarLead(lead, formDe(campos, pesquisaDoLead(lead))) : [{ tabela: 'leads', linha: limparLead(lead) }];
  if (!vazio(data) || !vazio(hora)) {
    const linha = { ...ops[0].linha };
    if (!vazio(data)) linha.data_proximo_passo = data;
    if (!vazio(hora)) linha.hora_proximo_passo = hora;
    if (!linha.data_proximo_passo) throw new Falha('Para marcar hora, informe também a data.');
    if (!linha.proximo_tipo) Object.assign(linha, { proximo_tipo: 'retorno', proximo_passo: 'Retorno' });
    ops = [{ tabela: 'leads', linha }];
  }
  ops = await executar(ctx, d, ops, id_operacao);
  return respostaGravacao(d, ops, c);
}

async function numeros(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  conferir(args, 'referencia', 'data');
  const tipo = args.periodo === 'mes' ? 'mes' : 'semana';
  const p = periodo(tipo, args.referencia || c.hoje);
  const ids = args.cidade ? new Set(d.leads.filter((l) => normalizar(l.cidade) === normalizar(args.cidade)).map((l) => l.id)) : null;
  const f = funil(ids ? d.contatos.filter((x) => ids.has(x.lead_id)) : d.contatos, p);
  const metas = metasDo(d.config, tipo);
  const esperado = esperadoAteHoje(p, c.hoje);
  const real = { leads: f.leads, mql: f.mql, sql: f.sql, vendas: f.vendas, associados: f.associados };
  const ritmo = Object.fromEntries(Object.entries(metas).map(([k, m]) => [k, {
    meta: m, real: real[k], esperado_ate_hoje: m == null ? null : Math.round(m * esperado * 10) / 10,
    status: m == null ? 'sem meta' : real[k] >= m * esperado ? 'no ritmo' : 'abaixo do ritmo',
  }]));
  const pass = passagens(f, taxasDasMetas(metas, f.taxas.veic_por_cotacao));
  return {
    periodo: { tipo, de: p.ini, ate_antes_de: p.fim, rotulo: p.rotulo }, cidade: args.cidade || null,
    funil: f, ritmo,
    gargalo: pass.find((x) => x.gargalo)?.rotulo || null,
    passagens: pass.map(({ rotulo, real: r, esperada, amostra, poucos }) => ({ rotulo, real: r, esperada, amostra, amostra_pequena: poucos })),
    mercado: mercado(d.leads, d.contatos, p, args.cidade || null),
  };
}

async function dadosParaArquivo(args, ctx) {
  const d = await carregar(ctx.sb);
  const c = contexto(ctx, d);
  conferir(args, 'inicio', 'data'); conferir(args, 'fim', 'data');
  const ini = args.inicio || somarDias(c.hoje, -30);
  const fim = args.fim || c.hoje;
  const diaDe = (t) => hojeISO(new Date(t));
  const cs = d.contatos.filter((x) => diaDe(x.data) >= ini && diaDe(x.data) <= fim);
  const comContato = new Set(cs.map((x) => x.lead_id));
  const leads = d.leads.filter((l) => (comContato.has(l.id) || (diaDe(l.criado_em) >= ini && diaDe(l.criado_em) <= fim))
    && (!args.cidade || normalizar(l.cidade) === normalizar(args.cidade))
    && (!args.etapa || l.etapa === args.etapa));
  const ids = new Set(leads.map((l) => l.id));
  const nome = new Map(d.leads.map((l) => [l.id, l.empresa]));
  return {
    periodo: { inicio: ini, fim },
    leads: leads.map((l) => ({ lead_id: l.id, empresa: l.empresa, etapa: rotuloEtapa(l.etapa), ...Object.fromEntries(CAMPOS_FICHA.map((k) => [k, l[k] ?? null])),
      ...Object.fromEntries(CAMPOS_PUBLICOS.map((k) => [k, l[k] ?? null])),
      proximo_tipo: TIPOS_PROXIMO[l.proximo_tipo] || null, data_proximo_passo: l.data_proximo_passo, hora_proximo_passo: l.hora_proximo_passo?.slice(0, 5) || null,
      abordado_em: textoBrasilia(new Date(l.criado_em)) })),
    contatos: cs.filter((x) => ids.has(x.lead_id)).sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .map((x) => ({ empresa: nome.get(x.lead_id), lead_id: x.lead_id, quando: textoBrasilia(new Date(x.data)), evento: EVENTOS[x.evento] || x.evento,
        etapa: rotuloEtapa(x.etapa), falou_decisor: x.decisor, veiculos: x.veiculos, motivo: x.motivo, observacao: x.observacao })),
  };
}

async function vincularEvento(args, ctx) {
  const d = await carregar(ctx.sb);
  const lead = acharLead(d, args.lead_id);
  const id = vazio(args.google_event_id) ? null : String(args.google_event_id).trim();
  await executar(ctx, d, [{ tabela: 'leads', linha: { ...limparLead(lead), google_event_id: id } }], args.id_operacao);
  return { salvo: true, lead_id: lead.id, empresa: lead.empresa, google_event_id: id };
}

// ---------- definições (o que o Claude vê) ----------
const ID_OP = { type: 'string', description: 'Só para repetir uma gravação que falhou no meio: o id_operacao que veio no erro. Não invente.' };
const DATA = { type: 'string', description: 'AAAA-MM-DD' };
const HORA = { type: 'string', description: 'HH:MM (24h, horário de Brasília)' };
const PESQUISA = {
  falou_decisor: { type: 'boolean', description: 'Falou com quem decide sobre os veículos?' },
  decisor_nome: { type: 'string' }, decisor_whatsapp: { type: 'string', description: 'Só números, com DDD' },
  veiculos: { type: 'integer', minimum: 0, description: 'Quantos veículos a empresa tem' },
  veiculos_mais: { type: 'boolean', description: 'true se só sabe que são 4 ou mais (sem o número exato)' },
  segurados: { type: 'integer', minimum: 0, description: 'Quantos desses têm seguro/proteção' },
  motivo_sem_seguro: { type: 'string', description: `Por que não protegeu: ${MOTIVOS_SEM_SEGURO.filter((x) => x !== 'Outro').join(' | ')} | outro texto` },
  agendou_reuniao: { type: 'boolean', description: 'Se há veículo sem seguro: marcou reunião?' },
  seguradora: { type: 'string' }, vencimento: { type: 'string', description: 'Mês do vencimento do seguro, AAAA-MM' },
  nota: { type: 'integer', minimum: 0, maximum: 5, description: 'Nota de 0 a 5 que o cliente dá ao seguro atual' },
  data: { ...DATA, description: 'Data do retorno/reunião (AAAA-MM-DD)' }, hora: HORA,
  observacao: { type: 'string', description: 'Anotação do vendedor, com as palavras dele' },
  criar_lead_segurados: { type: 'boolean', description: 'Parte segurada: criar um 2º lead só com os segurados para o vencimento (padrão true)' },
};
const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const FERRAMENTAS = [
  {
    name: 'registrar_visita', title: 'Registrar visita', annotations: ESCRITA, executar: registrarVisita,
    description: 'Registra a visita (abordagem) a uma empresa NOVA na ação de vendas ativa; a cidade vem da ação. '
      + 'Confirme com o usuário (leia de volta) antes de chamar. Se faltar algo, devolve "falta" sem gravar. '
      + 'Se houver empresa de nome parecido, devolve "parecidos" sem gravar. Depois de salvo, devolve o que fazer no Google Agenda.',
    inputSchema: obj({
      empresa: { type: 'string' }, origem: { type: 'string', enum: ['abordagem', 'indicacao'] }, indicado_por: { type: 'string' },
      ...PESQUISA, mesmo_assim_nova: { type: 'boolean', description: 'true só depois que o usuário confirmar que não é a mesma empresa dos "parecidos"' },
      id_operacao: ID_OP,
    }, ['empresa']),
  },
  {
    name: 'registrar_contato', title: 'Registrar contato', annotations: ESCRITA, executar: registrarContato,
    description: 'Registra um contato com um lead que já existe. tipo: "relacionamento" (anotação curta + próxima data opcional; não muda a etapa); '
      + '"retorno_pesquisa" (só em Lead: refaz a pesquisa da visita); ou a ação da etapa: em MQL "sql" (reunião feita, em cotação; veiculos cotados), '
      + '"no_show" (reunião não aconteceu; nova data e hora), "retorno" (remarcar), "perda"; em SQL "venda" (veiculos vendidos), "retorno" (seguir negociando), "perda"; '
      + 'em Venda "associado" (contrato assinado; veiculos), "retorno" (cobrar assinatura), "perda". Confirme com o usuário antes. '
      + 'Devolve o que fazer no Google Agenda (criar, mover ou cancelar).',
    inputSchema: obj({
      lead_id: { type: 'string' },
      tipo: { type: 'string', enum: ['relacionamento', 'retorno_pesquisa', 'sql', 'no_show', 'retorno', 'venda', 'associado', 'perda'] },
      ...PESQUISA,
      veiculos: { type: 'integer', minimum: 0, description: 'Em retorno_pesquisa: veículos da empresa. Em sql/venda/associado: veículos cotados/vendidos/no contrato.' },
      motivo: { type: 'string', description: 'Na perda: o motivo, com as palavras do usuário' },
      id_operacao: ID_OP,
    }, ['lead_id', 'tipo']),
  },
  {
    name: 'agenda', title: 'Quem procurar', annotations: LEITURA, executar: agenda,
    description: 'Quem procurar num dia ou intervalo (padrão: hoje): atrasados, compromissos marcados (com hora), retornos por intervalo de relacionamento e '
      + 'negociações esfriando, cada um com a situação do lead. Mostra os horários já ocupados pelo CRM. Para oferecer horários livres, '
      + 'leia antes os eventos do Google Agenda desses dias e passe-os em ocupados_google. Só leitura; não sugere o que fazer.',
    inputSchema: obj({
      inicio: DATA, fim: DATA,
      ocupados_google: { type: 'array', description: 'Eventos ocupados do Google Agenda no período', items: obj({ inicio: { type: 'string', description: 'ISO com fuso' }, fim: { type: 'string' } }, ['inicio', 'fim']) },
    }),
  },
  {
    name: 'ficha_lead', title: 'Ficha do lead', annotations: LEITURA, executar: fichaLead,
    description: 'Tudo sobre um lead: situação, pesquisa, dados públicos (enriquecimento), etapa, histórico de contatos, próximo passo, retorno por intervalo e id do evento no Google. Por lead_id ou nome.',
    inputSchema: obj({ lead_id: { type: 'string' }, nome: { type: 'string' } }),
  },
  {
    name: 'buscar_leads', title: 'Buscar leads', annotations: LEITURA, executar: buscarLeads,
    description: 'Lista resumida de leads por texto (nome da empresa ou do decisor, tolera nomes parecidos), cidade, etapa, bandeira e nº mínimo de veículos.',
    inputSchema: obj({
      texto: { type: 'string' }, cidade: { type: 'string' },
      etapa: { type: 'string', enum: ['lead', 'mql', 'sql', 'venda', 'associado', 'perdido'] },
      bandeira: { type: 'boolean', description: 'true: só com 🚩; false: só sem' }, min_veiculos: { type: 'integer', minimum: 0 },
      incluir_arquivados: { type: 'boolean' }, limite: { type: 'integer', minimum: 1, maximum: 50 },
    }),
  },
  {
    name: 'acao_de_vendas', title: 'Ação de vendas', annotations: ESCRITA, executar: acaoDeVendas,
    description: 'operacao "consultar": mostra a ação de vendas ativa (cidade/rua da prospecção) e o resumo. operacao "criar": cria uma nova (finaliza as abertas); confirme antes.',
    inputSchema: obj({ operacao: { type: 'string', enum: ['consultar', 'criar'] }, cidade: { type: 'string' }, rua: { type: 'string' }, id_operacao: ID_OP }, ['operacao']),
  },
  {
    name: 'corrigir_lead', title: 'Corrigir lead', annotations: ESCRITA, executar: corrigirLead,
    description: 'Corrige dados de um lead sem criar evento no funil (nome, decisor, WhatsApp, veículos, seguro, observação) ou a data/hora do próximo passo. '
      + 'Mande só os campos a corrigir. Confirme antes. Se a data/hora mudar, devolve o evento do Google a mover.',
    inputSchema: obj({
      lead_id: { type: 'string' }, empresa: { type: 'string' }, origem: { type: 'string', enum: ['abordagem', 'indicacao'] }, indicado_por: { type: 'string' },
      ...Object.fromEntries(Object.entries(PESQUISA).filter(([k]) => !['agendou_reuniao', 'criar_lead_segurados'].includes(k))),
      data: { ...DATA, description: 'Nova data do próximo passo' }, hora: { ...HORA, description: 'Nova hora do próximo passo' },
      id_operacao: ID_OP,
    }, ['lead_id']),
  },
  {
    name: 'numeros', title: 'Números', annotations: LEITURA, executar: numeros,
    description: 'Funil (Lead > MQL > SQL > Venda > Associado), metas e ritmo, gargalo e leitura do mercado (seguradoras, notas, motivos) da semana ou do mês.',
    inputSchema: obj({ periodo: { type: 'string', enum: ['semana', 'mes'] }, referencia: { ...DATA, description: 'Um dia do período (padrão: hoje)' }, cidade: { type: 'string' } }),
  },
  {
    name: 'dados_para_arquivo', title: 'Dados para planilha', annotations: LEITURA, executar: dadosParaArquivo,
    description: 'Linhas de leads e contatos de um período (padrão: últimos 30 dias) para montar planilha ou documento na conversa.',
    inputSchema: obj({ inicio: DATA, fim: DATA, cidade: { type: 'string' }, etapa: { type: 'string', enum: ['lead', 'mql', 'sql', 'venda', 'associado', 'perdido'] } }),
  },
  {
    name: 'vincular_evento', title: 'Vincular evento do Google', annotations: { ...ESCRITA, idempotentHint: true }, executar: vincularEvento,
    description: 'Guarda no lead o id do evento do Google Agenda que você criou (ou limpa com null depois de cancelar).',
    inputSchema: obj({ lead_id: { type: 'string' }, google_event_id: { type: ['string', 'null'] }, id_operacao: ID_OP }, ['lead_id', 'google_event_id']),
  },
];

// Executa uma ação. Erros esperados viram resposta de erro clara (isError), sem detalhes internos.
export async function chamar(nome, args, ctx) {
  const t = FERRAMENTAS.find((x) => x.name === nome);
  if (!t) return { erro: `Ação desconhecida: ${nome}` };
  try {
    return { resultado: await t.executar(args || {}, ctx) };
  } catch (e) {
    if (e instanceof Falha) return { erro: e.message };
    return { erro: `Erro inesperado: ${e?.message || e}. Nada foi confirmado como salvo.` };
  }
}
