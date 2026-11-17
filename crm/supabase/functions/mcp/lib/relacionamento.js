// Relacionamento: leads sem data marcada voltam sozinhos à agenda, por intervalo (dias) conforme o perfil,
// e o contato curto (anotação + próxima data) que não mexe na etapa do funil.
//
// Perfis (config.relacionamento, editável):
//   sem_seguro   algum veículo sem seguro               15 dias
//   insatisfeito todos segurados, nota 0-3               30 dias (ou o vencimento, se vier antes)
//   satisfeito   🚩 nota 4-5                             só no vencimento (null)
//   perdido      etapa Perdido                           90 dias
//   associado    etapa Associado                         90 dias
// Fora: arquivado, 🚩 que não seja "satisfeito" (ex.: sem veículos), negociação (MQL/SQL/Venda: datas + esfriando).
// Data marcada pelo usuário (próximo passo que não é o vencimento) sempre vale mais: aí não há intervalo.
import { limparLead, NOTA_SATISFEITO, BANDEIRA_SATISFEITO } from './pesquisa.js';
import { hojeISO, paraISO, somarDias } from './datas.js';
import { estaNaAgenda } from './etapas.js';

export const RELACIONAMENTO_PADRAO = { sem_seguro: 15, insatisfeito: 30, satisfeito: null, perdido: 90, associado: 90 };
export const PERFIS = { sem_seguro: 'Sem seguro', insatisfeito: 'Insatisfeito com o seguro', satisfeito: 'Satisfeito com o seguro', perdido: 'Perdido', associado: 'Associado' };
export const relacionamentoDe = (config) => ({ ...RELACIONAMENTO_PADRAO, ...(config?.relacionamento || {}) });

export function perfilRelacionamento(l) {
  if (l.arquivado) return null;
  if (l.bandeira && l.motivo_bandeira !== BANDEIRA_SATISFEITO) return null;
  if (l.etapa === 'perdido') return 'perdido';
  if (l.etapa === 'associado') return 'associado';
  if (l.etapa !== 'lead') return null;
  if (l.n_veiculos > 0 && l.n_segurados != null && l.n_segurados < l.n_veiculos) return 'sem_seguro';
  if (l.bandeira) return 'satisfeito';
  if (l.nota_seguro != null) return l.nota_seguro >= NOTA_SATISFEITO ? 'satisfeito' : 'insatisfeito';
  return null;
}

// Dia (AAAA-MM-DD, fuso do aparelho) do último contato; sem contato, o dia em que o lead foi criado.
export function ultimoContato(l, contatosDoLead = []) {
  const ultimo = contatosDoLead.reduce((m, c) => (String(c.data) > m ? String(c.data) : m), '');
  const quando = ultimo || l.criado_em;
  return quando ? paraISO(new Date(quando)) : null;
}

// Próximo dia 1 do mês do vencimento depois de uma data (o vencimento se repete todo ano).
export function proximoVencimento(vencimento, depoisDe) {
  if (!vencimento) return null;
  let [a, m] = vencimento.slice(0, 7).split('-').map(Number);
  let d = `${a}-${String(m).padStart(2, '0')}-01`;
  while (d <= depoisDe) d = `${++a}-${String(m).padStart(2, '0')}-01`;
  return d;
}

// Quando o lead volta pelo intervalo: { perfil, dias, ultimo, data } ou null.
export function retornoPorIntervalo(l, contatosDoLead, config) {
  const perfil = perfilRelacionamento(l);
  if (!perfil) return null;
  const marcada = l.data_proximo_passo && l.proximo_tipo !== 'vencimento';
  if (marcada) return null;
  const ultimo = ultimoContato(l, contatosDoLead);
  if (!ultimo) return null;
  const dias = relacionamentoDe(config)[perfil];
  if (dias == null) {
    // Satisfeito: só o vencimento. Se o lead já tem o vencimento como próximo passo, a agenda normal cuida.
    if (l.data_proximo_passo) return null;
    const data = proximoVencimento(l.vencimento_seguro, ultimo);
    return data ? { perfil, dias: null, ultimo, data } : null;
  }
  return { perfil, dias, ultimo, data: somarDias(ultimo, dias) };
}

// Lead que volta hoje (ou já devia ter voltado) pelo intervalo, e que não está na agenda por data.
export function voltaPorIntervalo(l, contatosDoLead, config, hoje = hojeISO()) {
  if (estaNaAgenda(l, hoje)) return null;
  const r = retornoPorIntervalo(l, contatosDoLead, config);
  return r && r.data <= hoje ? r : null;
}

// Contato curto de relacionamento: anotação (obrigatória) + próxima data (opcional, com hora opcional).
// Não muda a etapa. Sem data nova: se o próximo passo já venceu, ele é cumprido (sai), e o intervalo assume.
export function faltaNoContatoCurto(c) {
  const f = [];
  if (!c.observacao?.trim()) f.push('Anotação');
  if (c.hora && !c.data) f.push('Data do próximo contato');
  return f;
}

export function opsContatoCurto(lead, c, agora = new Date()) {
  const falta = faltaNoContatoCurto(c);
  if (falta.length) throw new Error(`Falta responder: ${falta.join(', ')}`);
  const obs = c.observacao.trim();
  const contato = {
    id: crypto.randomUUID(), lead_id: lead.id, data: agora.toISOString(), etapa: lead.etapa, evento: 'relacionamento',
    veiculos: null, decisor: null, motivo: null, resultado: null, observacao: obs,
  };
  const novo = { ...limparLead(lead), observacao: obs };
  if (c.data) {
    Object.assign(novo, { proximo_tipo: 'retorno', data_proximo_passo: c.data, hora_proximo_passo: c.hora || null, proximo_passo: 'Retorno' });
  } else if (lead.data_proximo_passo && lead.data_proximo_passo <= hojeISO(agora)) {
    Object.assign(novo, { proximo_tipo: null, data_proximo_passo: null, hora_proximo_passo: null, proximo_passo: null });
  }
  return [{ tabela: 'contatos', linha: contato }, { tabela: 'leads', linha: novo }];
}
