// Parser do input "NOME_FANTASIA CIDADE" (uma empresa por linha).
import { CIDADES_GO } from './cidades-go.js';
import { normalizar } from './texto.js';

export const MAX_EMPRESAS = 20;
export const MAX_TAMANHO_LINHA = 150;

const UFS = new Set('ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' '));
const CIDADES_NORMALIZADAS = new Map(CIDADES_GO.map((c) => [normalizar(c), c]));
const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das']);

export function sanitizarLinha(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>"`{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAMANHO_LINHA);
}

// Remove uma UF no fim do texto ("... rio verde GO", ".../GO", "..., GO", "... - GO").
function separarUfFinal(texto) {
  const m = texto.match(/^(.*\S)(?:\s*[\/,|]\s*|\s+-\s+|\s+)([A-Za-z]{2})$/);
  if (m && UFS.has(m[2].toLowerCase()) && m[1].replace(/[|,-]/g, ' ').trim().split(/\s+/).length >= 2) {
    return { texto: m[1].replace(/[\s|,-]+$/, ''), uf: m[2].toUpperCase() };
  }
  return { texto, uf: null };
}

// Campo "Cidade" da tela: "Rio Verde", "rio verde/GO", "Uberlândia - MG". Vazio -> null.
export function parseCidade(textoBruto) {
  const texto = sanitizarLinha(textoBruto).slice(0, 60);
  if (!texto) return null;
  const oficial = CIDADES_NORMALIZADAS.get(normalizar(texto));
  if (oficial) return { cidade: oficial, uf: 'GO' };
  const m = texto.match(/^(.*\S)(?:\s*[\/,|]\s*|\s+-\s+|\s+)([A-Za-z]{2})$/);
  if (m && UFS.has(m[2].toLowerCase())) {
    const nome = m[1].replace(/[\s|,-]+$/, '');
    return { cidade: CIDADES_NORMALIZADAS.get(normalizar(nome)) ?? nome, uf: m[2].toUpperCase() };
  }
  return { cidade: texto, uf: null };
}

const temSeparador = (texto) => ['|', ' - ', ','].some((sep) => texto.includes(sep));

// Linha só com o nome, usando a cidade do campo. Se a pessoa repetiu a cidade (e a UF) no fim, ela sai do nome.
function linhaComCidadePadrao(entrada, padrao) {
  const cidadeNorm = normalizar(padrao.cidade);
  // Remove a cidade do fim da lista de palavras, se estiver lá (deixando ao menos 1 palavra).
  const tirarCidade = (lista) => {
    for (let k = 1; k < lista.length; k++) {
      if (normalizar(lista.slice(-k).join(' ')) === cidadeNorm) return lista.slice(0, -k);
    }
    return null;
  };
  const todas = entrada.split(' ');
  const ultima = todas[todas.length - 1];
  const terminaComUf = todas.length > 2 && /^[A-Za-z]{2}$/.test(ultima) && UFS.has(ultima.toLowerCase());
  const palavras = (terminaComUf && tirarCidade(todas.slice(0, -1))) || tirarCidade(todas) || todas;
  const nome = palavras.join(' ').trim();
  if (!nome) return { entrada, nome: '', cidade: padrao.cidade, uf: padrao.uf, cidade_inferida: false, erro: 'Informe o nome da empresa.' };
  return { entrada: `${nome} ${padrao.cidade}`, nome, cidade: padrao.cidade, uf: padrao.uf, cidade_inferida: false };
}

export function parseLinha(linhaBruta, cidadePadrao = null) {
  const entrada = sanitizarLinha(linhaBruta);
  const base = { entrada, nome: '', cidade: '', uf: null, cidade_inferida: false };
  if (entrada.length < 2) return { ...base, erro: 'Linha muito curta.' };
  if (cidadePadrao?.cidade && !temSeparador(entrada)) return linhaComCidadePadrao(entrada, cidadePadrao);
  if (entrada.length < 3) return { ...base, erro: 'Linha muito curta.' };

  const { texto, uf } = separarUfFinal(entrada);

  // 1) Separador explícito: "|", " - " ou ",". A cidade é o último pedaço.
  for (const sep of ['|', ' - ', ',']) {
    if (!texto.includes(sep)) continue;
    const partes = texto.split(sep).map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2) continue;
    const cidade = partes.pop();
    return { ...base, nome: partes.join(' ').replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim(), cidade, uf, cidade_inferida: false };
  }

  // 2) Sem separador: a cidade é o fim do texto.
  const palavras = texto.replace(/[|,]/g, ' ').split(' ').filter(Boolean);
  if (palavras.length < 2) return { ...base, erro: 'Informe o nome e a cidade (ex.: "baterias luxfor rio verde").' };

  // 2a) Lista de cidades de Goiás: o maior sufixo que for uma cidade conhecida (até 5 palavras,
  //     porque há nomes como "Bom Jesus de Goiás"), deixando pelo menos 1 palavra para o nome.
  for (let k = Math.min(5, palavras.length - 1); k >= 1; k--) {
    const sufixo = palavras.slice(-k).join(' ');
    const cidadeOficial = CIDADES_NORMALIZADAS.get(normalizar(sufixo));
    if (cidadeOficial) {
      return { ...base, nome: palavras.slice(0, -k).join(' '), cidade: cidadeOficial, uf: uf ?? 'GO', cidade_inferida: true };
    }
  }

  // 2b) Heurística: última palavra, ou "X de Y" (3 palavras) se houver palavra de ligação.
  const k = palavras.length >= 4 && LIGACOES.has(normalizar(palavras[palavras.length - 2])) ? 3 : 1;
  return {
    ...base,
    nome: palavras.slice(0, -k).join(' '),
    cidade: palavras.slice(-k).join(' '),
    uf,
    cidade_inferida: true,
  };
}

// Aceita texto (uma por linha) ou array. Lança erro se passar do limite.
// cidade (opcional): a cidade do campo da tela, usada nas linhas sem separador.
export function parseEntrada(entrada, cidade = '') {
  const linhas = (Array.isArray(entrada) ? entrada : String(entrada ?? '').split(/\r?\n/))
    .map((l) => sanitizarLinha(l))
    .filter(Boolean);
  if (linhas.length === 0) {
    const e = new Error('Nenhuma empresa informada.');
    e.status = 400;
    throw e;
  }
  if (linhas.length > MAX_EMPRESAS) {
    const e = new Error(`Máximo de ${MAX_EMPRESAS} empresas por busca (recebidas ${linhas.length}).`);
    e.status = 400;
    throw e;
  }
  const cidadePadrao = parseCidade(cidade);
  return linhas.map((l) => parseLinha(l, cidadePadrao));
}
