// CNPJ: validação por dígitos verificadores, formatação e extração de textos livres.

export function somenteDigitos(s) {
  return String(s ?? '').replace(/\D/g, '');
}

function digitoVerificador(base) {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(cnpj) {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv1 = digitoVerificador(d.slice(0, 12));
  const dv2 = digitoVerificador(d.slice(0, 12) + dv1);
  return d.endsWith(`${dv1}${dv2}`);
}

export function formatarCnpj(cnpj) {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Acha padrões de 14 dígitos com ou sem pontuação (03.373.661/0001-50, 03373661000150,
// 03-373-661-0001-50 em URLs). Não pega trechos de números maiores.
const PADRAO_CNPJ = /(?<!\d)\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s.-]?\d{4}[\s.-]?\d{2}(?!\d)/g;

export function extrairCnpjs(texto) {
  const achados = [];
  for (const m of String(texto ?? '').matchAll(PADRAO_CNPJ)) {
    const d = somenteDigitos(m[0]);
    if (d.length === 14 && !achados.includes(d)) achados.push(d);
  }
  return achados;
}
