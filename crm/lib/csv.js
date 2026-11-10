// CSV que o Google Sheets abre direto: UTF-8 com BOM, vírgula, aspas quando precisa, datas ISO.
export const COLUNAS_LEADS = [
  'id', 'criado_em', 'atualizado_em', 'origem', 'indicado_por', 'empresa', 'cidade', 'n_veiculos', 'tipo', 'estrategia',
  'falou_decisor', 'resultado', 'faixa_cadencia', 'vencimento_seguro', 'proximo_passo', 'data_proximo_passo',
  'motivo_nao', 'observacao', 'arquivado',
];
export const COLUNAS_CONTATOS = ['id', 'lead_id', 'data', 'resultado', 'observacao'];

function celula(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paraCSV(linhas, colunas) {
  const corpo = [colunas.join(','), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(','))];
  return '﻿' + corpo.join('\r\n') + '\r\n';
}
