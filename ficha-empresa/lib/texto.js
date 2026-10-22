// Utilitários de texto: normalização sem acento e comparação "parecido" de nomes de empresa.

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function compactar(s) {
  return normalizar(s).replace(/ /g, '');
}

// Sufixos societários e palavras de ligação: não ajudam a identificar a empresa.
const STOPWORDS = new Set([
  'ltda', 'me', 'epp', 'eireli', 'sa', 'ss', 'cia', 'mei', 'slu',
  'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'em', 'na', 'no', 'para', 'com', 'por',
]);

// Palavras de ramo: contam para a semelhança, mas sozinhas não identificam ninguém.
const GENERICAS = new Set([
  'auto', 'pecas', 'peca', 'baterias', 'bateria', 'comercio', 'comercial', 'servicos', 'servico',
  'loja', 'lojas', 'distribuidora', 'distribuidor', 'materiais', 'material', 'construcao', 'construcoes',
  'restaurante', 'lanchonete', 'farmacia', 'drogaria', 'supermercado', 'mercado', 'mercearia',
  'padaria', 'panificadora', 'oficina', 'mecanica', 'industria', 'industrial', 'transportes',
  'transporte', 'agro', 'agropecuaria', 'veiculos', 'moveis', 'eletro', 'eletrica', 'eletronica',
  'confeccoes', 'modas', 'moda', 'calcados', 'clinica', 'odontologia', 'academia', 'escola',
  'colegio', 'hotel', 'posto', 'combustiveis', 'pneus', 'acougue', 'casa', 'center', 'centro',
  'grupo', 'empresa', 'brasil', 'goias', 'representacoes', 'atacado', 'atacadista', 'varejo',
]);

export function ehGenerica(token) {
  return GENERICAS.has(token);
}

export function tokensSignificativos(s) {
  return normalizar(s).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

// Singular/plural: construcoes -> construcao, materiais -> material, papeis -> papel, lojas -> loja.
export function radical(t) {
  if (t.length <= 3) return t;
  return t.replace(/(oes|aes)$/, 'ao').replace(/ais$/, 'al').replace(/eis$/, 'el').replace(/([^s])s$/, '$1');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tokenBate(token, candTokens, candCompacto) {
  if (candTokens.has(token)) return true;
  if (token.length >= 4 && candCompacto.includes(token)) return true;
  if (token.length >= 5) {
    for (const c of candTokens) if (Math.abs(c.length - token.length) <= 1 && levenshtein(c, token) <= 1) return true;
  }
  return false;
}

const GENERICAS_RADICAIS = new Set([...GENERICAS].map(radical));

// Mede o quanto o nome digitado aparece no texto candidato (0..1) e diz se é "parecido".
// Parecido = pelo menos 60% dos tokens batem E algum token não genérico bate
// (evita aceitar "Auto Peças Silva" como "Auto Peças Souza").
export function compararNomes(nomeDigitado, textoCandidato) {
  const tokens = tokensSignificativos(nomeDigitado).map(radical);
  if (!tokens.length) return { score: 0, parecido: false };
  const candTokens = new Set(tokensSignificativos(textoCandidato).map(radical));
  const candCompacto = compactar(textoCandidato);
  const nomeCompacto = tokens.join('');
  if (nomeCompacto.length >= 5 && candCompacto.includes(nomeCompacto)) return { score: 1, parecido: true };

  const bateram = tokens.filter((t) => tokenBate(t, candTokens, candCompacto));
  const score = bateram.length / tokens.length;
  const generica = (t) => GENERICAS_RADICAIS.has(t);
  const especificos = tokens.filter((t) => !generica(t));
  const especificoBateu = especificos.length === 0 || bateram.some((t) => !generica(t));
  return { score, parecido: score >= 0.6 && especificoBateu };
}

// O nome oficial curto está inteiro dentro do nome digitado (que pode ter descrições a mais):
// "POLIVET" em "Casa Agropecuária Polivet Medicamentos Ferramentas...". Exige uma palavra específica
// com 4+ letras, para "SUPERMERCADO" ou "JD" sozinhos não aprovarem nada.
export function nomeContido(nomeCurto, nomeDigitado) {
  const curtos = tokensSignificativos(nomeCurto).map(radical);
  if (!curtos.some((t) => t.length >= 4 && !GENERICAS_RADICAIS.has(t))) return false;
  const digitados = new Set(tokensSignificativos(nomeDigitado).map(radical));
  return curtos.every((t) => digitados.has(t));
}

export function mesmaCidade(a, b) {
  const na = normalizar(a);
  return na.length > 0 && na === normalizar(b);
}
