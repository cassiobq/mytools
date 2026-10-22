// Fluxo completo com respostas mockadas (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gerarFicha, processarLista } from '../lib/ficha.js';
import { parseLinha } from '../lib/parser.js';
import { validarCnpj, formatarCnpj } from '../lib/cnpj.js';

// Resposta real da Minha Receita para 03.373.661/0001-50 (salva em test/fixtures).
const LUXFOR = JSON.parse(readFileSync(new URL('./fixtures/receita-03373661000150.json', import.meta.url), 'utf8'));

// Gera um CNPJ válido a partir de 12 dígitos.
function cnpjValido(base12) {
  for (let dv = 0; dv < 100; dv++) {
    const c = base12 + String(dv).padStart(2, '0');
    if (validarCnpj(c)) return c;
  }
  throw new Error('sem DV');
}

function mockDeps({ busca1 = [], busca2 = [], receita = {}, ftid = null, chamadas = [] } = {}) {
  return {
    buscarWeb: async (q) => {
      chamadas.push(q);
      return q.endsWith(' CNPJ') ? busca2 : busca1;
    },
    consultarReceita: async (cnpj) => {
      const r = receita[cnpj];
      if (r instanceof Error) throw r;
      return r ?? null;
    },
    buscarFtidNoSite: async () => ftid,
  };
}

const OUTRA_CIDADE = cnpjValido('112223330001');

test('aceitação (mock): baterias luxfor rio verde', async () => {
  const chamadas = [];
  const deps = mockDeps({
    chamadas,
    busca1: [
      { titulo: 'Baterias Luxfor - Rio Verde', url: 'https://www.facebook.com/bateriasluxfor', descricao: 'Baterias em Rio Verde' },
      { titulo: 'Baterias Luxfor (@bateriasluxfor.ltda) • Instagram photos and videos', url: 'https://www.instagram.com/bateriasluxfor.ltda/', descricao: '' },
      { titulo: 'Post', url: 'https://www.instagram.com/p/Cxyz123/', descricao: 'luxfor' },
    ],
    busca2: [
      { titulo: 'BATERIAS LUXFOR LTDA - CNPJ 03.373.661/0001-50', url: 'https://cnpj.biz/03373661000150', descricao: 'Rio Verde - GO' },
      { titulo: 'Luxfor Baterias Goiânia', url: `https://exemplo.com/${OUTRA_CIDADE}`, descricao: 'CNPJ inválido 03.373.661/0001-99' },
    ],
    receita: {
      '03373661000150': LUXFOR,
      [OUTRA_CIDADE]: { ...LUXFOR, cnpj: OUTRA_CIDADE, municipio: 'GOIANIA', qsa: [] },
    },
  });

  const f = await gerarFicha(parseLinha('baterias luxfor rio verde'), deps);
  assert.deepEqual(chamadas, ['baterias luxfor rio verde', 'baterias luxfor rio verde CNPJ']);
  assert.equal(f.empresa.status, 'ok');
  assert.equal(f.empresa.cnpj_formatado, '03.373.661/0001-50');
  assert.equal(f.empresa.razao_social, 'BATERIAS LUXFOR LTDA');
  assert.equal(f.empresa.segmento, 'Autopeças');
  assert.equal(f.empresa.municipio, 'RIO VERDE');
  assert.equal(f.empresa.uf, 'GO');
  assert.equal(f.empresa.situacao, 'ATIVA');
  assert.equal(f.empresa.baixada, false);
  assert.equal(f.empresa.nome_exibido, 'BATERIAS LUXFOR');
  assert.equal(f.socio.nome, 'CLEIRY ELIANE SOARES PIRES SANTILLE');
  assert.equal(f.socio.origem, 'qsa');
  assert.equal(f.instagram.url, 'https://www.instagram.com/bateriasluxfor.ltda/');
  assert.equal(f.maps.origem, 'endereço');
  assert.equal(
    f.maps.url,
    'https://www.google.com/maps/search/?api=1&query=BATERIAS%20LUXFOR%20AVENIDA%20PAUZANES%20DE%20CARVALHO%20206%20RIO%20VERDE%20GO',
  );
  assert.equal(f.ambiguo, false);
  const motivos = f.candidatos_descartados.map((c) => c.motivo);
  assert.ok(motivos.includes('dígito verificador inválido'));
  assert.ok(motivos.some((m) => m.startsWith('outra cidade (GOIANIA')));
});

test('ftid do site da empresa tem preferência no link do Maps', async () => {
  const deps = mockDeps({
    busca2: [{ titulo: 'CNPJ 03.373.661/0001-50', url: 'https://x.com.br', descricao: '' }],
    receita: { '03373661000150': LUXFOR },
    ftid: '0x935a1b2c3d4e5f60:0x1a2b3c4d5e6f7a8b',
  });
  // Precisa de um "site oficial" na busca 1 para tentar o ftid.
  deps.buscarWeb = async (q) => (q.endsWith(' CNPJ')
    ? [{ titulo: 'CNPJ 03.373.661/0001-50', url: 'https://cnpj.biz/x', descricao: '' }]
    : [{ titulo: 'Luxfor', url: 'https://www.luxfor.com.br/', descricao: '' }]);
  const f = await gerarFicha(parseLinha('baterias luxfor rio verde'), deps);
  assert.equal(f.maps.url, 'https://www.google.com/maps?ftid=0x935a1b2c3d4e5f60:0x1a2b3c4d5e6f7a8b');
});

test('CNPJ ambíguo: prefere o ATIVO e lista os outros', async () => {
  const baixada = cnpjValido('445556660001');
  const ativa = cnpjValido('445556660002');
  const base = { municipio: 'RIO VERDE', uf: 'GO', razao_social: 'MERCADO BOA VISTA LTDA', qsa: [{ nome_socio: 'FULANO' }] };
  const deps = mockDeps({
    busca2: [
      { titulo: `Mercado Boa Vista ${formatarCnpj(baixada)}`, url: 'https://a.com', descricao: '' },
      { titulo: `Mercado Boa Vista ${formatarCnpj(ativa)}`, url: 'https://b.com', descricao: '' },
    ],
    receita: {
      [baixada]: { ...base, cnpj: baixada, nome_fantasia: 'MERCADO BOA VISTA', situacao_cadastral: 8, descricao_situacao_cadastral: 'BAIXADA' },
      [ativa]: { ...base, cnpj: ativa, nome_fantasia: 'MERCADO BOA VISTA', situacao_cadastral: 2, descricao_situacao_cadastral: 'ATIVA' },
    },
  });
  const f = await gerarFicha(parseLinha('mercado boa vista, rio verde'), deps);
  assert.equal(f.empresa.cnpj, ativa);
  assert.equal(f.empresa.nome_exibido, 'MERCADO BOA VISTA');
  assert.equal(f.ambiguo, true);
  assert.equal(f.outros_candidatos.length, 1);
  assert.equal(f.outros_candidatos[0].cnpj, baixada);
});

test('empresa baixada recebe BAIXADA no nome', async () => {
  const c = cnpjValido('778889990001');
  const deps = mockDeps({
    busca2: [{ titulo: `CNPJ ${c}`, url: 'https://a.com', descricao: '' }],
    receita: { [c]: { cnpj: c, municipio: 'JATAI', uf: 'GO', nome_fantasia: '', razao_social: 'PADARIA SOL NASCENTE LTDA', situacao_cadastral: 8, descricao_situacao_cadastral: 'BAIXADA', qsa: [] } },
  });
  const f = await gerarFicha(parseLinha('padaria sol nascente jataí'), deps);
  assert.equal(f.empresa.nome_exibido, 'PADARIA SOL NASCENTE LTDA BAIXADA');
  assert.equal(f.empresa.baixada, true);
  assert.equal(f.socio.origem, 'razão social');
});

test('Instagram não encontrado no fluxo e nenhum CNPJ conferindo', async () => {
  const deps = mockDeps({
    busca1: [{ titulo: 'Outra loja (@outraloja)', url: 'https://www.instagram.com/outraloja/', descricao: '' }],
    busca2: [{ titulo: 'CNPJ 03.373.661/0001-50', url: 'https://a.com', descricao: '' }],
    receita: { '03373661000150': LUXFOR },
  });
  const f = await gerarFicha(parseLinha('loja fantasma rio verde'), deps);
  assert.equal(f.instagram.status, 'nao_encontrado');
  assert.equal(f.instagram.url, null);
  assert.equal(f.empresa.status, 'nao_encontrado');
  assert.equal(f.etapas.receita.status, 'nao_encontrado');
  assert.equal(f.maps.status, 'nao_encontrado');
  assert.equal(f.candidatos_descartados[0].motivo, 'nome diferente do digitado');
});

test('falhas viram status sem derrubar as outras empresas', async () => {
  const deps = {
    buscarWeb: async (q) => {
      if (q.startsWith('quebra')) throw new Error('tempo esgotado (8 s)');
      return q.endsWith(' CNPJ') ? [{ titulo: '03.373.661/0001-50', url: 'https://a.com', descricao: '' }] : [];
    },
    consultarReceita: async () => LUXFOR,
    buscarFtidNoSite: async () => null,
  };
  const eventos = [];
  const itens = ['quebra tudo rio verde', 'baterias luxfor rio verde', 'x'].map(parseLinha);
  const r = await processarLista(itens, deps, (e) => eventos.push(e));
  assert.equal(r[0].etapas.busca_web.status, 'erro');
  assert.equal(r[0].instagram.status, 'erro');
  assert.equal(r[0].etapas.busca_cnpj.status, 'erro');
  assert.equal(r[1].empresa.status, 'ok');
  assert.equal(r[2].empresa.status, 'erro');
  assert.equal(eventos.filter((e) => e.tipo === 'resultado').length, 3);
  assert.ok(eventos.some((e) => e.tipo === 'etapa' && e.etapa === 'receita'));
});

test('erro na Receita vira status erro', async () => {
  const deps = mockDeps({
    busca2: [{ titulo: '03.373.661/0001-50', url: 'https://a.com', descricao: '' }],
    receita: { '03373661000150': new Error('Minha Receita respondeu HTTP 503') },
  });
  const f = await gerarFicha(parseLinha('baterias luxfor rio verde'), deps);
  assert.equal(f.etapas.receita.status, 'erro');
  assert.equal(f.empresa.status, 'erro');
});

test('Instagram fora da 1ª busca: faz busca extra "nome cidade site:instagram.com"', async () => {
  const chamadas = [];
  const deps = {
    buscarWeb: async (q) => {
      chamadas.push(q);
      if (q.endsWith(' site:instagram.com')) {
        return [{ titulo: 'Farmácia Du Povo Popular (@farmaciadupovopopular)', url: 'https://www.instagram.com/farmaciadupovopopular/', descricao: '' }];
      }
      return [];
    },
    consultarReceita: async () => null,
    buscarFtidNoSite: async () => null,
  };
  const f = await gerarFicha(parseLinha('farmácia du povo popular bom jesus de goiás'), deps);
  assert.deepEqual(chamadas, [
    'farmácia du povo popular bom jesus de goiás',
    'farmácia du povo popular Bom Jesus de Goiás site:instagram.com',
    'farmácia du povo popular bom jesus de goiás CNPJ',
  ]);
  assert.equal(f.instagram.url, 'https://www.instagram.com/farmaciadupovopopular/');
});

test('com Instagram na 1ª busca, não gasta busca extra', async () => {
  const chamadas = [];
  const deps = mockDeps({
    chamadas,
    busca1: [{ titulo: 'Baterias Luxfor', url: 'https://www.instagram.com/bateriasluxfor.ltda/' }],
  });
  await gerarFicha(parseLinha('baterias luxfor rio verde'), deps);
  assert.equal(chamadas.length, 2);
});

// Caso real: loja da bandeira "Rede Construção" que na Receita se chama "GEMEOS PRESTACAO DE SERVICOS".
const GEMEOS = {
  cnpj: '25238010000190', municipio: 'BOM JESUS DE GOIAS', uf: 'GO', situacao_cadastral: 2, descricao_situacao_cadastral: 'ATIVA',
  nome_fantasia: 'GEMEOS PRESTACAO DE SERVICOS', razao_social: 'GEMEOS PRESTACAO DE SERVICOS ELETRICOS E ELETRONICOS LTDA',
  logradouro: 'TRANCREDO RODRIGUES DA CUNHA', numero: '514', ddd_telefone_1: '6436081234', qsa: [{ nome_socio: 'FULANO GEMEOS' }],
};
const LOCAL_GEMEOS = {
  titulo: 'Rede Construcao - Gemeos', endereco: 'R. João Rodrigues da Cunha Júnior, 514 - Bom Jesus de Goiás - GO, 75570-000',
  telefone: '', site: 'https://www.instagram.com/gemeosmateriais/', cid: '1234567890123456789',
};

function depsGemeos(local, dados = GEMEOS) {
  return {
    buscarWeb: async (q) => (q.endsWith(' CNPJ') ? [{ titulo: 'Gemeos 25.238.010/0001-90', url: 'https://a.com', descricao: '' }] : []),
    buscarLocal: async () => [local],
    consultarReceita: async () => dados,
    buscarFtidNoSite: async () => null,
  };
}

test('nome diferente na Receita, confirmado pelo endereço do Google Maps', async () => {
  const f = await gerarFicha(parseLinha('Rede Construcao - Gemeos', { cidade: 'Bom Jesus de Goiás', uf: 'GO' }), depsGemeos(LOCAL_GEMEOS));
  assert.equal(f.empresa.status, 'ok');
  assert.equal(f.empresa.cnpj_formatado, '25.238.010/0001-90');
  assert.equal(f.empresa.confirmacao, 'endereço');
  assert.equal(f.socio.nome, 'FULANO GEMEOS');
  assert.equal(f.maps.url, 'https://maps.google.com/?cid=1234567890123456789');
  assert.equal(f.instagram.url, 'https://www.instagram.com/gemeosmateriais/');
});

test('confirmação por telefone; sem confirmação o CNPJ continua descartado', async () => {
  const comTelefone = { ...LOCAL_GEMEOS, endereco: 'Bom Jesus de Goiás - GO', telefone: '(64) 3608-1234' };
  const f = await gerarFicha(parseLinha('Rede Construcao - Gemeos', { cidade: 'Bom Jesus de Goiás', uf: 'GO' }), depsGemeos(comTelefone));
  assert.equal(f.empresa.confirmacao, 'telefone');

  const semNada = { ...LOCAL_GEMEOS, endereco: 'Av. Outra, 99 - Bom Jesus de Goiás - GO', telefone: '(64) 9999-0000' };
  const g = await gerarFicha(parseLinha('Rede Construcao - Gemeos', { cidade: 'Bom Jesus de Goiás', uf: 'GO' }), depsGemeos(semNada));
  assert.equal(g.empresa.status, 'nao_encontrado');
  assert.equal(g.candidatos_descartados[0].motivo, 'nome diferente do digitado');
  // O link do Maps vem do lugar do Google mesmo sem CNPJ.
  assert.equal(g.maps.status, 'ok');
});

test('lugar do Google de outra cidade ou outro nome é ignorado', async () => {
  const outraCidade = { ...LOCAL_GEMEOS, endereco: 'R. João Rodrigues da Cunha Júnior, 514 - Jataí - GO' };
  const f = await gerarFicha(parseLinha('Rede Construcao - Gemeos', { cidade: 'Bom Jesus de Goiás', uf: 'GO' }), depsGemeos(outraCidade));
  assert.equal(f.local, null);
  assert.equal(f.empresa.status, 'nao_encontrado');
  assert.equal(f.maps.status, 'nao_encontrado');
});
