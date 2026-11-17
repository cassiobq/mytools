// Nomes de empresa parecidos (para avisar antes de cadastrar a mesma empresa duas vezes).
const SUFIXOS = /\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|com|de|da|do|das|dos|e)\b/g;

export function normalizar(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(SUFIXOS, ' ').replace(/\s+/g, ' ').trim();
}

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Iguais depois de normalizar, um contém o outro (com 4+ letras) ou até 2 letras de diferença.
export function parecido(a, b) {
  const x = normalizar(a); const y = normalizar(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  return Math.min(x.length, y.length) >= 5 && distancia(x, y) <= 2;
}

export const parecidos = (nome, leads) => leads.filter((l) => !l.lead_pai_id && parecido(nome, l.empresa));
