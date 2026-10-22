// Função serverless (Vercel, Node 24): POST /api/ficha  { "empresas": "linha 1\nlinha 2" | ["...", "..."] }
// ou GET /api/ficha?q=baterias+luxfor+rio+verde
// Com "Accept: application/x-ndjson" responde em streaming (uma linha JSON por evento de progresso).
import { parseEntrada } from '../lib/parser.js';
import { processarLista } from '../lib/ficha.js';
import { provedorConfigurado } from '../lib/busca.js';

const MAX_CORPO = 8 * 1024;
const CACHE_CURTO = 'public, max-age=60, s-maxage=120';

function lerEntrada(req) {
  if (req.method === 'GET') return req.query?.q ?? new URL(req.url, 'http://x').searchParams.get('q') ?? '';
  let corpo = req.body;
  if (typeof corpo === 'string') {
    if (corpo.length > MAX_CORPO) throw Object.assign(new Error('Requisição grande demais.'), { status: 413 });
    try {
      corpo = JSON.parse(corpo);
    } catch {
      return corpo; // texto puro: uma empresa por linha
    }
  }
  const empresas = corpo?.empresas;
  if (typeof empresas !== 'string' && !Array.isArray(empresas)) {
    throw Object.assign(new Error('Envie "empresas" como texto (uma por linha) ou lista.'), { status: 400 });
  }
  if (JSON.stringify(empresas).length > MAX_CORPO) throw Object.assign(new Error('Requisição grande demais.'), { status: 413 });
  return Array.isArray(empresas) ? empresas.map((e) => (typeof e === 'string' ? e : '')) : empresas;
}

function enviarErro(res, status, mensagem) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ erro: mensagem });
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return enviarErro(res, 405, 'Método não permitido.');
  }

  let itens;
  try {
    itens = parseEntrada(lerEntrada(req));
  } catch (e) {
    return enviarErro(res, e.status ?? 400, e.message);
  }
  if (!provedorConfigurado()) {
    return enviarErro(res, 503, 'Nenhuma chave de busca configurada no servidor (SERPER_API_KEY ou BRAVE_API_KEY em Vercel > Settings > Environment Variables).');
  }

  const streaming = /application\/x-ndjson/i.test(req.headers.accept ?? '');
  if (!streaming) {
    const resultados = await processarLista(itens);
    res.setHeader('Cache-Control', CACHE_CURTO);
    return res.status(200).json({ total: resultados.length, resultados });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.flushHeaders?.();
  const enviar = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  enviar({ tipo: 'inicio', total: itens.length, itens: itens.map((i) => ({ entrada: i.entrada, nome: i.nome, cidade: i.cidade })) });
  await processarLista(itens, {}, enviar);
  enviar({ tipo: 'fim' });
  res.end();
}
