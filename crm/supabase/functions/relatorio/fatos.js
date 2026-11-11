// Fatos do período para o relatório: tudo calculado aqui, sem IA. A IA só escreve o texto a partir disto.
// JavaScript puro (roda no Deno da Edge Function e no Node dos testes).
// Funil v2: Lead (abordagem) > MQL (2ª reunião) > SQL (em cotação, veículos) > Venda (veículos) > Associado (veículos).

const ROT = {
  origem: { abordagem: 'Abordagem', indicacao: 'Indicação' },
  etapa: { lead: 'Lead', mql: 'MQL', sql: 'SQL', venda: 'Venda', associado: 'Associado', perdido: 'Perdido' },
  evento: {
    abordagem: 'Abordagem', retorno: 'Retorno', mql: 'Reunião agendada (MQL)', no_show: 'Reunião não aconteceu',
    sql: 'Em cotação (SQL)', venda: 'Venda fechada', associado: 'Contrato assinado', perda: 'Sem interesse', reativacao: 'Reativado',
  },
  proximo_tipo: { retorno: 'Retorno', reuniao: 'Reunião', vencimento: 'Vencimento do seguro', negociacao: 'Retorno da cotação', contrato: 'Assinatura do contrato' },
};
export const rot = (campo, v) => (v == null ? null : ROT[campo]?.[v] ?? v);

// Datas e horas no horário de Brasília (o servidor roda em UTC).
const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
export const diaBR = (ts) => fmtDia.format(new Date(ts)); // AAAA-MM-DD
export const horaBR = (ts) => fmtHora.format(new Date(ts)).replace(':', 'h'); // 08h57
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);
const mesBR = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// inicio/fim: "AAAA-MM-DD" (inclusive), no horário de Brasília.
export function montarFatos(leads, contatos, inicio, fim) {
  const noPeriodo = (ts) => { const d = diaBR(ts); return d >= inicio && d <= fim; };
  const doPeriodo = contatos.filter((c) => noPeriodo(c.data));
  const porLead = new Map();
  for (const c of doPeriodo) {
    if (!porLead.has(c.lead_id)) porLead.set(c.lead_id, []);
    porLead.get(c.lead_id).push(c);
  }
  const leadsPorId = new Map(leads.map((l) => [l.id, l]));
  const empresas = [...porLead.entries()]
    .map(([id, cs]) => ({ lead: leadsPorId.get(id), cs: cs.sort((a, b) => String(a.data).localeCompare(String(b.data))) }))
    .filter((x) => x.lead)
    .sort((a, b) => String(a.cs[0].data).localeCompare(String(b.cs[0].data)))
    .map(({ lead: l, cs }) => ({
      id: l.id,
      empresa: l.empresa,
      cidade: l.cidade,
      origem: rot('origem', l.origem),
      indicado_por: l.indicado_por,
      decisor: l.decisor_nome,
      falou_decisor: l.falou_decisor,
      veiculos: l.n_veiculos == null ? null : l.veiculos_mais ? `${l.n_veiculos} ou mais` : l.n_veiculos,
      veiculos_segurados: l.n_segurados,
      veiculos_sem_seguro: l.n_veiculos != null && l.n_segurados != null ? Math.max(0, l.n_veiculos - l.n_segurados) : null,
      por_que_nao_protegeu: l.motivo_sem_seguro,
      seguradora: l.seguradora,
      vencimento_seguro: mesBR(l.vencimento_seguro),
      nota_seguro_0a5: l.nota_seguro,
      fora_do_perfil: l.bandeira ? l.motivo_bandeira || 'Sim' : null,
      etapa_atual: rot('etapa', l.etapa),
      motivo_perda: l.etapa === 'perdido' ? l.motivo_nao : null,
      proximo_passo: rot('proximo_tipo', l.proximo_tipo) || l.proximo_passo,
      data_proximo_passo: dataBR(l.data_proximo_passo),
      lead_dos_segurados_de: l.lead_pai_id ? leadsPorId.get(l.lead_pai_id)?.empresa || null : null,
      arquivado: l.arquivado,
      primeira_visita_no_periodo: cs.some((c) => c.evento === 'abordagem'),
      contatos: cs.map((c) => ({
        data: dataBR(diaBR(c.data)), hora: horaBR(c.data), evento: rot('evento', c.evento),
        veiculos: c.veiculos, falou_com_decisor: c.decisor, motivo: c.motivo, observacao: c.observacao,
      })),
    }));

  const comEvento = (ev) => new Set(doPeriodo.filter((c) => c.evento === ev).map((c) => c.lead_id));
  const somaVeic = (ev) => doPeriodo.filter((c) => c.evento === ev).reduce((n, c) => n + (c.veiculos || 0), 0);
  const ultSql = new Map(doPeriodo.filter((c) => c.evento === 'sql').sort((a, b) => String(a.data).localeCompare(String(b.data))).map((c) => [c.lead_id, c.veiculos || 0]));
  const funil = {
    leads_empresas_abordadas: comEvento('abordagem').size,
    retornos: doPeriodo.filter((c) => c.evento === 'retorno').length,
    mql_reunioes_agendadas: comEvento('mql').size,
    reunioes_que_nao_aconteceram: doPeriodo.filter((c) => c.evento === 'no_show').length,
    sql_empresas_em_cotacao: ultSql.size,
    sql_veiculos_cotados: [...ultSql.values()].reduce((a, b) => a + b, 0),
    vendas_empresas: comEvento('venda').size,
    vendas_veiculos: somaVeic('venda'),
    associados_empresas: comEvento('associado').size,
    associados_veiculos: somaVeic('associado'),
  };
  funil.taxa_lead_mql_pct = pct(funil.mql_reunioes_agendadas, funil.leads_empresas_abordadas);
  funil.taxa_mql_sql_pct = pct(funil.sql_empresas_em_cotacao, funil.mql_reunioes_agendadas);
  funil.taxa_sql_venda_veiculos_pct = pct(funil.vendas_veiculos, funil.sql_veiculos_cotados);
  funil.taxa_venda_associado_veiculos_pct = pct(funil.associados_veiculos, funil.vendas_veiculos);

  const perdas = {};
  for (const c of doPeriodo.filter((x) => x.evento === 'perda')) {
    const k = `${rot('etapa', c.etapa || 'lead')}: ${c.motivo || 'sem motivo'}`;
    perdas[k] = (perdas[k] || 0) + 1;
  }

  // Leitura do mercado: empresas abordadas no período em que se falou com o decisor.
  const abordadas = [...comEvento('abordagem')].map((id) => leadsPorId.get(id)).filter((l) => l && !l.lead_pai_id);
  const pesq = abordadas.filter((l) => l.falou_decisor && l.n_veiculos != null);
  const comV = pesq.filter((l) => l.n_veiculos > 0);
  const seg = (l) => Math.min(l.n_segurados ?? 0, l.n_veiculos);
  const porSeg = {};
  for (const l of comV.filter((x) => seg(x) > 0)) {
    const n = (l.seguradora || 'Não informada').trim();
    porSeg[n] ??= { empresas: 0, veiculos: 0, notas: [] };
    porSeg[n].empresas++; porSeg[n].veiculos += seg(l);
    if (l.nota_seguro != null) porSeg[n].notas.push(l.nota_seguro);
  }
  const motivos = {};
  for (const l of comV.filter((x) => seg(x) < x.n_veiculos && x.motivo_sem_seguro)) motivos[l.motivo_sem_seguro] = (motivos[l.motivo_sem_seguro] || 0) + 1;
  const notas = comV.filter((l) => seg(l) > 0 && l.nota_seguro != null).map((l) => l.nota_seguro);
  const veiculos = comV.reduce((n, l) => n + l.n_veiculos, 0);
  const segurados = comV.reduce((n, l) => n + seg(l), 0);
  const mercado = {
    empresas_com_decisor_pesquisadas: pesq.length,
    empresas_sem_veiculos: pesq.length - comV.length,
    empresas_com_veiculos: comV.length,
    veiculos_mapeados: veiculos,
    veiculos_segurados: segurados,
    veiculos_sem_seguro: veiculos - segurados,
    empresas_com_toda_frota_segurada: comV.filter((l) => seg(l) === l.n_veiculos).length,
    empresas_com_parte_segurada: comV.filter((l) => seg(l) > 0 && seg(l) < l.n_veiculos).length,
    empresas_sem_nenhum_seguro: comV.filter((l) => seg(l) === 0).length,
    nota_media_seguro_atual: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null,
    satisfeitos_nota_4_ou_5: notas.filter((n) => n >= 4).length,
    seguradoras: Object.entries(porSeg).sort((a, b) => b[1].empresas - a[1].empresas).map(([nome, x]) => ({
      nome, empresas: x.empresas, veiculos: x.veiculos,
      nota_media: x.notas.length ? Math.round((x.notas.reduce((a, b) => a + b, 0) / x.notas.length) * 10) / 10 : null,
    })),
    por_que_nao_protegeram: motivos,
    fora_do_perfil: abordadas.filter((l) => l.bandeira).length,
  };

  const cidades = [...new Set(empresas.map((e) => e.cidade).filter(Boolean))];
  const numeros = {
    ...funil,
    perdas_por_etapa_e_motivo: perdas,
    empresas_por_cidade: Object.fromEntries(cidades.map((c) => [c, empresas.filter((e) => e.cidade === c).length])),
    indicacoes_recebidas: abordadas.filter((l) => l.origem === 'indicacao').length,
  };
  const dias = [...new Set(empresas.flatMap((e) => e.contatos.map((c) => c.data)))];
  return { periodo: { inicio: dataBR(inicio), fim: dataBR(fim), dias_com_atividade: dias.length }, cidades, numeros, mercado, empresas };
}
