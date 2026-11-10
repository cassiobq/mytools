import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFatos, diaBR, horaBR } from '../supabase/functions/relatorio/fatos.js';

test('horário de Brasília: 01h UTC ainda é o dia anterior em Brasília', () => {
  assert.equal(diaBR('2026-11-05T01:30:00Z'), '2026-11-04');
  assert.equal(horaBR('2026-11-04T11:57:00Z'), '08h57');
});

test('fatos do período: só contatos dentro do intervalo, números calculados sem IA', () => {
  const leads = [
    { id: 'a', empresa: '_Frota A', cidade: 'Caçu', tipo: 'frota', n_veiculos: 10, origem: 'abordagem', falou_decisor: true, criado_em: '2026-11-04T12:00:00Z', resultado: 'venda', faixa_cadencia: '4_interessado' },
    { id: 'b', empresa: '_Loja B', cidade: 'Caçu', tipo: 'PF', origem: 'indicacao', falou_decisor: false, criado_em: '2026-11-04T15:00:00Z', resultado: 'sem_interesse', motivo_nao: 'Preço', faixa_cadencia: '3_recusou' },
    { id: 'c', empresa: '_Antiga C', cidade: 'Rio Verde', tipo: 'frota', n_veiculos: 4, origem: 'abordagem', falou_decisor: true, criado_em: '2026-10-01T12:00:00Z', resultado: 'cotacao', faixa_cadencia: '4_interessado' },
    { id: 'd', empresa: '_Fora D', cidade: 'Caçu', tipo: 'PF', origem: 'abordagem', criado_em: '2026-10-01T12:00:00Z', resultado: 'agendou' },
  ];
  const contatos = [
    { lead_id: 'a', data: '2026-11-04T12:00:00Z', resultado: 'cotacao', observacao: 'Pediu cotação' },
    { lead_id: 'a', data: '2026-11-05T13:00:00Z', resultado: 'venda', observacao: 'Fechou' },
    { lead_id: 'b', data: '2026-11-04T15:00:00Z', resultado: 'sem_interesse', observacao: 'Caro' },
    { lead_id: 'c', data: '2026-11-05T14:00:00Z', resultado: 'cotacao', observacao: 'Retorno' },
    { lead_id: 'd', data: '2026-10-01T12:00:00Z', resultado: 'agendou', observacao: 'Fora do período' },
    { lead_id: 'a', data: '2026-11-06T03:30:00Z', resultado: 'venda', observacao: 'Ainda dia 06 00h30 BR, fora' },
  ];
  const f = montarFatos(leads, contatos, '2026-11-04', '2026-11-05');
  assert.deepEqual(f.empresas.map((e) => e.empresa), ['_Frota A', '_Loja B', '_Antiga C']);
  assert.equal(f.empresas[0].contatos.length, 2);
  assert.equal(f.empresas[0].contatos[0].hora, '09h00');
  const n = f.numeros;
  assert.deepEqual(
    [n.empresas_contatadas, n.contatos_registrados, n.empresas_novas, n.retornos_a_empresas_antigas, n.frotas, n.veiculos_nas_frotas, n.falou_com_decisor, n.indicacoes_recebidas, n.cotacoes, n.vendas, n.sem_interesse],
    [3, 4, 2, 1, 2, 14, 2, 1, 2, 1, 1],
  );
  assert.deepEqual(n.motivos_sem_interesse, { Preço: 1 });
  assert.deepEqual(n.empresas_por_cidade, { Caçu: 2, 'Rio Verde': 1 });
  assert.deepEqual(f.periodo, { inicio: '04/11/2026', fim: '05/11/2026', dias_com_atividade: 2 });
});

test('docx: números vêm dos fatos e funciona com e sem o texto da IA', async () => {
  const { gerarRelatorioDOCX, resultadosConsolidados, textoDoPeriodo } = await import('../lib/relatorio.js');
  const leads = [{ id: 'a', criado_em: '2026-11-04T11:57:00Z', origem: 'abordagem', tipo: 'frota', n_veiculos: 6, empresa: '_Medeiros', cidade: 'Caçu', falou_decisor: true, resultado: 'cotacao', faixa_cadencia: '4_interessado', arquivado: false }];
  const contatos = [{ id: 'c', lead_id: 'a', data: '2026-11-04T11:57:00Z', resultado: 'cotacao', observacao: 'Pediu cotação' }];
  const f = montarFatos(leads, contatos, '2026-11-04', '2026-11-04');
  assert.equal(textoDoPeriodo(f.periodo), 'Quarta-feira, 04/11/2026');
  assert.match(resultadosConsolidados(f).join(' '), /1 frota prospectada, somando 6 veículos/);
  for (const texto of [null, { resumo_executivo: ['R'], panorama: [], visitas: [{ lead_id: 'a', contato: 'Rafael', pontos: [], status: 's', oportunidade: '' }], oportunidades: [], proximos_passos: [], conclusao: ['C'] }]) {
    const blob = await gerarRelatorioDOCX({ fatos: f, texto, participantes: 'Cássio' });
    assert.ok(blob.size > 5000);
  }
});
