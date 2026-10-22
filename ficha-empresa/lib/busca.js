// Camada de busca na web. Provedores: Serper.dev (resultados do Google, SERPER_API_KEY)
// e Brave Search (BRAVE_API_KEY). Usa o Serper se a chave dele existir.
// Para outro provedor, basta uma função nova com o mesmo formato de saída:
//   [{ titulo, url, descricao, textos: [trechos extras] }]
import { fetchComTimeout, esperar } from './http.js';

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const SERPER_URL = 'https://google.serper.dev/search';

// Intervalo mínimo entre chamadas à Brave dentro da mesma instância da função
// (planos com limite de requisições por segundo). Ajustável por BRAVE_INTERVALO_MS.
let fila = Promise.resolve();
let ultimaChamada = 0;
function aguardarVez() {
  const intervalo = Number(process.env.BRAVE_INTERVALO_MS ?? 1000);
  const vez = fila.then(async () => {
    const falta = ultimaChamada + intervalo - Date.now();
    if (falta > 0) await esperar(falta);
    ultimaChamada = Date.now();
  });
  fila = vez.catch(() => {});
  return vez;
}

// A Brave devolve trechos com <strong> e entidades HTML.
function limparHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function provedorConfigurado() {
  if (process.env.SERPER_API_KEY) return 'serper';
  if (process.env.BRAVE_API_KEY) return 'brave';
  return null;
}

export async function buscarWeb(query) {
  const provedor = provedorConfigurado();
  if (provedor === 'serper') return buscarSerper(query, process.env.SERPER_API_KEY);
  if (provedor === 'brave') return buscarBrave(query, process.env.BRAVE_API_KEY);
  throw new Error('nenhuma chave de busca configurada no servidor (SERPER_API_KEY ou BRAVE_API_KEY)');
}

// Serper.dev: POST com JSON. num acima de 10 custa 2 créditos, por isso o padrão é 10.
async function buscarSerper(query, chave) {
  const num = Number(process.env.SERPER_NUM ?? 10);
  const resp = await fetchComTimeout(SERPER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': chave },
    body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num }),
  });
  if (!resp.ok) throw new Error(`busca respondeu HTTP ${resp.status}`);
  const json = await resp.json();
  const resultados = (json?.organic ?? []).map((r) => ({
    titulo: r.title ?? '',
    url: r.link ?? '',
    descricao: r.snippet ?? '',
    textos: (r.sitelinks ?? []).map((s) => `${s.title ?? ''} ${s.link ?? ''}`),
  }));
  // Painel do Google (quando existe) costuma trazer o site oficial.
  const kg = json?.knowledgeGraph;
  if (kg?.website) {
    resultados.push({
      titulo: kg.title ?? '',
      url: kg.website,
      descricao: kg.description ?? '',
      textos: Object.entries(kg.attributes ?? {}).map(([k, v]) => `${k}: ${v}`),
    });
  }
  return resultados;
}

async function buscarBrave(query, chave) {
  const params = new URLSearchParams({ q: query, count: '20', country: 'BR', search_lang: 'pt-br', safesearch: 'off' });
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    await aguardarVez();
    const resp = await fetchComTimeout(`${BRAVE_URL}?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': chave },
    });
    if (resp.status === 429 && tentativa === 1) {
      await esperar(Math.min(3000, Number(resp.headers.get('retry-after') ?? 1) * 1000));
      continue;
    }
    if (!resp.ok) throw new Error(`busca respondeu HTTP ${resp.status}`);
    const json = await resp.json();
    return (json?.web?.results ?? []).map((r) => ({
      titulo: limparHtml(r.title),
      url: r.url ?? '',
      descricao: limparHtml(r.description),
      textos: [...(r.extra_snippets ?? []).map(limparHtml), r.profile?.url ?? ''].filter(Boolean),
    }));
  }
  throw new Error('busca recusada por limite de requisições (HTTP 429)');
}

// Texto bruto de um resultado, para regex (CNPJ, ftid).
export function textoDoResultado(r) {
  return [r.titulo, r.descricao, r.url, ...(r.textos ?? [])].join(' \n ');
}
