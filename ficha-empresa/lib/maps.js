// Link do Google Maps: ftid do site da empresa quando houver; senão, busca pelo endereço oficial.
import { fetchComTimeout, esperar, TIMEOUT_MS } from './http.js';
import { compactar, tokensSignificativos } from './texto.js';

const FTID = /(?:ftid=|!1s|data=[^"'\s]*?!1s)(0x[0-9a-f]{6,16}:0x[0-9a-f]{6,16})/gi;

// Só aceita se houver exatamente um identificador de local distinto no texto.
export function extrairFtid(texto) {
  const ids = new Set();
  for (const m of String(texto ?? '').matchAll(FTID)) ids.add(m[1].toLowerCase());
  return ids.size === 1 ? [...ids][0] : null;
}

export function linkMapsPorEndereco(empresa) {
  const nome = empresa.nome_fantasia || empresa.razao_social;
  const partes = [nome, empresa.logradouro, empresa.numero, empresa.municipio, empresa.uf]
    .map((p) => String(p ?? '').trim())
    .filter((p) => p && !/^s\/?n$/i.test(p));
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(' '))}`;
}

export function linkMapsPorFtid(ftid) {
  return `https://www.google.com/maps?ftid=${ftid}`;
}

const NAO_SAO_SITE_DA_EMPRESA = /(instagram|facebook|linkedin|youtube|tiktok|twitter|x\.com|google|bing|cnpj|econodata|casadosdados|empresascnpj|solutudo|guiamais|apontador|telelistas|mercadolivre|olx|reclameaqui|jusbrasil|wikipedia|cnpja|consultas|speedio|serasa|receita|gov\.br)/i;

// Site oficial: primeiro resultado cujo domínio contém o nome (ex.: luxfor.com.br para "baterias luxfor").
export function acharSiteDaEmpresa(resultados, nome) {
  const tokens = tokensSignificativos(nome).filter((t) => t.length >= 4);
  for (const r of resultados ?? []) {
    let host;
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (NAO_SAO_SITE_DA_EMPRESA.test(host)) continue;
    const dominio = compactar(host.split('.')[0]);
    if (tokens.some((t) => dominio.includes(t))) return r.url;
  }
  return null;
}

// Baixa até ~600 KB do site e procura um ftid (iframes/links do Maps). Falha silenciosa.
export async function buscarFtidNoSite(url) {
  try {
    const resp = await fetchComTimeout(url, { headers: { 'User-Agent': 'ficha-empresa/1.0', Accept: 'text/html' }, redirect: 'follow' });
    if (!resp.ok || !/html/i.test(resp.headers.get('content-type') ?? '')) return null;
    const corpo = await Promise.race([resp.text(), esperar(TIMEOUT_MS).then(() => '')]);
    const html = corpo.slice(0, 600_000);
    return extrairFtid(html);
  } catch {
    return null;
  }
}
