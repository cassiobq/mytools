// Rótulos em português dos valores gravados no banco (para telas, planilha e relatório).
export const ROTULOS = {
  origem: { abordagem: 'Abordagem', indicacao: 'Indicação' },
  tipo: { PF: 'PF', frota: 'Frota' },
  estrategia: { visita_agenda: 'Visita p/ agendar', visita_fecha: 'Visita p/ fechar', ligacao: 'Ligação' },
  resultado: { sem_interesse: 'Sem interesse', agendou: 'Agendou', cotacao: 'Cotação', venda: 'Venda' },
  faixa_cadencia: { '1_dono_ausente': 'Dono ausente', '2_ja_tem_seguro': 'Já tem seguro', '3_recusou': 'Recusou', '4_interessado': 'Interessado', indicacao: 'Indicação' },
};
export const rotulo = (campo, valor) => (valor == null ? '' : ROTULOS[campo]?.[valor] ?? valor);
