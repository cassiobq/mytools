// Fatos do período para o relatório: tudo calculado aqui, sem IA. A IA só escreve o texto a partir disto.
// JavaScript puro (roda no Deno da Edge Function e no Node dos testes).

const ROT = {
  origem: { abordagem: 'Abordagem', indicacao: 'Indicação' },
  tipo: { PF: 'PF', frota: 'Frota' },
  estrategia: { visita_agenda: 'Visita p/ agendar', visita_fecha: 'Visita p/ fechar', ligacao: 'Ligação' },
  resultado: { sem_interesse: 'Sem interesse', agendou: 'Agendou', cotacao: 'Cotação', venda: 'Venda' },
  faixa_cadencia: { '1_dono_ausente': 'Dono ausente', '2_ja_tem_seguro': 'Já tem seguro', '3_recusou': 'Recusou', '4_interessado': 'Interessado', indicacao: 'Indicação' },
};
export const rot = (campo, v) => (v == null ? null : ROT[campo]?.[v] ?? v);

// Datas e horas no horário de Brasília (o servidor roda em UTC).
const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
export const diaBR = (ts) => fmtDia.format(new Date(ts)); // AAAA-MM-DD
export const horaBR = (ts) => fmtHora.format(new Date(ts)).replace(':', 'h'); // 08h57
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

// inicio/fim: "AAAA-MM-DD" (inclusive), no horário de Brasília.
export function montarFatos(leads, contatos, inicio, fim) {
  const noPeriodo = (ts) => { const d = diaBR(ts); return d >= inicio && d <= fim; };
  const porLead = new Map();
  for (const c of contatos) {
    if (!noPeriodo(c.data)) continue;
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
      tipo: rot('tipo', l.tipo),
      n_veiculos: l.n_veiculos,
      origem: rot('origem', l.origem),
      indicado_por: l.indicado_por,
      estrategia: rot('estrategia', l.estrategia),
      falou_decisor: l.falou_decisor,
      primeira_visita_no_periodo: diaBR(l.criado_em) >= inicio && diaBR(l.criado_em) <= fim,
      resultado_atual: rot('resultado', l.resultado),
      situacao_atual: rot('faixa_cadencia', l.faixa_cadencia),
      motivo_nao: l.motivo_nao,
      vencimento_seguro: dataBR(l.vencimento_seguro),
      proximo_passo: l.proximo_passo,
      data_proximo_passo: dataBR(l.data_proximo_passo),
      arquivado: l.arquivado,
      contatos: cs.map((c) => ({ data: dataBR(diaBR(c.data)), hora: horaBR(c.data), resultado: rot('resultado', c.resultado), observacao: c.observacao })),
    }));

  const temContato = (e, r) => e.contatos.some((c) => c.resultado === r);
  const frotas = empresas.filter((e) => e.tipo === 'Frota');
  const cidades = [...new Set(empresas.map((e) => e.cidade).filter(Boolean))];
  const motivos = {};
  for (const e of empresas) if (e.resultado_atual === 'Sem interesse' && e.motivo_nao) motivos[e.motivo_nao] = (motivos[e.motivo_nao] || 0) + 1;
  const porCidade = Object.fromEntries(cidades.map((c) => [c, empresas.filter((e) => e.cidade === c).length]));
  const numeros = {
    empresas_contatadas: empresas.length,
    contatos_registrados: empresas.reduce((n, e) => n + e.contatos.length, 0),
    empresas_novas: empresas.filter((e) => e.primeira_visita_no_periodo).length,
    retornos_a_empresas_antigas: empresas.filter((e) => !e.primeira_visita_no_periodo).length,
    frotas: frotas.length,
    veiculos_nas_frotas: frotas.reduce((n, e) => n + (e.n_veiculos || 0), 0),
    falou_com_decisor: empresas.filter((e) => e.falou_decisor === true).length,
    indicacoes_recebidas: empresas.filter((e) => e.origem === 'Indicação' && e.primeira_visita_no_periodo).length,
    cotacoes: empresas.filter((e) => temContato(e, 'Cotação')).length,
    vendas: empresas.filter((e) => temContato(e, 'Venda')).length,
    veiculos_vendidos: empresas.filter((e) => temContato(e, 'Venda')).reduce((n, e) => n + (e.n_veiculos || 1), 0),
    sem_interesse: empresas.filter((e) => e.resultado_atual === 'Sem interesse').length,
    motivos_sem_interesse: motivos,
    empresas_por_cidade: porCidade,
  };
  const dias = [...new Set(empresas.flatMap((e) => e.contatos.map((c) => c.data)))];
  return { periodo: { inicio: dataBR(inicio), fim: dataBR(fim), dias_com_atividade: dias.length }, cidades, numeros, empresas };
}
