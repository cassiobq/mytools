// Planilha .xlsx com duas abas (Empresas e Histórico): valores em português, datas como datas, cabeçalho fixo.
// Exporta as empresas recebidas (a tela manda só as filtradas) e o histórico delas.
import { rotulo } from './rotulos.js';
import { deISO } from './datas.js';
import { rotuloEtapa, EVENTOS, TIPOS_PROXIMO } from './etapas.js';

const dataHora = (v) => (v ? new Date(v) : null);
const data = (v) => (v ? deISO(v) : null);
const simNao = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '');

const COLS_EMPRESAS = [
  { header: 'Empresa', key: 'empresa', width: 32, v: (l) => l.empresa },
  { header: 'Cidade', key: 'cidade', width: 16, v: (l) => l.cidade },
  { header: 'Ação de vendas', key: 'acao', width: 28, v: (l, porId, acoes) => { const a = acoes.get(l.acao_id); return a ? `${new Date(a.criado_em).toLocaleDateString('pt-BR')} · ${[a.endereco, a.cidade].filter(Boolean).join(' · ')}` : null; } },
  { header: 'Origem', key: 'origem', width: 12, v: (l) => rotulo('origem', l.origem) },
  { header: 'Indicado por', key: 'indicado_por', width: 16, v: (l) => l.indicado_por },
  { header: 'Etapa', key: 'etapa', width: 11, v: (l) => rotuloEtapa(l.etapa) },
  { header: 'Fora do perfil', key: 'bandeira', width: 22, v: (l) => (l.bandeira ? l.motivo_bandeira || 'Sim' : '') },
  { header: 'Falou c/ decisor', key: 'falou_decisor', width: 12, v: (l) => simNao(l.falou_decisor) },
  { header: 'Decisor', key: 'decisor_nome', width: 20, v: (l) => l.decisor_nome },
  { header: 'WhatsApp', key: 'decisor_whatsapp', width: 16, v: (l) => l.decisor_whatsapp },
  { header: 'Nº veículos', key: 'n_veiculos', width: 10, v: (l) => (l.n_veiculos == null ? null : l.veiculos_mais ? `${l.n_veiculos}+` : l.n_veiculos) },
  { header: 'Nº segurados', key: 'n_segurados', width: 10, v: (l) => l.n_segurados },
  { header: 'Sem seguro', key: 'sem_seguro', width: 10, v: (l) => (l.n_veiculos != null && l.n_segurados != null ? Math.max(0, l.n_veiculos - l.n_segurados) : null) },
  { header: 'Por que não protegeu', key: 'motivo_sem_seguro', width: 22, v: (l) => l.motivo_sem_seguro },
  { header: 'Seguradora', key: 'seguradora', width: 18, v: (l) => l.seguradora },
  { header: 'Vencimento do seguro', key: 'vencimento_seguro', width: 12, v: (l) => data(l.vencimento_seguro), fmt: 'mm/yyyy' },
  { header: 'Nota do seguro (0-5)', key: 'nota_seguro', width: 10, v: (l) => l.nota_seguro },
  { header: 'Próximo passo', key: 'proximo_tipo', width: 14, v: (l) => TIPOS_PROXIMO[l.proximo_tipo] || l.proximo_passo },
  { header: 'Data do próximo passo', key: 'data_proximo_passo', width: 13, v: (l) => data(l.data_proximo_passo), fmt: 'dd/mm/yyyy' },
  { header: 'Hora', key: 'hora_proximo_passo', width: 7, v: (l) => (l.hora_proximo_passo ? l.hora_proximo_passo.slice(0, 5) : null) },
  { header: 'Motivo da perda', key: 'motivo_nao', width: 20, v: (l) => (l.etapa === 'perdido' ? l.motivo_nao : null) },
  { header: 'Observação', key: 'observacao', width: 46, v: (l) => l.observacao },
  { header: 'Lead dos segurados de', key: 'lead_pai_id', width: 26, v: (l, porId) => (l.lead_pai_id ? porId.get(l.lead_pai_id)?.empresa || l.lead_pai_id : null) },
  { header: 'Arquivada', key: 'arquivado', width: 9, v: (l) => simNao(l.arquivado) },
  { header: 'Criada em', key: 'criado_em', width: 16, v: (l) => dataHora(l.criado_em), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'Atualizada em', key: 'atualizado_em', width: 16, v: (l) => dataHora(l.atualizado_em), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'id', key: 'id', width: 38, v: (l) => l.id },
];

const COLS_HISTORICO = [
  { header: 'Data', key: 'data', width: 17, v: (c) => dataHora(c.data), fmt: 'dd/mm/yyyy hh:mm' },
  { header: 'Empresa', key: 'empresa', width: 32, v: (c, porId) => porId.get(c.lead_id)?.empresa },
  { header: 'Evento', key: 'evento', width: 24, v: (c) => EVENTOS[c.evento] || rotulo('resultado', c.resultado) },
  { header: 'Etapa na hora', key: 'etapa', width: 11, v: (c) => rotuloEtapa(c.etapa) },
  { header: 'Veículos', key: 'veiculos', width: 9, v: (c) => c.veiculos },
  { header: 'Falou c/ decisor', key: 'decisor', width: 12, v: (c) => simNao(c.decisor) },
  { header: 'Motivo', key: 'motivo', width: 22, v: (c) => c.motivo },
  { header: 'Observação', key: 'observacao', width: 56, v: (c) => c.observacao },
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

export async function gerarXLSX(leads, contatos, acoes = []) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Micro CRM';
  const porId = new Map(leads.map((l) => [l.id, l]));
  const ids = new Set(leads.map((l) => l.id));
  contatos = contatos.filter((c) => ids.has(c.lead_id)); // só o histórico das empresas exportadas
  aba(wb, 'Empresas', COLS_EMPRESAS, leads, porId, new Map(acoes.map((a) => [a.id, a])));
  aba(wb, 'Histórico', COLS_HISTORICO, [...contatos].sort((a, b) => String(a.data).localeCompare(String(b.data))), porId);
  return wb.xlsx.writeBuffer();
}
