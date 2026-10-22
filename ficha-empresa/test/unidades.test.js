import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarCnpj, formatarCnpj, extrairCnpjs } from '../lib/cnpj.js';
import { parseLinha, parseEntrada, MAX_EMPRESAS } from '../lib/parser.js';
import { normalizar, mesmaCidade, compararNomes } from '../lib/texto.js';
import { estaBaixada, nomeExibido, extrairSocio } from '../lib/receita.js';
import { usuarioDoPerfil, encontrarInstagram } from '../lib/instagram.js';
import { linkMapsPorEndereco, extrairFtid } from '../lib/maps.js';

test('validação de CNPJ pelos dígitos verificadores', () => {
  assert.equal(validarCnpj('03.373.661/0001-50'), true);
  assert.equal(validarCnpj('03373661000150'), true);
  assert.equal(validarCnpj('03.373.661/0001-51'), false);
  assert.equal(validarCnpj('11111111111111'), false);
  assert.equal(validarCnpj('0337366100015'), false);
  assert.equal(formatarCnpj('03373661000150'), '03.373.661/0001-50');
});

test('extrai CNPJs com e sem pontuação, sem pegar pedaços de números maiores', () => {
  const texto = 'CNPJ 03.373.661/0001-50 | url /empresa/03373661000150 | tel 123456789012345678 | 11-222-333-0001-81';
  assert.deepEqual(extrairCnpjs(texto), ['03373661000150', '11222333000181']);
});

test('parser: sem separador usa a lista de cidades de Goiás e marca cidade_inferida', () => {
  const r = parseLinha('baterias luxfor rio verde');
  assert.equal(r.nome, 'baterias luxfor');
  assert.equal(r.cidade, 'Rio Verde');
  assert.equal(r.uf, 'GO');
  assert.equal(r.cidade_inferida, true);

  const r2 = parseLinha('padaria pao quente aparecida de goiania');
  assert.equal(r2.nome, 'padaria pao quente');
  assert.equal(r2.cidade, 'Aparecida de Goiânia');
});

test('parser: separadores vírgula, " - " e "|" e UF no final', () => {
  assert.deepEqual(
    (({ nome, cidade, uf, cidade_inferida }) => ({ nome, cidade, uf, cidade_inferida }))(parseLinha('Baterias Luxfor, Rio Verde')),
    { nome: 'Baterias Luxfor', cidade: 'Rio Verde', uf: null, cidade_inferida: false },
  );
  assert.equal(parseLinha('Auto-Peças Silva - Jataí').cidade, 'Jataí');
  assert.equal(parseLinha('Auto-Peças Silva - Jataí').nome, 'Auto-Peças Silva');
  const p = parseLinha('Loja X | Uberlândia/MG');
  assert.equal(p.cidade, 'Uberlândia');
  assert.equal(p.uf, 'MG');
  const g = parseLinha('baterias luxfor rio verde GO');
  assert.equal(g.cidade, 'Rio Verde');
  assert.equal(g.uf, 'GO');
});

test('parser: heurística fora da lista e erros de entrada', () => {
  const r = parseLinha('mercadinho bom preco campinas');
  assert.equal(r.cidade, 'campinas');
  assert.equal(r.cidade_inferida, true);
  assert.ok(parseLinha('ab').erro);
  assert.ok(parseLinha('luxfor').erro);
  assert.equal(parseLinha('<script>alert(1)</script> rio verde').entrada.includes('<'), false);
  assert.throws(() => parseEntrada(Array(MAX_EMPRESAS + 1).fill('a b rio verde')), /Máximo de 20/);
  assert.throws(() => parseEntrada('\n  \n'), /Nenhuma empresa/);
  assert.equal(parseEntrada('a b rio verde\n\nc d jatai').length, 2);
});

test('normalização de cidade: sem acento e sem maiúsculas', () => {
  assert.equal(normalizar('  Goiânia '), 'goiania');
  assert.equal(mesmaCidade('RIO VERDE', 'Rio Verde'), true);
  assert.equal(mesmaCidade('JATAI', 'Jataí'), true);
  assert.equal(mesmaCidade('SAO LUIS DE MONTES BELOS', 'São Luís de Montes Belos'), true);
  assert.equal(mesmaCidade('RIO VERDE', 'Rio Verde de Mato Grosso'), false);
  assert.equal(mesmaCidade('', ''), false);
});

test('semelhança de nomes exige token específico', () => {
  assert.equal(compararNomes('baterias luxfor', 'BATERIAS LUXFOR BATERIAS LUXFOR LTDA').parecido, true);
  assert.equal(compararNomes('auto pecas silva', 'AUTO PECAS SOUZA LTDA').parecido, false);
  assert.equal(compararNomes('baterias luxfor', 'BATERIAS MOURA LTDA').parecido, false);
});

test('lógica de BAIXADA e nome exibido', () => {
  assert.equal(estaBaixada({ situacao_cadastral: 8 }), true);
  assert.equal(estaBaixada({ situacao_cadastral: 4, descricao_situacao_cadastral: 'Baixada' }), true);
  assert.equal(estaBaixada({ situacao_cadastral: 2, descricao_situacao_cadastral: 'ATIVA' }), false);
  assert.equal(nomeExibido({ situacao_cadastral: 8, nome_fantasia: 'LOJA X', razao_social: 'X LTDA' }), 'LOJA X BAIXADA');
  assert.equal(nomeExibido({ situacao_cadastral: 2, nome_fantasia: '', razao_social: 'X LTDA' }), 'X LTDA');
  assert.equal(nomeExibido({ situacao_cadastral: 8, nome_fantasia: '', razao_social: 'X LTDA' }), 'X LTDA BAIXADA');
});

test('sócio: primeiro do qsa ou razão social (sem CPF) para empresário individual', () => {
  assert.deepEqual(extrairSocio({ qsa: [{ nome_socio: 'A' }, { nome_socio: 'B' }] }).nome, 'A');
  const ind = extrairSocio({ qsa: [], razao_social: 'JOAO DA SILVA 12345678901' });
  assert.equal(ind.nome, 'JOAO DA SILVA');
  assert.equal(ind.origem, 'razão social');
});

test('Instagram: só perfis, nunca posts/reels/hashtags', () => {
  assert.equal(usuarioDoPerfil('https://www.instagram.com/bateriasluxfor.ltda/?hl=pt'), 'bateriasluxfor.ltda');
  assert.equal(usuarioDoPerfil('https://www.instagram.com/p/Cabc123/'), null);
  assert.equal(usuarioDoPerfil('https://www.instagram.com/reel/Cabc123/'), null);
  assert.equal(usuarioDoPerfil('https://www.instagram.com/explore/tags/baterias/'), null);
  assert.equal(usuarioDoPerfil('https://instagram.com.evil.com/luxfor'), null);
});

test('Instagram não encontrado quando não há relação clara', () => {
  const r = encontrarInstagram([
    { titulo: 'Baterias Moura (@bateriasmoura)', url: 'https://www.instagram.com/bateriasmoura/' },
    { titulo: 'Luxfor post', url: 'https://www.instagram.com/p/XYZ/' },
    { titulo: 'Rio Verde Notícias', url: 'https://www.instagram.com/rioverdenoticias/' },
  ], 'baterias luxfor');
  assert.equal(r.status, 'nao_encontrado');
  assert.equal(r.url, null);
  assert.equal(r.mensagem, 'não encontrado');
});

test('Maps: link pelo endereço oficial com encodeURIComponent e ftid único', () => {
  const url = linkMapsPorEndereco({ nome_fantasia: 'BATERIAS LUXFOR', logradouro: 'AVENIDA PAUZANES DE CARVALHO', numero: '206', municipio: 'RIO VERDE', uf: 'GO' });
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=BATERIAS%20LUXFOR%20AVENIDA%20PAUZANES%20DE%20CARVALHO%20206%20RIO%20VERDE%20GO');
  assert.equal(extrairFtid('<a href="https://maps.google.com/?ftid=0x935a1b2c3d4e5f60:0x1a2b3c4d5e6f7a8b">'), '0x935a1b2c3d4e5f60:0x1a2b3c4d5e6f7a8b');
  assert.equal(extrairFtid('ftid=0x1111111111:0x2222222222 e ftid=0x3333333333:0x4444444444'), null);
});

test('Instagram: @ com as palavras específicas do nome é aceito; genérico sem confirmação não', () => {
  const ok = encontrarInstagram([
    { titulo: 'Drogaria (@dupovopopular.bj)', url: 'https://www.instagram.com/dupovopopular.bj/' },
  ], 'farmacia du povo popular', 'Bom Jesus de Goiás');
  assert.equal(ok.url, 'https://www.instagram.com/dupovopopular.bj/');

  // Uma só palavra específica ("popular") e sem citar a cidade: não arrisca.
  const fraco = encontrarInstagram([
    { titulo: 'Rede Popular', url: 'https://www.instagram.com/redepopular/', descricao: 'Anápolis' },
  ], 'farmacia popular', 'Rio Verde');
  assert.equal(fraco.status, 'nao_encontrado');
  assert.equal(fraco.descartados[0].usuario, '@redepopular');

  // Mesma palavra, mas o perfil cita a cidade: aceita.
  const comCidade = encontrarInstagram([
    { titulo: 'Farmácia Popular', url: 'https://www.instagram.com/redepopular/', descricao: 'Rio Verde - GO' },
  ], 'farmacia popular', 'Rio Verde');
  assert.equal(comCidade.status, 'ok');

  // Título do perfil com o nome inteiro, @ diferente.
  const titulo = encontrarInstagram([
    { titulo: 'Farmácia Du Povo Popular (@fdp_bjgo) • Fotos e vídeos do Instagram', url: 'https://www.instagram.com/fdp_bjgo/' },
  ], 'farmacia du povo popular', 'Bom Jesus de Goiás');
  assert.equal(titulo.usuario, '@fdp_bjgo');
});

test('Instagram: caso real "farmacia du povo popular bom jesus de goias"', () => {
  // Resultados reais da busca (Google via Serper), em 22/10/2026.
  const r = encontrarInstagram([
    { titulo: 'Farmácia DuPovo Popular (@farmaciadupovobomjesus)', url: 'https://www.instagram.com/farmaciadupovobomjesus/' },
    { titulo: 'Farmácia Asfar Popular Bom Jesus ...', url: 'https://www.instagram.com/asfarpopularbomjesus/' },
  ], 'farmácia du povo popular', 'Bom Jesus de Goiás');
  assert.equal(r.url, 'https://www.instagram.com/farmaciadupovobomjesus/');
  assert.deepEqual(r.descartados.map((d) => d.usuario), ['@asfarpopularbomjesus']);
});
