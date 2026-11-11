import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFatos, diaBR, horaBR } from '../supabase/functions/relatorio/fatos.js';

test('horário de Brasília: 01h UTC ainda é o dia anterior em Brasília', () => {
  assert.equal(diaBR('2026-11-05T01:30:00Z'), '2026-11-04');
  assert.equal(horaBR('2026-11-04T11:57:00Z'), '08h57');
});

test('fatos do período: funil por eventos (empresas no topo, veículos no fundo), mercado e fuso', () => {
  const leads = [
    { id: 'a', empresa: '_Frota A', cidade: 'Caçu', origem: 'abordagem', falou_decisor: true, decisor_nome: 'Rafael', n_veiculos: 10, n_segurados: 4,
      seguradora: 'Porto', nota_seguro: 2, motivo_sem_seguro: 'Não é prioridade', vencimento_seguro: '2027-03-01', etapa: 'associado' },
    { id: 'b', empresa: '_Loja B', cidade: 'Caçu', origem: 'indicacao', falou_decisor: true, n_veiculos: 0, bandeira: true, motivo_bandeira: 'Sem veículos', etapa: 'lead' },
    { id: 'c', empresa: '_Antiga C', cidade: 'Rio Verde', origem: 'abordagem', falou_decisor: true, n_veiculos: 3, n_segurados: 0, etapa: 'perdido', motivo_nao: 'Preço' },
    { id: 'd', empresa: '_Fora D', cidade: 'Caçu', origem: 'abordagem', etapa: 'lead' },
  ];
  const contatos = [
    { lead_id: 'a', data: '2026-11-04T12:00:00Z', evento: 'abordagem', etapa: 'lead', decisor: true },
    { lead_id: 'a', data: '2026-11-04T12:00:01Z', evento: 'mql', etapa: 'lead' },
    { lead_id: 'a', data: '2026-11-05T13:00:00Z', evento: 'sql', etapa: 'mql', veiculos: 6 },
    { lead_id: 'a', data: '2026-11-05T16:00:00Z', evento: 'venda', etapa: 'sql', veiculos: 5 },
    { lead_id: 'a', data: '2026-11-05T18:00:00Z', evento: 'associado', etapa: 'venda', veiculos: 4 },
    { lead_id: 'b', data: '2026-11-04T15:00:00Z', evento: 'abordagem', etapa: 'lead', decisor: true },
    { lead_id: 'c', data: '2026-11-05T14:00:00Z', evento: 'perda', etapa: 'sql', motivo: 'Preço' },
    { lead_id: 'd', data: '2026-10-01T12:00:00Z', evento: 'abordagem', observacao: 'Fora do período' },
    { lead_id: 'a', data: '2026-11-06T03:30:00Z', evento: 'retorno', observacao: 'Dia 06 00h30 em Brasília: fora' },
  ];
  const f = montarFatos(leads, contatos, '2026-11-04', '2026-11-05');
  assert.deepEqual(f.empresas.map((e) => e.empresa), ['_Frota A', '_Loja B', '_Antiga C']);
  assert.equal(f.empresas[0].contatos.length, 5);
  assert.equal(f.empresas[0].contatos[0].hora, '09h00');
  assert.equal(f.empresas[0].contatos[2].evento, 'Em cotação (SQL)');
  const n = f.numeros;
  assert.deepEqual(
    [n.leads_empresas_abordadas, n.mql_reunioes_agendadas, n.sql_empresas_em_cotacao, n.sql_veiculos_cotados, n.vendas_veiculos, n.associados_veiculos, n.taxa_lead_mql_pct, n.taxa_sql_venda_veiculos_pct],
    [2, 1, 1, 6, 5, 4, 50, 83],
  );
  assert.deepEqual(n.perdas_por_etapa_e_motivo, { 'SQL: Preço': 1 });
  assert.equal(n.indicacoes_recebidas, 1);
  const m = f.mercado;
  assert.deepEqual([m.empresas_com_decisor_pesquisadas, m.empresas_sem_veiculos, m.veiculos_mapeados, m.veiculos_sem_seguro, m.fora_do_perfil], [2, 1, 10, 6, 1]);
  assert.deepEqual(m.seguradoras, [{ nome: 'Porto', empresas: 1, veiculos: 4, nota_media: 2 }]);
  assert.deepEqual(f.periodo, { inicio: '04/11/2026', fim: '05/11/2026', dias_com_atividade: 2 });
});

test('docx: números vêm dos fatos e funciona com e sem o texto da IA', async () => {
  const { gerarRelatorioDOCX, resultadosConsolidados, textoDoPeriodo } = await import('../lib/relatorio.js');
  const leads = [{ id: 'a', origem: 'abordagem', n_veiculos: 6, n_segurados: 2, seguradora: 'Porto', nota_seguro: 3, empresa: '_Medeiros', cidade: 'Caçu',
    falou_decisor: true, decisor_nome: 'Rafael', etapa: 'sql', arquivado: false }];
  const contatos = [
    { id: 'c', lead_id: 'a', data: '2026-11-04T11:57:00Z', evento: 'abordagem', decisor: true, observacao: 'Frota de aluguel' },
    { id: 'd', lead_id: 'a', data: '2026-11-04T11:58:00Z', evento: 'mql' },
    { id: 'e', lead_id: 'a', data: '2026-11-04T18:00:00Z', evento: 'sql', veiculos: 4 },
  ];
  const f = montarFatos(leads, contatos, '2026-11-04', '2026-11-04');
  assert.equal(textoDoPeriodo(f.periodo), 'Quarta-feira, 04/11/2026');
  const r = resultadosConsolidados(f).join(' ');
  assert.match(r, /1 empresa em cotação \(SQL\), somando 4 veículos cotados/);
  assert.match(r, /6 veículos mapeados, 4 sem seguro/);
  for (const texto of [null, { resumo_executivo: ['R'], panorama: [], visitas: [{ lead_id: 'a', contato: 'Rafael', pontos: [], status: 's', oportunidade: '' }], oportunidades: [], proximos_passos: [], conclusao: ['C'] }]) {
    const blob = await gerarRelatorioDOCX({ fatos: f, texto, participantes: 'Cássio' });
    assert.ok(blob.size > 5000);
  }
});
