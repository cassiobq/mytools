// Handler da Vercel com o fetch global mockado (Brave + Minha Receita).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/ficha.js';

const LUXFOR = readFileSync(new URL('./fixtures/receita-03373661000150.json', import.meta.url), 'utf8');
const fetchOriginal = globalThis.fetch;
const urls = [];

function respostaBrave(resultados) {
  return new Response(JSON.stringify({ web: { results: resultados } }), { headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  urls.length = 0;
  delete process.env.SERPER_API_KEY;
  process.env.BRAVE_API_KEY = 'chave-de-teste';
  process.env.BRAVE_INTERVALO_MS = '0';
  globalThis.fetch = async (url, opcoes) => {
    urls.push(String(url));
    const u = new URL(url);
    if (u.hostname === 'api.search.brave.com') {
      assert.equal(opcoes.headers['X-Subscription-Token'], 'chave-de-teste');
      const q = u.searchParams.get('q');
      return q.endsWith(' CNPJ')
        ? respostaBrave([{ title: '<strong>BATERIAS LUXFOR</strong> LTDA', url: 'https://cnpj.biz/03373661000150', description: 'CNPJ 03.373.661/0001-50' }])
        : respostaBrave([{ title: 'Baterias Luxfor (@bateriasluxfor.ltda)', url: 'https://www.instagram.com/bateriasluxfor.ltda/', description: '' }]);
    }
    if (u.hostname === 'google.serper.dev') {
      assert.equal(opcoes.method, 'POST');
      assert.equal(opcoes.headers['X-API-KEY'], 'chave-serper');
      const { q, gl } = JSON.parse(opcoes.body);
      assert.equal(gl, 'br');
      const organic = q.endsWith(' CNPJ')
        ? [{ title: 'BATERIAS LUXFOR LTDA - CNPJ 03.373.661/0001-50', link: 'https://cnpj.biz/03373661000150', snippet: 'Rio Verde - GO' }]
        : [{ title: 'Baterias Luxfor (@bateriasluxfor.ltda) • Instagram', link: 'https://www.instagram.com/bateriasluxfor.ltda/', snippet: '' }];
      return new Response(JSON.stringify({ organic }), { headers: { 'content-type': 'application/json' } });
    }
    if (u.hostname === 'minhareceita.org') {
      return u.pathname === '/03373661000150' ? new Response(LUXFOR, { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function fakeRes() {
  const res = {
    statusCode: 200, headers: {}, corpo: '', fim: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.setHeader('content-type', 'application/json'); this.corpo = JSON.stringify(o); this.fim = true; return this; },
    write(s) { this.corpo += s; },
    end() { this.fim = true; },
  };
  return res;
}

test('POST JSON devolve a lista de fichas com Cache-Control curto', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', headers: {}, body: { empresas: 'baterias luxfor rio verde' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'], /max-age=60/);
  const { resultados } = JSON.parse(res.corpo);
  assert.equal(resultados[0].empresa.nome_exibido, 'BATERIAS LUXFOR');
  assert.equal(resultados[0].socio.nome, 'CLEIRY ELIANE SOARES PIRES SANTILLE');
  assert.equal(resultados[0].instagram.url, 'https://www.instagram.com/bateriasluxfor.ltda/');
  assert.ok(urls.some((u) => u.includes('q=baterias+luxfor+rio+verde+CNPJ')));
  assert.ok(urls.includes('https://minhareceita.org/03373661000150'));
});

test('streaming NDJSON envia etapas e resultado', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', headers: { accept: 'application/x-ndjson' }, body: { empresas: ['baterias luxfor rio verde'] } }, res);
  const eventos = res.corpo.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(eventos.filter((e) => e.tipo === 'etapa').map((e) => e.etapa), ['busca_web', 'busca_cnpj', 'receita']);
  assert.equal(eventos.at(-1).tipo, 'fim');
  assert.equal(eventos.find((e) => e.tipo === 'resultado').ficha.empresa.cnpj_formatado, '03.373.661/0001-50');
  assert.ok(res.fim);
});

test('validação: método, limite de 20 e chave ausente', async () => {
  let res = fakeRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);

  res = fakeRes();
  await handler({ method: 'POST', headers: {}, body: { empresas: Array(21).fill('a b rio verde') } }, res);
  assert.equal(res.statusCode, 400);

  res = fakeRes();
  await handler({ method: 'POST', headers: {}, body: { outra: 1 } }, res);
  assert.equal(res.statusCode, 400);

  delete process.env.BRAVE_API_KEY;
  delete process.env.SERPER_API_KEY;
  res = fakeRes();
  await handler({ method: 'GET', headers: {}, query: { q: 'baterias luxfor rio verde' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res).includes('chave-de-teste'), false);
});

test('Serper (Google) tem prioridade quando SERPER_API_KEY existe', async () => {
  process.env.SERPER_API_KEY = 'chave-serper';
  const res = fakeRes();
  await handler({ method: 'POST', headers: {}, body: { empresas: 'baterias luxfor rio verde' } }, res);
  assert.equal(res.statusCode, 200);
  const { resultados } = JSON.parse(res.corpo);
  assert.equal(resultados[0].empresa.cnpj_formatado, '03.373.661/0001-50');
  assert.equal(resultados[0].instagram.url, 'https://www.instagram.com/bateriasluxfor.ltda/');
  assert.equal(urls.some((u) => u.includes('api.search.brave.com')), false);
  assert.equal(urls.filter((u) => u.startsWith('https://google.serper.dev')).length, 2);
});
