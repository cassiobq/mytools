// Ações de vendas: o local da prospecção (cidade obrigatória, rua opcional). A ativa é a última criada;
// criar uma nova finaliza a anterior. Data e duração saem dos horários das visitas registradas nela.

export const acaoAtiva = (acoes) => [...acoes].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;

export function opsNovaAcao({ cidade, endereco }, acoes, agora = new Date()) {
  const c = String(cidade || '').trim();
  if (!c) throw new Error('Escolha a cidade da ação.');
  const ops = [];
  const anterior = acaoAtiva(acoes);
  if (anterior && !anterior.finalizada_em) {
    ops.push({ tabela: 'acoes', linha: { ...semExtras(anterior), finalizada_em: agora.toISOString() } });
  }
  ops.push({
    tabela: 'acoes',
    linha: { id: crypto.randomUUID(), criado_em: new Date(agora.getTime() + 1).toISOString(), cidade: c, endereco: String(endereco || '').trim() || null, finalizada_em: null },
  });
  return ops;
}
const semExtras = ({ id, criado_em, cidade, endereco, finalizada_em }) => ({ id, criado_em, cidade, endereco, finalizada_em });

export const nomeDaAcao = (a) => (a ? [a.endereco, a.cidade].filter(Boolean).join(' · ') : '');

// Resumo da ação pelas visitas (abordagens) registradas nela.
export function resumoAcao(acao, leads, contatos) {
  const ids = new Set(leads.filter((l) => l.acao_id === acao.id && !l.lead_pai_id).map((l) => l.id));
  const visitas = contatos.filter((c) => ids.has(c.lead_id) && c.evento === 'abordagem').map((c) => new Date(c.data)).sort((a, b) => a - b);
  const chegou = (ev) => new Set(contatos.filter((c) => ids.has(c.lead_id) && c.evento === ev).map((c) => c.lead_id)).size;
  const inicio = visitas[0] || null;
  const fim = visitas[visitas.length - 1] || null;
  return {
    registros: ids.size,
    inicio, fim,
    duracaoMin: inicio && fim ? Math.round((fim - inicio) / 60000) : null,
    mql: chegou('mql'), sql: chegou('sql'), associados: chegou('associado'),
  };
}

export function textoDuracao(min) {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
const hm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
export function textoPeriodoAcao(r, acao) {
  const base = r.inicio || new Date(acao.criado_em);
  const dia = base.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (!r.inicio) return `${dia} · sem visitas ainda`;
  return r.inicio.getTime() === r.fim.getTime() ? `${dia} · ${hm(r.inicio)}` : `${dia} · ${hm(r.inicio)} às ${hm(r.fim)} (${textoDuracao(r.duracaoMin)})`;
}
