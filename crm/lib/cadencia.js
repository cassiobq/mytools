// Próximo passo sugerido a partir da situação (faixa de cadência). O usuário pode editar tudo.
import { hojeISO, somarDias } from './datas.js';

export const FAIXAS = [
  { valor: '1_dono_ausente', rotulo: 'Dono ausente' },
  { valor: '2_ja_tem_seguro', rotulo: 'Já tem seguro' },
  { valor: '3_recusou', rotulo: 'Recusou' },
  { valor: '4_interessado', rotulo: 'Interessado' },
  { valor: 'indicacao', rotulo: 'Indicação' },
];

// primeiroRetorno: true no registro da visita (interessado volta em 1 dia); false nos retornos seguintes (3 dias).
export function sugerirProximo({ faixa, resultado, vencimento, primeiroRetorno = true, hoje = hojeISO() }) {
  if (resultado === 'venda') return null;
  switch (faixa) {
    case '1_dono_ausente':
      return { passo: 'Voltar para falar com o dono', data: somarDias(hoje, 3) };
    case '2_ja_tem_seguro': {
      if (!vencimento) return { passo: 'Retornar antes do vencimento do seguro', data: somarDias(hoje, 30) };
      const alvo = somarDias(vencimento, -45);
      // Vencimento perto demais: retorna logo (amanhã) em vez de sugerir data no passado.
      return { passo: 'Retornar antes do vencimento do seguro', data: alvo > hoje ? alvo : somarDias(hoje, 1) };
    }
    case '3_recusou':
      return { passo: 'Nova abordagem', data: somarDias(hoje, 60) };
    case '4_interessado':
      return { passo: 'Retornar: cliente interessado', data: somarDias(hoje, primeiroRetorno ? 1 : 3) };
    case 'indicacao':
      return { passo: 'Contatar a indicação', data: somarDias(hoje, 1) };
    default:
      return null;
  }
}
