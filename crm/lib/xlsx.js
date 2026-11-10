// Planilha .xlsx com duas abas (Empresas e Histórico): valores em português, datas como datas, cabeçalho fixo.
import { rotulo } from './rotulos.js';
import { deISO } from './datas.js';

const dataHora = (v) => (v ? new Date(v) : null);
const data = (v) => (v ? deISO(v) : null);
const simNao = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '');

const COLS_EMPRESAS = [
  { header: 'Empresa', key: 'empresa', width: 32, v: (l) => l.empresa },
  { header: 'Cidade', key: 'cidade', width: 18, v: (l) => l.cidade },
  { header: 'Origem', key: 'origem', width: 12, v: (l) => rotulo('origem', l.origem) },
  { header: 'Indicado por', key: 'indicado_por', width: 18, v: (l) => l.indicado_por },
  { header: 'Tipo', key: 'tipo', width: 8, v: (l) => rotulo('tipo', l.tipo) },
  { header: 'Nº veículos', key: 'n_veiculos', width: 11, v: (l) => l.n_veiculos },
  { header: 'Estratégia', key: 'estrategia', width: 18, v: (l) => rotulo('estrategia', l.estrategia) },
  { header: 'Falou c/ decisor', key: 'falou_decisor', width: 14, v: (l) => simNao(l.falou_decisor) },
  { header: 'Resultado', key: 'resultado', width: 14, v: (l) => rotulo('resultado', l.resultado) },
  { header: 'Situação', key: 'faixa_cadencia', width: 15, v: (l) => rotulo('faixa_cadencia', l.faixa_cadencia) },
  { header: 'Vencimento do seguro', key: 'vencimento_seguro', width: 14, v: (l) => data(l.vencimento_seguro), fmt: 'dd/mm/yyyy' },
  { header: 'Próximo passo', key: 'proximo_passo', width: 32, v: (l) => l.proximo_passo },
  { header: 'Data do próximo passo', key: 'data_proximo_passo', width: 14, v: (l) => data(l.data_proximo_passo), fmt: 'dd/mm/yyyy' },
  { header: 'Motivo (não)', key: 'motivo_nao', width: 18, v: (l) => l.motivo_nao },
  { header: 'Observação', key: 'observacao', width: 50, v: (l) => l.observacao },
  { header: 'Arquivado', key: 'arquivado', width: 10, v: (l) => simNao(l.arquivado) },
  { header: 'Criado em', key: 'criado_em', width: 17, v: (l) => dataHora(l.criado_em), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'Atualizado em', key: 'atualizado_em', width: 17, v: (l) => dataHora(l.atualizado_em), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'id', key: 'id', width: 38, v: (l) => l.id },
];

const COLS_HISTORICO = [
  { header: 'Data', key: 'data', width: 17, v: (c) => dataHora(c.data), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'Empresa', key: 'empresa', width: 32, v: (c, porId) => porId.get(c.lead_id)?.empresa },
  { header: 'Resultado', key: 'resultado', width: 14, v: (c) => rotulo('resultado', c.resultado) },
  { header: 'Observação', key: 'observacao', width: 60, v: (c) => c.observacao },
  { header: 'id da empresa', key: 'lead_id', width: 38, v: (c) => c.lead_id },
  { header: 'id', key: 'id', width: 38, v: (c) => c.id },
];

function aba(wb, nome, cols, linhas, ...extra) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(({ header, key, width }) => ({ header, key, width }));
  for (const l of linhas) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.v(l, ...extra) ?? null])));
  cols.forEach((c, i) => { if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt; });
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  cab.alignment = { vertical: 'middle', wrapText: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export async function gerarXLSX(leads, contatos) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Micro CRM';
  const porId = new Map(leads.map((l) => [l.id, l]));
  aba(wb, 'Empresas', COLS_EMPRESAS, leads);
  aba(wb, 'Histórico', COLS_HISTORICO, [...contatos].sort((a, b) => String(a.data).localeCompare(String(b.data))), porId);
  return wb.xlsx.writeBuffer();
}
