// Telefone de contato: Google Maps primeiro (costuma ser o número em uso), depois os da Receita.

// "6436121022" -> "(64) 3612-1022"; "64992897195" -> "(64) 99289-7195". Outros formatos ficam como vieram.
// Celular antigo sem o 9 (a Receita guarda muitos assim: "6492897195") ganha o 9 da frente, como manda a
// regra da Anatel; celular começa com 6-9 depois do DDD, fixo com 2-5.
export function formatarTelefone(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return String(tel ?? '').trim();
}

// Lista sem repetidos (compara os últimos 8 dígitos), na ordem: Google Maps, Receita 1, Receita 2.
export function montarTelefone(local, dados) {
  const fontes = [
    [local?.telefone, 'Google Maps'],
    [dados?.ddd_telefone_1, 'Receita'],
    [dados?.ddd_telefone_2, 'Receita'],
  ];
  const vistos = new Set();
  const numeros = [];
  for (const [tel, origem] of fontes) {
    const d = String(tel ?? '').replace(/\D/g, '');
    if (d.length < 8 || vistos.has(d.slice(-8))) continue;
    vistos.add(d.slice(-8));
    numeros.push({ numero: formatarTelefone(tel), origem });
  }
  if (!numeros.length) return { status: 'nao_encontrado', numero: null, origem: null, outros: [], mensagem: 'não encontrado' };
  const [principal, ...outros] = numeros;
  return { status: 'ok', numero: principal.numero, origem: principal.origem, outros, mensagem: '' };
}
