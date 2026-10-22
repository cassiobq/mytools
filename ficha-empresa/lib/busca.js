// Camada de busca na web. Para trocar de provedor (ex.: Google Programmable Search),
// basta reescrever buscarWeb mantendo o formato de saída:
//   [{ titulo, url, descricao, textos: [trechos extras] }]
import { fetchComTimeout, esperar } from './http.js';

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

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

export async function buscarWeb(query) {
  const chave = process.env.BRAVE_API_KEY;
  if (!chave) throw new Error('BRAVE_API_KEY não configurada no servidor');

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
