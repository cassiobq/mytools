// Etapas do funil e o follow-up depois do MQL. O funil anda só pelas ações do vendedor:
// Lead (abordagem) > MQL (2ª reunião agendada) > SQL (em cotação, em veículos) > Venda (veículos) > Associado (contrato, veículos).
import { limparLead } from './pesquisa.js';
import { hojeISO, somarDias } from './datas.js';

export const ETAPAS = [
  { valor: 'lead', rotulo: 'Lead' },
  { valor: 'mql', rotulo: 'MQL' },
  { valor: 'sql', rotulo: 'SQL' },
  { valor: 'venda', rotulo: 'Venda' },
  { valor: 'associado', rotulo: 'Associado' },
  { valor: 'perdido', rotulo: 'Perdido' },
];
export const rotuloEtapa = (v) => ETAPAS.find((e) => e.valor === v)?.rotulo ?? '';

export const TIPOS_PROXIMO = { retorno: 'Retorno', reuniao: 'Reunião', vencimento: 'Vencimento', negociacao: 'Negociação', contrato: 'Contrato' };

export const EVENTOS = {
  abordagem: 'Abordagem', retorno: 'Retorno', mql: 'Reunião agendada (MQL)', no_show: 'Reunião não aconteceu',
  sql: 'Em cotação (SQL)', venda: 'Venda fechada', associado: 'Contrato assinado', perda: 'Sem interesse', reativacao: 'Reativado',
};

// Motivos de perda por etapa (sempre com "Outro" + texto).
export const MOTIVOS_PERDA = {
  lead: ['Não quis agendar reunião', 'Sem interesse', 'Outro'],
  mql: ['Desmarcou e não remarcou', 'Não compareceu de novo', 'Sem interesse', 'Outro'],
  sql: ['Preço', 'Fechou com concorrente', 'Sem retorno', 'Cobertura não atende', 'Outro'],
  venda: ['Desistiu antes de assinar', 'Reprovado na vistoria', 'Documentação', 'Outro'],
};

// Ações possíveis no follow-up, por etapa atual.
//   veiculos: pede nº de veículos; proxima: pede data (e hora) do próximo passo; motivo: pede motivo de perda.
export const ACOES = {
  mql: [
    { valor: 'sql', rotulo: 'Reunião feita → em cotação', veiculos: 'Veículos cotados', proxima: 'negociacao' },
    { valor: 'no_show', rotulo: 'Reunião não aconteceu', proxima: 'reuniao' },
    { valor: 'retorno', rotulo: 'Remarcar', proxima: 'reuniao' },
    { valor: 'perda', rotulo: 'Sem interesse', motivo: true },
  ],
  sql: [
    { valor: 'venda', rotulo: 'Fechou venda', veiculos: 'Veículos vendidos', proxima: 'contrato' },
    { valor: 'retorno', rotulo: 'Seguir negociando', proxima: 'negociacao' },
    { valor: 'perda', rotulo: 'Sem interesse', motivo: true },
  ],
  venda: [
    { valor: 'associado', rotulo: 'Contrato assinado', veiculos: 'Veículos no contrato' },
    { valor: 'retorno', rotulo: 'Cobrar assinatura', proxima: 'contrato' },
    { valor: 'perda', rotulo: 'Desistiu', motivo: true },
  ],
};
const ETAPA_DEPOIS = { sql: 'sql', venda: 'venda', associado: 'associado', perda: 'perdido' };
const PASSO = { reuniao: 'Reunião', negociacao: 'Retorno da cotação', contrato: 'Assinatura do contrato' };

// Cadência padrão (dias) por tipo de próximo passo; editável em Configurações.
export const CADENCIA_PADRAO = { retorno: 3, reuniao: 2, negociacao: 2, contrato: 3 };
export const ATALHOS_DIAS = [1, 2, 3, 7];
export const cadencia = (config) => ({ ...CADENCIA_PADRAO, ...(config?.metas?.cadencia || {}) });
export const sugerirData = (tipo, config, hoje = hojeISO()) => somarDias(hoje, cadencia(config)[tipo] ?? 3);

export function faltaNoFollowup(etapa, c) {
  const acao = ACOES[etapa]?.find((x) => x.valor === c.acao);
  if (!acao) return ['O que aconteceu?'];
  const f = [];
  if (acao.veiculos && !(Number(c.veiculos) > 0)) f.push(acao.veiculos);
  if (acao.proxima && !c.data) f.push('Data do próximo passo');
  if (acao.proxima === 'reuniao' && !c.hora) f.push('Hora da reunião');
  if (acao.motivo && (!c.motivo || (c.motivo === 'Outro' && !c.motivo_outro?.trim()))) f.push('Motivo');
  return f;
}

export function opsFollowup(lead, c, agora = new Date()) {
  const etapa = lead.etapa;
  const acao = ACOES[etapa].find((x) => x.valor === c.acao);
  const falta = faltaNoFollowup(etapa, c);
  if (falta.length) throw new Error(`Falta responder: ${falta.join(', ')}`);
  const motivo = acao.motivo ? (c.motivo === 'Outro' ? c.motivo_outro.trim() : c.motivo) : null;
  const obs = c.observacao?.trim() || null;
  const contato = {
    id: crypto.randomUUID(), lead_id: lead.id, data: agora.toISOString(), etapa, evento: c.acao,
    veiculos: acao.veiculos ? Number(c.veiculos) : null, decisor: null, motivo, resultado: null, observacao: obs,
  };
  const novo = { ...limparLead(lead), etapa: ETAPA_DEPOIS[c.acao] || etapa, observacao: obs ?? lead.observacao };
  if (acao.proxima) Object.assign(novo, { proximo_tipo: acao.proxima, data_proximo_passo: c.data, hora_proximo_passo: c.hora || null, proximo_passo: PASSO[acao.proxima] });
  else Object.assign(novo, { proximo_tipo: null, data_proximo_passo: null, hora_proximo_passo: null, proximo_passo: null });
  if (c.acao === 'perda') novo.motivo_nao = motivo;
  return [{ tabela: 'contatos', linha: contato }, { tabela: 'leads', linha: novo }];
}

// Reativar um lead com bandeira ou perdido: volta a Lead, com retorno hoje.
export function opsReativar(lead, agora = new Date()) {
  const contato = { id: crypto.randomUUID(), lead_id: lead.id, data: agora.toISOString(), etapa: lead.etapa, evento: 'reativacao', resultado: null, observacao: null, veiculos: null, decisor: null, motivo: null };
  const novo = { ...limparLead(lead), etapa: 'lead', bandeira: false, motivo_bandeira: null, arquivado: false,
    proximo_tipo: 'retorno', data_proximo_passo: hojeISO(agora), hora_proximo_passo: null, proximo_passo: 'Reativar abordagem' };
  return [{ tabela: 'contatos', linha: contato }, { tabela: 'leads', linha: novo }];
}

export const opsArquivar = (lead, arquivado = true) => [{ tabela: 'leads', linha: { ...limparLead(lead), arquivado } }];

// Lead que aparece na aba Hoje: retorno vencido ou de hoje. Bandeira só volta pelo vencimento do seguro.
export function estaNaAgenda(l, hoje = hojeISO()) {
  if (l.arquivado || !l.data_proximo_passo || l.data_proximo_passo > hoje) return false;
  if (l.etapa === 'associado' || l.etapa === 'perdido') return false;
  if (l.bandeira && l.proximo_tipo !== 'vencimento') return false;
  return true;
}

// Em negociação (MQL/SQL/Venda) sem contato há mais de N dias e sem retorno marcado para hoje ou antes.
export function esfriando(l, contatosDoLead, dias, hoje = hojeISO()) {
  if (l.arquivado || !['mql', 'sql', 'venda'].includes(l.etapa) || estaNaAgenda(l, hoje)) return null;
  const ultimo = contatosDoLead.reduce((m, c) => (String(c.data) > m ? String(c.data) : m), '');
  if (!ultimo) return null;
  const d = Math.floor((new Date(`${hoje}T12:00:00`) - new Date(ultimo)) / 86400000);
  return d > dias ? d : null;
}

// Tentativas seguidas sem encontrar o decisor (para o aviso da 3ª tentativa).
export function tentativasSemDecisor(contatosDoLead) {
  const cs = [...contatosDoLead].filter((c) => c.decisor != null).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  let n = 0;
  for (const c of cs) n = c.decisor === false ? n + 1 : 0;
  return n;
}
