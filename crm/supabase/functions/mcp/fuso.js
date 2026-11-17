// Fuso: a lógica do app (lib/) usa o relógio do aparelho (Brasília). O servidor roda em UTC.
// Para reaproveitar a lógica sem mudar nada nela, o conector trabalha num "relógio deslocado":
// cada instante que entra é empurrado para que os getters locais do servidor mostrem a hora de Brasília,
// e cada instante que sai (para o banco ou para o Claude) volta ao valor real.
// Brasília não tem horário de verão desde 2019: sempre -03:00.
export const OFFSET_BRASILIA = 180; // minutos (como getTimezoneOffset: UTC - local)

const desloc = (t) => (new Date(t).getTimezoneOffset() - OFFSET_BRASILIA) * 60000;

// Instante real -> relógio deslocado.
export const entrar = (t) => (t == null ? t : new Date(new Date(t).getTime() + desloc(t)));
// Relógio deslocado -> instante real.
export const sair = (d) => (d == null ? d : new Date(new Date(d).getTime() - desloc(d)));

const CAMPOS_HORA = { leads: ['criado_em', 'enriquecido_em'], contatos: ['data'], acoes: ['criado_em', 'finalizada_em'], config: ['atualizado_em'] };

const mapear = (tabela, linha, f) => {
  const r = { ...linha };
  for (const c of CAMPOS_HORA[tabela] || []) if (r[c] != null) r[c] = f(r[c]).toISOString();
  return r;
};
export const linhaEntrando = (tabela, linha) => mapear(tabela, linha, entrar);
export const linhaSaindo = (tabela, linha) => mapear(tabela, linha, sair);
export const opsSaindo = (ops) => ops.map((o) => ({ tabela: o.tabela, linha: linhaSaindo(o.tabela, o.linha) }));

// Data e hora de Brasília (relógio deslocado) em texto com fuso: "2026-11-12T14:00:00-03:00".
export function textoBrasilia(d) {
  if (!d) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00-03:00`;
}
