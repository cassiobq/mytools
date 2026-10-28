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

test('segmento pelo CNAE principal: tabela, mais específico vence, e descrição oficial sem correspondência', async () => {
  const { segmentoPorCnae } = await import('../lib/segmentos.js');
  assert.deepEqual(segmentoPorCnae(4771701, 'Comércio varejista de produtos farmacêuticos'), { segmento: 'Farmácias', origem: 'tabela' });
  assert.equal(segmentoPorCnae(4711302).segmento, 'Supermercado');
  assert.equal(segmentoPorCnae(4530703).segmento, 'Autopeças');
  assert.equal(segmentoPorCnae(5611203).segmento, 'Lanchonete');
  assert.equal(segmentoPorCnae(5611201).segmento, 'Restaurante');
  assert.equal(segmentoPorCnae(4623108).segmento, 'Agropecuária'); // 4623 vence o genérico 46
  assert.equal(segmentoPorCnae(4641901).segmento, 'Atacado e Distribuidora');
  assert.equal(segmentoPorCnae(111301).segmento, 'Agronegócio'); // 0111-3/01 sem o zero à esquerda
  assert.deepEqual(segmentoPorCnae(9001901, 'Produção teatral'), { segmento: 'Produção teatral', origem: 'cnae' });
  assert.deepEqual(segmentoPorCnae(null, ''), { segmento: '', origem: null });
});

test('campo Cidade: linhas só com o nome, cidade repetida removida, separador explícito vence', async () => {
  const { parseCidade } = await import('../lib/parser.js');
  assert.deepEqual(parseCidade('rio verde'), { cidade: 'Rio Verde', uf: 'GO' });
  assert.deepEqual(parseCidade('Uberlândia - MG'), { cidade: 'Uberlândia', uf: 'MG' });
  assert.deepEqual(parseCidade('jatai/go'), { cidade: 'Jataí', uf: 'GO' });
  assert.equal(parseCidade('  '), null);

  const r = parseEntrada('baterias luxfor\nbaterias luxfor rio verde\nauto-peças silva Rio Verde GO\nposto x, Jataí\nloja go', 'Rio Verde');
  assert.deepEqual(r.map((i) => [i.nome, i.cidade, i.cidade_inferida]), [
    ['baterias luxfor', 'Rio Verde', false],
    ['baterias luxfor', 'Rio Verde', false],
    ['auto-peças silva', 'Rio Verde', false],
    ['posto x', 'Jataí', false],
    ['loja go', 'Rio Verde', false],
  ]);
  // A busca na web usa "nome + cidade".
  assert.equal(r[0].entrada, 'baterias luxfor Rio Verde');
  // Sem o campo, nada muda.
  assert.equal(parseEntrada('baterias luxfor rio verde')[0].cidade_inferida, true);
});

test('casos reais de Bom Jesus de Goiás: hífen no nome e singular/plural', () => {
  // Com o campo Cidade, " - " só separa se o último pedaço for cidade.
  const r = parseEntrada('Casa Brasília - Materiais Para Construção\nRede Construcao - Gemeos\nPadaria X, Jataí\nLoja Y - Uberlândia/MG', 'Bom Jesus de Goiás');
  assert.deepEqual(r.map((i) => [i.nome, i.cidade]), [
    ['Casa Brasília Materiais Para Construção', 'Bom Jesus de Goiás'],
    ['Rede Construcao Gemeos', 'Bom Jesus de Goiás'],
    ['Padaria X', 'Jataí'],
    ['Loja Y', 'Uberlândia'],
  ]);
  // Dados reais da Receita.
  assert.equal(compararNomes('Jd Materiais De Construção E Madeireira', 'JD MATERIAIS PARA CONSTRUCOES JD MATERIAIS PARA CONSTRUCOES LTDA').parecido, true);
  assert.equal(compararNomes('Casa Brasília Materiais Para Construção', 'CASA BRASILIA CASA BRASILIA MATERIAIS DE CONSTRUCAO LTDA').parecido, true);
  // Mesmo bairro de palavras, outra empresa: continua rejeitado.
  assert.equal(compararNomes('Rede Construcao Gemeos', 'GEMEOS PRESTACAO DE SERVICOS GEMEOS PRESTACAO DE SERVICOS ELETRICOS E ELETRONICOS LTDA').parecido, false);
});

test('Instagram: @casa.brasilia para "Casa Brasília Materiais Para Construção"', () => {
  const r = encontrarInstagram([{ titulo: 'Casa Brasília', url: 'https://www.instagram.com/casa.brasilia/' }], 'Casa Brasília Materiais Para Construção', 'Bom Jesus de Goiás');
  assert.equal(r.usuario, '@casa.brasilia');
});

test('Instagram com vários nomes: nome extra só genérico é ignorado', () => {
  const perfis = [{ titulo: 'Supermercado Reis', url: 'https://www.instagram.com/supermercadoreis/' }];
  // "SUPERMERCADO" sozinho (fantasia genérico) não pode aprovar qualquer @supermercado...
  assert.equal(encontrarInstagram(perfis, ['mercadinho do zé', 'SUPERMERCADO'], 'Bom Jesus de Goiás').status, 'nao_encontrado');
  // ...mas um fantasia específico aprova.
  assert.equal(encontrarInstagram(perfis, ['mercadinho do zé', 'SUPERMERCADO REIS'], 'Bom Jesus de Goiás').status, 'ok');
});

test('nome fantasia contido no nome digitado longo', async () => {
  const { nomeContido } = await import('../lib/texto.js');
  const longo = 'Casa Agropecuária Polivet Medicamentos Ferramentas Vacinas Ração Pet Shop Geradores E Chocadeiras';
  assert.equal(nomeContido('POLIVET', longo), true);
  assert.equal(nomeContido('BATERIAS LUXFOR', 'baterias luxfor e acessórios automotivos'), true);
  assert.equal(nomeContido('CASA', longo), false); // só genérico
  assert.equal(nomeContido('POLIVET', 'casa agropecuaria boi gordo'), false);
  assert.equal(nomeContido('', longo), false);
});

test('Instagram: dono de posts e reels (link, título e "usuario on data")', async () => {
  const { donoDoResultado } = await import('../lib/instagram.js');
  assert.equal(donoDoResultado({ url: 'https://www.instagram.com/lojasconstrumil/reel/DAbc123/' }), 'lojasconstrumil');
  assert.equal(donoDoResultado({ url: 'https://www.instagram.com/p/DAbc123/', titulo: 'A Construmil (@lojasconstrumil) • Instagram' }), 'lojasconstrumil');
  assert.equal(donoDoResultado({
    url: 'https://www.instagram.com/reel/DAbc123/', titulo: 'A melhor loja Agropecuária de Bom Jesus, é ...',
    descricao: '64 likes, 11 comments - polivetbomjesus on December 28, 2024: "A melhor loja ... @polivetitumbiara',
  }), 'polivetbomjesus');
  assert.equal(donoDoResultado({ url: 'https://www.instagram.com/p/DAbc123/', descricao: 'veja @outraloja' }), null);

  // Só posts nos resultados: acha pelo dono.
  const r = encontrarInstagram([
    { url: 'https://www.instagram.com/reel/X1/', titulo: 'Promoção', descricao: 'lojasconstrumil on March 3, 2025: "Promoção de cimento"' },
  ], ['A Construmil', 'A CONSTRUMIL'], 'Bom Jesus de Goiás');
  assert.equal(r.url, 'https://www.instagram.com/lojasconstrumil/');
});

test('telefone: Google Maps primeiro, Receita como complemento, sem repetir', async () => {
  const { formatarTelefone, montarTelefone } = await import('../lib/telefone.js');
  assert.equal(formatarTelefone('6436121022'), '(64) 3612-1022');
  assert.equal(formatarTelefone('64992897195'), '(64) 99289-7195');
  assert.equal(formatarTelefone('6492897195'), '(64) 99289-7195'); // celular antigo sem o 9
  assert.equal(formatarTelefone('+55 64 3608-2101'), '(64) 3608-2101');

  // Caso real Gêmeos: Google (64) 3608-3169 = Receita tel 1; Receita tel 2 é outro.
  const t = montarTelefone({ telefone: '(64) 3608-3169' }, { ddd_telefone_1: '6436083169', ddd_telefone_2: '6492897195' });
  assert.equal(t.numero, '(64) 3608-3169');
  assert.equal(t.origem, 'Google Maps');
  assert.deepEqual(t.outros, [{ numero: '(64) 99289-7195', origem: 'Receita' }]);

  // Sem Google: Receita.
  assert.equal(montarTelefone(null, { ddd_telefone_1: '6436121022', ddd_telefone_2: '' }).origem, 'Receita');
  // Nada: não encontrado.
  assert.equal(montarTelefone(null, null).status, 'nao_encontrado');
});
