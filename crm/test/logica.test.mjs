import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioDaSemana, somarDias } from '../lib/datas.js';
import { pesquisaVazia, analisar, opsPesquisa, opcoesSegurados, pesquisaDoLead, numero } from '../lib/pesquisa.js';
import { opsFollowup, faltaNoFollowup, opsReativar, estaNaAgenda, esfriando, tentativasSemDecisor, sugerirData } from '../lib/etapas.js';
import { periodo, funil, esperadoAteHoje, metasDo, taxasDasMetas, passagens, simular, mercado, conversaoPor, ciclo } from '../lib/painel.js';

const agora = new Date('2026-11-11T13:00:00Z');
const base = (extra) => ({ ...pesquisaVazia(), empresa: 'ACME', cidade: 'Rio Verde', ...extra });
const decisor = { falou_decisor: true, decisor_nome: 'Rafael', decisor_whatsapp: '64999990000' };
const leadDe = (ops) => ops.find((o) => o.tabela === 'leads').linha;
const eventos = (ops) => ops.filter((o) => o.tabela === 'contatos').map((o) => o.linha.evento);

test('datas: semana começa na segunda, virada de mês e ano', () => {
  assert.equal(inicioDaSemana('2026-11-10'), '2026-11-09');
  assert.equal(inicioDaSemana('2026-11-15'), '2026-11-09');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
});

test('pesquisa: decisor ausente pede data e hora; vira retorno', () => {
  const f = base({ falou_decisor: false });
  assert.deepEqual(analisar(f).falta, ['Data do retorno', 'Hora do retorno']);
  const ops = opsPesquisa({ ...f, data: '2026-11-14', hora: '09:30' }, { agora });
  const l = leadDe(ops);
  assert.equal(l.etapa, 'lead');
  assert.equal(l.proximo_tipo, 'retorno');
  assert.equal(l.hora_proximo_passo, '09:30');
  assert.deepEqual(eventos(ops), ['abordagem']);
  assert.equal(ops[1].linha.decisor, false);
});

test('pesquisa: decisor exige nome e WhatsApp; 0 veículos = bandeira, sem retorno', () => {
  assert.ok(analisar(base({ falou_decisor: true })).falta.includes('Nome do decisor'));
  const l = leadDe(opsPesquisa(base({ ...decisor, veiculos: 0 }), { agora }));
  assert.equal(l.bandeira, true);
  assert.equal(l.motivo_bandeira, 'Sem veículos');
  assert.equal(l.data_proximo_passo, null);
});

test('pesquisa: segurados limitados aos veículos; 4+ com "quantos"', () => {
  assert.deepEqual(opcoesSegurados(2), [0, 1, 2]);
  assert.deepEqual(opcoesSegurados(16), [0, 1, 2, 3, '4+']);
  assert.equal(numero('4+', ''), 4);
  assert.equal(numero('4+', '16'), 16);
});

test('pesquisa: sem seguro -> motivo -> reunião agendada = MQL', () => {
  const f = base({ ...decisor, veiculos: 3, segurados: 0 });
  assert.ok(analisar(f).falta.includes('Por que ainda não protegeu?'));
  const g = { ...f, motivo_sem_seguro: 'Outro', motivo_outro: '', agendou_reuniao: true, data: '2026-11-13', hora: '14:00' };
  assert.ok(analisar(g).falta.includes('Qual o motivo?'));
  const ops = opsPesquisa({ ...g, motivo_outro: 'Acha caro' }, { agora });
  const l = leadDe(ops);
  assert.equal(l.etapa, 'mql');
  assert.equal(l.motivo_sem_seguro, 'Acha caro');
  assert.equal(l.proximo_tipo, 'reuniao');
  assert.deepEqual(eventos(ops), ['abordagem', 'mql']);
});

test('pesquisa: sem seguro e não agendou = perdido, com motivo', () => {
  const ops = opsPesquisa(base({ ...decisor, veiculos: 1, segurados: 0, motivo_sem_seguro: 'Condição financeira', agendou_reuniao: false }), { agora });
  assert.equal(leadDe(ops).etapa, 'perdido');
  assert.deepEqual(eventos(ops), ['abordagem', 'perda']);
});

test('pesquisa: todos segurados -> retorno no dia 1 do vencimento; nota 4-5 = bandeira', () => {
  const f = base({ ...decisor, veiculos: 2, segurados: 2, seguradora: 'Porto', vencimento: '2027-03' });
  assert.ok(analisar(f).falta.includes('Nota do seguro atual'));
  let l = leadDe(opsPesquisa({ ...f, nota: 5 }, { agora }));
  assert.equal(l.data_proximo_passo, '2027-03-01');
  assert.equal(l.proximo_tipo, 'vencimento');
  assert.equal(l.bandeira, true);
  assert.equal(l.motivo_bandeira, 'Satisfeito com o seguro');
  l = leadDe(opsPesquisa({ ...f, nota: 2 }, { agora }));
  assert.equal(l.bandeira, false);
  assert.equal(l.etapa, 'lead');
  assert.equal(estaNaAgenda(l, '2027-03-01'), true);
  assert.equal(estaNaAgenda({ ...l, bandeira: true }, '2027-03-01'), true); // bandeira volta pelo vencimento
  assert.equal(estaNaAgenda({ ...l, bandeira: true, proximo_tipo: 'retorno' }, '2027-03-01'), false);
});

test('pesquisa: parte segurada cria 2º lead (segurados) que não conta como abordagem', () => {
  const f = base({ ...decisor, veiculos: '4+', veiculos_qtd: '5', segurados: 2, motivo_sem_seguro: 'Não é prioridade', agendou_reuniao: true,
    data: '2026-11-13', hora: '10:00', seguradora: 'Allianz', vencimento: '2027-05', nota: 3 });
  const ops = opsPesquisa(f, { agora });
  const leads = ops.filter((o) => o.tabela === 'leads').map((o) => o.linha);
  assert.equal(leads.length, 2);
  const [pai, filho] = leads;
  assert.equal(pai.n_veiculos, 5);
  assert.equal(pai.etapa, 'mql');
  assert.equal(filho.lead_pai_id, pai.id);
  assert.equal(filho.n_veiculos, 2);
  assert.equal(filho.data_proximo_passo, '2027-05-01');
  assert.equal(filho.etapa, 'lead');
  assert.equal(ops.filter((o) => o.tabela === 'contatos' && o.linha.lead_id === filho.id).length, 0);
  // Num retorno, se já existe o filho, não cria outro.
  assert.equal(opsPesquisa(f, { lead: pai, modo: 'retorno', filhos: [filho], agora }).filter((o) => o.tabela === 'leads').length, 1);
});

test('pesquisa: retorno conta como retorno, mantém id; pesquisaDoLead reconstrói', () => {
  const l0 = leadDe(opsPesquisa(base({ falou_decisor: false, data: '2026-11-12', hora: '08:00' }), { agora }));
  const ops = opsPesquisa(base({ ...decisor, veiculos: 0 }), { lead: l0, modo: 'retorno', agora });
  assert.equal(leadDe(ops).id, l0.id);
  assert.deepEqual(eventos(ops), ['retorno']);
  const f = pesquisaDoLead({ ...l0, n_veiculos: 16, veiculos_mais: false, n_segurados: 4, falou_decisor: true });
  assert.equal(f.veiculos, '4+');
  assert.equal(f.veiculos_qtd, '16');
});

test('follow-up: MQL -> SQL com veículos cotados; no-show mantém MQL; venda e contrato', () => {
  const mql = { id: 'x', etapa: 'mql', empresa: 'ACME' };
  assert.deepEqual(faltaNoFollowup('mql', { acao: 'sql' }), ['Veículos cotados', 'Data do próximo passo']);
  let [c, l] = opsFollowup(mql, { acao: 'sql', veiculos: '9', data: '2026-11-13' }, agora).map((o) => o.linha);
  assert.equal(c.evento, 'sql'); assert.equal(c.veiculos, 9); assert.equal(c.etapa, 'mql'); assert.equal(l.etapa, 'sql');
  [c, l] = opsFollowup(mql, { acao: 'no_show', data: '2026-11-14', hora: '15:00' }, agora).map((o) => o.linha);
  assert.equal(l.etapa, 'mql'); assert.equal(c.evento, 'no_show');
  [c, l] = opsFollowup({ ...mql, etapa: 'sql' }, { acao: 'venda', veiculos: 3, data: '2026-11-15' }, agora).map((o) => o.linha);
  assert.equal(l.etapa, 'venda'); assert.equal(l.proximo_tipo, 'contrato');
  [c, l] = opsFollowup({ ...mql, etapa: 'venda' }, { acao: 'associado', veiculos: 2 }, agora).map((o) => o.linha);
  assert.equal(l.etapa, 'associado'); assert.equal(l.data_proximo_passo, null);
  [c, l] = opsFollowup({ ...mql, etapa: 'sql' }, { acao: 'perda', motivo: 'Preço' }, agora).map((o) => o.linha);
  assert.equal(l.etapa, 'perdido'); assert.equal(c.motivo, 'Preço'); assert.equal(c.etapa, 'sql');
  [c, l] = opsReativar({ ...mql, etapa: 'perdido', bandeira: true }, agora).map((o) => o.linha);
  assert.equal(l.etapa, 'lead'); assert.equal(l.bandeira, false); assert.equal(c.evento, 'reativacao');
});

test('cadência, esfriando e tentativas sem decisor', () => {
  assert.equal(sugerirData('negociacao', null, '2026-11-11'), '2026-11-13');
  assert.equal(sugerirData('negociacao', { metas: { cadencia: { negociacao: 5 } } }, '2026-11-11'), '2026-11-16');
  const l = { etapa: 'sql', data_proximo_passo: '2026-12-01' };
  assert.equal(esfriando(l, [{ data: '2026-11-01T12:00:00Z' }], 7, '2026-11-11'), 10);
  assert.equal(esfriando(l, [{ data: '2026-11-08T12:00:00Z' }], 7, '2026-11-11'), null);
  const cs = [{ data: '1', decisor: false }, { data: '2', decisor: true }, { data: '3', decisor: false }, { data: '4', decisor: false }, { data: '5', decisor: false }];
  assert.equal(tentativasSemDecisor(cs), 3);
});

// Funil do exemplo do usuário: 100 leads, 30 MQL, 10 SQL (cada um 3 veículos), 3 vendas, 2 contratos.
function exemplo() {
  const cs = [];
  const ev = (i, evento, veiculos = null) => cs.push({ lead_id: `L${i}`, data: '2026-11-10T13:00:00Z', evento, veiculos, etapa: 'lead' });
  for (let i = 0; i < 100; i++) ev(i, 'abordagem');
  for (let i = 0; i < 30; i++) ev(i, 'mql');
  for (let i = 0; i < 10; i++) ev(i, 'sql', 3);
  for (let i = 0; i < 3; i++) ev(i, 'venda', i === 0 ? 3 : 2);
  for (let i = 0; i < 2; i++) ev(i, 'associado', i === 0 ? 3 : 2);
  ev(50, 'perda'); cs[cs.length - 1].motivo = 'Preço'; cs[cs.length - 1].etapa = 'sql';
  return cs;
}

test('painel: funil por eventos, empresas no topo e veículos no fundo', () => {
  const f = funil(exemplo(), periodo('semana', '2026-11-11'));
  assert.equal(f.leads, 100); assert.equal(f.mql, 30); assert.equal(f.sql_empresas, 10); assert.equal(f.sql, 30);
  assert.equal(f.vendas, 7); assert.equal(f.vendas_empresas, 3); assert.equal(f.associados, 5); assert.equal(f.associados_empresas, 2);
  assert.equal(f.taxas.lead_mql, 0.3);
  assert.ok(Math.abs(f.taxas.mql_sql - 1 / 3) < 1e-9);
  assert.ok(Math.abs(f.taxas.sql_venda - 7 / 30) < 1e-9);
  assert.equal(f.taxas.total_empresas, 0.02);
  assert.equal(f.taxas.veic_por_cotacao, 3);
  assert.deepEqual(f.perdas, { sql: { total: 1, motivos: { Preço: 1 } } });
  assert.equal(funil(exemplo(), periodo('semana', '2026-11-20')).leads, 0);
});

test('painel: velocímetro anda em 5 dias na semana; metas ÷ 4', () => {
  const p = periodo('semana', '2026-11-11'); // seg 09/11
  assert.equal(esperadoAteHoje(p, '2026-11-09'), 0.2);
  assert.equal(esperadoAteHoje(p, '2026-11-11'), 0.6);
  assert.equal(esperadoAteHoje(p, '2026-11-14'), 1); // sábado
  assert.equal(esperadoAteHoje(p, '2026-11-20'), 1);
  assert.equal(esperadoAteHoje(periodo('mes', '2026-11-11'), '2026-11-15'), 0.5);
  assert.deepEqual(metasDo({ metas: { leads: 100, mql: 30 } }, 'semana'), { leads: 25, mql: 7.5, sql: null, vendas: null, associados: null });
});

test('painel: gargalo = passagem mais abaixo do que as metas pressupõem', () => {
  const f = funil(exemplo(), periodo('semana', '2026-11-11'));
  const esp = taxasDasMetas({ leads: 100, mql: 30, sql: 30, vendas: 15, associados: 10 }, 3);
  assert.equal(esp.mql_sql, 1 / 3);
  const ps = passagens(f, esp);
  assert.equal(ps.find((x) => x.gargalo).k, 'sql_venda'); // real 23% vs 50% esperado
});

test('simulador: de trás para a frente (exemplo da conversa)', () => {
  const s = simular({ associados: 20, venda_assoc: 2 / 3, sql_venda: 1 / 3, veic_por_cotacao: 3, mql_sql: 1 / 3, lead_mql: 0.3 });
  assert.ok(Math.abs(s.vendas - 30) < 1e-9);
  assert.ok(Math.abs(s.sql - 90) < 1e-9);
  assert.ok(Math.abs(s.sqlEmpresas - 30) < 1e-9);
  assert.ok(Math.abs(s.mql - 90) < 1e-9);
  assert.ok(Math.abs(s.leads - 300) < 1e-9);
  assert.ok(Math.abs(s.leadsSemana - 75) < 1e-9);
  assert.ok(Math.abs(s.leadsDia - 15) < 1e-9);
  assert.equal(simular({ associados: 20, lead_mql: 0 }), null);
});

test('mercado, conversão por origem e ciclo', () => {
  const p = periodo('mes', '2026-11-11');
  const leads = [
    { id: 'a', cidade: 'Caçu', origem: 'abordagem', falou_decisor: true, n_veiculos: 5, n_segurados: 2, seguradora: 'Porto', nota_seguro: 2, motivo_sem_seguro: 'Não é prioridade', vencimento_seguro: '2027-03-01' },
    { id: 'b', cidade: 'Caçu', origem: 'indicacao', falou_decisor: true, n_veiculos: 2, n_segurados: 2, seguradora: 'porto ', nota_seguro: 5, vencimento_seguro: '2027-03-01' },
    { id: 'c', cidade: 'Rio Verde', origem: 'abordagem', falou_decisor: true, n_veiculos: 0 },
    { id: 'd', cidade: 'Rio Verde', origem: 'abordagem', falou_decisor: false },
    { id: 'e', cidade: 'Caçu', origem: 'abordagem', falou_decisor: true, n_veiculos: 2, n_segurados: 2, lead_pai_id: 'a' },
  ];
  const cs = ['a', 'b', 'c', 'd'].map((id) => ({ lead_id: id, evento: 'abordagem', data: '2026-11-03T12:00:00Z' }));
  cs.push({ lead_id: 'a', evento: 'mql', data: '2026-11-05T12:00:00Z' }, { lead_id: 'a', evento: 'associado', data: '2026-11-13T12:00:00Z' });
  const m = mercado(leads, cs, p);
  assert.equal(m.abordadas, 4); assert.equal(m.pesquisadas, 3); assert.equal(m.com_veiculos, 2); assert.equal(m.sem_veiculos, 1);
  assert.equal(m.veiculos, 7); assert.equal(m.segurados, 4); assert.equal(m.sem_seguro, 3);
  assert.equal(m.seguradoras.length, 1); // "Porto" e "porto " são a mesma
  assert.equal(m.seguradoras[0].empresas, 2); assert.equal(m.seguradoras[0].nota_media, 3.5);
  assert.deepEqual(m.motivos, { 'Não é prioridade': 1 });
  assert.deepEqual(m.vencimentos, { '2027-03': 4 });
  assert.equal(mercado(leads, cs, p, 'Rio Verde').abordadas, 2);
  const o = conversaoPor('origem', leads, cs, p);
  assert.deepEqual(o.map((x) => [x.grupo, x.leads, x.mql]), [['Abordagem', 3, 1], ['Indicação', 1, 0]]);
  const c = ciclo(cs);
  assert.equal(c.lead_mql.mediana, 2); assert.equal(c.total.mediana, 10);
});
