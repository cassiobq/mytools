import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirProximo } from '../lib/cadencia.js';
import { calcularFunil, abordagensDeFrota } from '../lib/funil.js';
import { paraCSV, COLUNAS_CONTATOS } from '../lib/csv.js';
import { inicioDaSemana, somarDias } from '../lib/datas.js';

const hoje = '2026-11-10';

test('cadência: datas sugeridas por faixa', () => {
  assert.deepEqual(sugerirProximo({ faixa: '1_dono_ausente', hoje }).data, '2026-11-13');
  assert.equal(sugerirProximo({ faixa: '2_ja_tem_seguro', hoje }).data, '2026-12-10'); // sem vencimento: +30
  assert.equal(sugerirProximo({ faixa: '2_ja_tem_seguro', vencimento: '2027-03-01', hoje }).data, '2027-01-15'); // 45 dias antes
  assert.equal(sugerirProximo({ faixa: '2_ja_tem_seguro', vencimento: '2026-12-01', hoje }).data, '2026-11-11'); // perto: amanhã
  assert.equal(sugerirProximo({ faixa: '3_recusou', hoje }).data, '2027-01-09');
  assert.equal(sugerirProximo({ faixa: '4_interessado', hoje }).data, '2026-11-11');
  assert.equal(sugerirProximo({ faixa: '4_interessado', primeiroRetorno: false, hoje }).data, '2026-11-13');
  assert.equal(sugerirProximo({ faixa: 'indicacao', hoje }).data, '2026-11-11');
  assert.equal(sugerirProximo({ faixa: '4_interessado', resultado: 'venda', hoje }), null);
  assert.equal(sugerirProximo({ faixa: null, hoje }), null);
});

test('datas: semana começa na segunda, virada de mês e ano', () => {
  assert.equal(inicioDaSemana('2026-11-10'), '2026-11-09'); // terça -> segunda
  assert.equal(inicioDaSemana('2026-11-15'), '2026-11-09'); // domingo -> segunda anterior
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
});

test('funil: contagens e taxas da semana, por estratégia', () => {
  const t = (d) => `${d}T12:00:00`;
  const leads = [
    { id: 'a', criado_em: t('2026-11-09'), origem: 'abordagem', tipo: 'frota', estrategia: 'visita_agenda', falou_decisor: true },
    { id: 'b', criado_em: t('2026-11-10'), origem: 'abordagem', tipo: 'PF', estrategia: 'visita_agenda', falou_decisor: false },
    { id: 'c', criado_em: t('2026-11-11'), origem: 'indicacao', tipo: 'frota', estrategia: 'ligacao', falou_decisor: true },
    { id: 'd', criado_em: t('2026-11-02'), origem: 'abordagem', tipo: 'frota', estrategia: 'visita_fecha', falou_decisor: true, arquivado: true },
  ];
  const contatos = [
    { lead_id: 'a', data: t('2026-11-09'), resultado: 'cotacao' },
    { lead_id: 'a', data: t('2026-11-12'), resultado: 'venda' },
    { lead_id: 'd', data: t('2026-11-10'), resultado: 'cotacao' }, // lead de outra semana, cotou nesta
    { lead_id: 'c', data: t('2026-11-16'), resultado: 'cotacao' }, // semana seguinte
  ];
  const f = calcularFunil(leads, contatos, '2026-11-12');
  assert.equal(f.inicio, '2026-11-09');
  assert.equal(f.fim, '2026-11-15');
  assert.deepEqual(
    { a: f.total.abordagens, d: f.total.decisor, i: f.total.indicacoes, c: f.total.cotacoes, v: f.total.vendas },
    { a: 2, d: 2, i: 1, c: 2, v: 1 },
  );
  assert.equal(f.total.taxa_venda, 0.5);
  assert.equal(f.porEstrategia.visita_agenda.abordagens, 2);
  assert.equal(f.porEstrategia.visita_fecha.cotacoes, 1);
  assert.equal(f.porEstrategia.ligacao.indicacoes, 1);
  assert.equal(abordagensDeFrota(leads), 2); // a e d (arquivada conta)
});

test('CSV: BOM, aspas, quebras de linha e booleanos', () => {
  const csv = paraCSV([{ id: '1', lead_id: 'x', data: '2026-11-10', resultado: 'venda', observacao: 'disse "ok", fechou\nontem' }], COLUNAS_CONTATOS);
  assert.ok(csv.startsWith('﻿id,lead_id,data,resultado,observacao\r\n'));
  assert.ok(csv.includes('"disse ""ok"", fechou\nontem"'));
});
