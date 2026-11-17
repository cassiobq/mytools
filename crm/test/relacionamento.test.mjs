import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perfilRelacionamento, retornoPorIntervalo, voltaPorIntervalo, proximoVencimento, ultimoContato,
  relacionamentoDe, opsContatoCurto, faltaNoContatoCurto,
} from '../lib/relacionamento.js';
import { situacaoLead } from '../lib/situacao.js';
import { opsPesquisa, pesquisaVazia, limparLead } from '../lib/pesquisa.js';
import { funil, periodo } from '../lib/painel.js';

const agora = new Date('2026-11-11T13:00:00Z'); // 10h em Brasília
const lead = (extra) => ({ id: 'L1', empresa: 'ACME', cidade: 'Rio Verde', etapa: 'lead', arquivado: false, bandeira: false,
  criado_em: '2026-10-01T13:00:00Z', data_proximo_passo: null, proximo_tipo: null, ...extra });
const ct = (data, extra) => ({ id: data, lead_id: 'L1', data: `${data}T13:00:00Z`, evento: 'retorno', decisor: null, observacao: null, ...extra });

test('relacionamento: perfil de cada lead', () => {
  assert.equal(perfilRelacionamento(lead({ n_veiculos: 3, n_segurados: 1 })), 'sem_seguro');
  assert.equal(perfilRelacionamento(lead({ n_veiculos: 2, n_segurados: 2, nota_seguro: 2 })), 'insatisfeito');
  assert.equal(perfilRelacionamento(lead({ n_veiculos: 2, n_segurados: 2, nota_seguro: 5, bandeira: true, motivo_bandeira: 'Satisfeito com o seguro' })), 'satisfeito');
  assert.equal(perfilRelacionamento(lead({ etapa: 'perdido' })), 'perdido');
  assert.equal(perfilRelacionamento(lead({ etapa: 'associado' })), 'associado');
  // Fora: arquivado, 🚩 sem veículos, negociação, lead sem pesquisa
  assert.equal(perfilRelacionamento(lead({ etapa: 'perdido', arquivado: true })), null);
  assert.equal(perfilRelacionamento(lead({ n_veiculos: 0, bandeira: true, motivo_bandeira: 'Sem veículos' })), null);
  assert.equal(perfilRelacionamento(lead({ etapa: 'mql', n_veiculos: 3, n_segurados: 0 })), null);
  assert.equal(perfilRelacionamento(lead({})), null);
});

test('relacionamento: intervalo a partir do último contato, editável na config', () => {
  const l = lead({ n_veiculos: 3, n_segurados: 0, etapa: 'perdido' });
  const cs = [ct('2026-08-01'), ct('2026-08-10')];
  assert.deepEqual(retornoPorIntervalo(l, cs, null), { perfil: 'perdido', dias: 90, ultimo: '2026-08-10', data: '2026-11-08' });
  assert.equal(voltaPorIntervalo(l, cs, null, '2026-11-07'), null);
  assert.equal(voltaPorIntervalo(l, cs, null, '2026-11-08').data, '2026-11-08');
  assert.equal(voltaPorIntervalo(l, cs, null, '2026-11-20').perfil, 'perdido'); // atrasado continua aparecendo
  assert.equal(retornoPorIntervalo(l, cs, { relacionamento: { perdido: 60 } }).data, '2026-10-09');
  assert.equal(relacionamentoDe({ relacionamento: { perdido: 60 } }).sem_seguro, 15);
  // sem contato: conta do dia em que o lead foi criado
  assert.equal(retornoPorIntervalo(lead({ n_veiculos: 2, n_segurados: 1 }), [], null).data, '2026-10-16');
});

test('relacionamento: data marcada pelo usuário vale mais que o intervalo', () => {
  const l = lead({ n_veiculos: 2, n_segurados: 0, proximo_tipo: 'retorno', data_proximo_passo: '2027-01-15' });
  assert.equal(retornoPorIntervalo(l, [ct('2026-09-01')], null), null);
  // retorno marcado já vencido: aparece pela agenda normal, não duplica pelo intervalo
  const atrasado = lead({ n_veiculos: 2, n_segurados: 0, proximo_tipo: 'retorno', data_proximo_passo: '2026-11-01' });
  assert.equal(voltaPorIntervalo(atrasado, [ct('2026-09-01')], null, '2026-11-11'), null);
});

test('relacionamento: insatisfeito volta em 30 dias mesmo com o vencimento como próximo passo', () => {
  const l = lead({ n_veiculos: 2, n_segurados: 2, nota_seguro: 1, seguradora: 'Porto', vencimento_seguro: '2027-06-01',
    proximo_tipo: 'vencimento', data_proximo_passo: '2027-06-01' });
  assert.equal(voltaPorIntervalo(l, [ct('2026-10-01')], null, '2026-10-31').data, '2026-10-31');
});

test('relacionamento: satisfeito só volta no vencimento (que se repete todo ano)', () => {
  const sat = { n_veiculos: 2, n_segurados: 2, nota_seguro: 5, bandeira: true, motivo_bandeira: 'Satisfeito com o seguro', vencimento_seguro: '2026-03-01' };
  // com o vencimento como próximo passo: a agenda normal cuida (sem retorno por intervalo)
  assert.equal(retornoPorIntervalo(lead({ ...sat, proximo_tipo: 'vencimento', data_proximo_passo: '2027-03-01' }), [ct('2026-10-01')], null), null);
  // vencimento já cumprido (sem próximo passo): volta no do ano seguinte ao último contato
  assert.equal(retornoPorIntervalo(lead(sat), [ct('2026-10-01')], null).data, '2027-03-01');
  assert.equal(voltaPorIntervalo(lead(sat), [ct('2026-10-01')], null, '2026-12-01'), null);
  assert.equal(proximoVencimento('2026-03-01', '2026-03-01'), '2027-03-01');
  assert.equal(proximoVencimento('2026-03-01', '2026-02-28'), '2026-03-01');
  assert.equal(retornoPorIntervalo(lead({ ...sat, vencimento_seguro: null }), [ct('2026-10-01')], null), null);
});

test('relacionamento: último contato no fuso do aparelho', () => {
  assert.equal(ultimoContato(lead({}), [{ data: '2026-11-11T02:30:00Z' }]), '2026-11-10'); // 23h30 em Brasília
});

test('contato curto: anotação obrigatória, não muda a etapa nem conta no funil', () => {
  assert.deepEqual(faltaNoContatoCurto({ observacao: ' ' }), ['Anotação']);
  assert.deepEqual(faltaNoContatoCurto({ observacao: 'ok', hora: '10:00' }), ['Data do próximo contato']);
  assert.throws(() => opsContatoCurto(lead({}), { observacao: '' }, agora), /Anotação/);

  const l = lead({ etapa: 'perdido', n_veiculos: 3, n_segurados: 0 });
  const ops = opsContatoCurto(l, { observacao: 'Passei para dar um oi.', data: '2026-12-01', hora: '09:30' }, agora);
  const [c, novo] = ops.map((o) => o.linha);
  assert.equal(c.evento, 'relacionamento');
  assert.equal(c.etapa, 'perdido');
  assert.equal(novo.etapa, 'perdido');
  assert.equal(novo.observacao, 'Passei para dar um oi.');
  assert.deepEqual([novo.proximo_tipo, novo.data_proximo_passo, novo.hora_proximo_passo], ['retorno', '2026-12-01', '09:30']);

  const f = funil([{ ...c, data: agora.toISOString() }], periodo('mes', '2026-11-11'));
  assert.equal(f.leads + f.mql + f.sql + f.vendas + f.associados + f.no_show, 0);
});

test('contato curto sem data: cumpre o próximo passo vencido (o intervalo assume) e mantém o futuro', () => {
  const vencido = lead({ n_veiculos: 2, n_segurados: 0, proximo_tipo: 'retorno', data_proximo_passo: '2026-11-11' });
  const n1 = opsContatoCurto(vencido, { observacao: 'Ligou de volta.' }, agora)[1].linha;
  assert.equal(n1.data_proximo_passo, null);
  assert.equal(n1.proximo_tipo, null);
  const futuro = lead({ proximo_tipo: 'vencimento', data_proximo_passo: '2027-05-01' });
  const n2 = opsContatoCurto(futuro, { observacao: 'Tudo certo.' }, agora)[1].linha;
  assert.equal(n2.data_proximo_passo, '2027-05-01');
});

test('lead: campos de enriquecimento e id do evento do Google não se perdem ao gravar', () => {
  const l = lead({ cnpj: '12.345.678/0001-90', google_event_id: 'abc123', socios: [{ nome: 'Ana' }], enriquecimento: 'ok' });
  const limpo = limparLead(l);
  assert.equal(limpo.cnpj, '12.345.678/0001-90');
  assert.equal(limpo.google_event_id, 'abc123');
  assert.equal(opsContatoCurto(l, { observacao: 'x' }, agora)[1].linha.google_event_id, 'abc123');
  const f = { ...pesquisaVazia(), empresa: 'ACME', cidade: 'Rio Verde', falou_decisor: false, data: '2026-11-14', hora: '09:30' };
  assert.equal(opsPesquisa(f, { lead: l, modo: 'retorno', agora })[0].linha.google_event_id, 'abc123');
});

test('situação: uma linha com tudo, sem sugestão', () => {
  const l = lead({ decisor_nome: 'Rafael', decisor_whatsapp: '64999990000', n_veiculos: 5, n_segurados: 3, seguradora: 'Porto',
    nota_seguro: 2, vencimento_seguro: '2027-03-01', motivo_sem_seguro: 'Condição financeira',
    cnpj: '12.345.678/0001-90', situacao_cadastral: 'ATIVA', socios: [{ nome: 'Ana Souza' }, { nome: 'Rafael Lima' }] });
  const cs = [ct('2026-10-02', { evento: 'abordagem', decisor: true }), ct('2026-11-01', { observacao: 'Pediu para voltar em dezembro.' })];
  const s = situacaoLead(l, cs, { hoje: '2026-11-11' });
  assert.equal(s.linha, 'ACME · Rio Verde · Lead · decisor Rafael (64999990000) · 5 veículos, 3 segurados (Porto, nota 2, vence 03/2027)'
    + ' · sem seguro: Condição financeira · último contato há 10 dias: "Pediu para voltar em dezembro."'
    + ' · 2 contatos · abordado em 02/10 · dados públicos: CNPJ 12.345.678/0001-90 ativa, sócios: Ana Souza, Rafael Lima');
  assert.deepEqual(s.alertas, []);
  assert.doesNotMatch(s.linha, /sugir|deveria|que tal|ligue|visite/i);
});

test('situação: alertas de empresa baixada, tentativas sem decisor, esfriando e 🚩', () => {
  const baixada = situacaoLead(lead({ situacao_cadastral: 'BAIXADA', cnpj: '1' }), [], { hoje: '2026-11-11' });
  assert.deepEqual(baixada.alertas, ['Empresa baixada na Receita']);
  const tres = [1, 2, 3].map((i) => ct(`2026-11-0${i}`, { decisor: false }));
  assert.deepEqual(situacaoLead(lead({}), tres, { hoje: '2026-11-11' }).alertas, ['3 tentativas sem decisor']);
  const frio = situacaoLead(lead({ etapa: 'sql' }), [ct('2026-10-20')], { hoje: '2026-11-11', diasEsfriando: 7 });
  assert.deepEqual(frio.alertas, ['Esfriando: 22 dias sem contato']);
  const flag = situacaoLead(lead({ n_veiculos: 0, bandeira: true, motivo_bandeira: 'Sem veículos' }), [], { hoje: '2026-11-11' });
  assert.deepEqual(flag.alertas, ['🚩 Sem veículos']);
  assert.match(flag.linha, /ACME · Rio Verde · Lead · 0 veículos · abordado em 01\/10/);
  assert.match(situacaoLead(lead({ n_veiculos: 4, veiculos_mais: true }), [], { hoje: '2026-11-11' }).linha, /4\+ veículos/);
});
