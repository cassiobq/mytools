// Números do funil de uma semana (segunda a domingo), no total e por estratégia.
import { inicioDaSemana, somarDias, paraISO } from './datas.js';

export const ESTRATEGIAS = [
  { valor: 'visita_agenda', rotulo: 'Visita p/ agendar' },
  { valor: 'visita_fecha', rotulo: 'Visita p/ fechar' },
  { valor: 'ligacao', rotulo: 'Ligação' },
];

const diaLocal = (ts) => paraISO(new Date(ts));
const taxa = (a, b) => (b ? a / b : null);

function contar(leadsDaSemana, leadsComCotacao, leadsComVenda) {
  const abordagens = leadsDaSemana.filter((l) => l.origem === 'abordagem');
  const decisor = leadsDaSemana.filter((l) => l.falou_decisor === true);
  const indicacoes = leadsDaSemana.filter((l) => l.origem === 'indicacao');
  const n = {
    abordagens: abordagens.length,
    decisor: decisor.length,
    indicacoes: indicacoes.length,
    cotacoes: leadsComCotacao.length,
    vendas: leadsComVenda.length,
  };
  return {
    ...n,
    taxa_decisor: taxa(n.decisor, leadsDaSemana.length),
    taxa_cotacao: taxa(n.cotacoes, leadsDaSemana.length),
    taxa_venda: taxa(n.vendas, n.cotacoes),
  };
}

// semana: qualquer data "AAAA-MM-DD" dentro da semana desejada.
// Cotações e vendas contam a empresa uma vez, pela data do contato (visita ou retorno) que as registrou.
export function calcularFunil(leads, contatos, semana) {
  const ini = inicioDaSemana(semana);
  const fim = somarDias(ini, 7);
  const naSemana = (ts) => { const d = diaLocal(ts); return d >= ini && d < fim; };
  const porId = new Map(leads.map((l) => [l.id, l]));
  const leadsCom = (resultado) => {
    const ids = new Set(contatos.filter((c) => c.resultado === resultado && naSemana(c.data)).map((c) => c.lead_id));
    return [...ids].map((id) => porId.get(id)).filter(Boolean);
  };
  const daSemana = leads.filter((l) => naSemana(l.criado_em));
  const cot = leadsCom('cotacao');
  const ven = leadsCom('venda');
  const porEstrategia = Object.fromEntries(ESTRATEGIAS.map(({ valor }) => [valor, contar(
    daSemana.filter((l) => l.estrategia === valor), cot.filter((l) => l.estrategia === valor), ven.filter((l) => l.estrategia === valor),
  )]));
  return { inicio: ini, fim: somarDias(ini, 6), total: contar(daSemana, cot, ven), porEstrategia };
}

// Linha de base: abordagens de frota de todos os tempos (arquivadas incluídas).
export function abordagensDeFrota(leads) {
  return leads.filter((l) => l.origem === 'abordagem' && l.tipo === 'frota').length;
}
