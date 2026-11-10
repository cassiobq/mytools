// Monta as linhas a gravar a partir dos formulários. O id é gerado aqui, no aparelho.
import { sugerirProximo } from './cadencia.js';

const novoId = () => crypto.randomUUID();
const texto = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null);

// Campos do lead que vêm do formulário de registro/edição.
export function linhaDoFormulario(f) {
  const venda = f.resultado === 'venda';
  return {
    origem: f.origem,
    indicado_por: f.origem === 'indicacao' ? texto(f.indicado_por) : null,
    empresa: texto(f.empresa),
    cidade: texto(f.cidade),
    n_veiculos: f.n_veiculos === '' || f.n_veiculos == null ? null : Number(f.n_veiculos),
    tipo: f.tipo || null,
    estrategia: f.estrategia || null,
    falou_decisor: f.falou_decisor ?? null,
    resultado: f.resultado || null,
    faixa_cadencia: f.faixa_cadencia || null,
    vencimento_seguro: f.vencimento_seguro || null,
    proximo_passo: venda ? null : texto(f.proximo_passo),
    data_proximo_passo: venda ? null : f.data_proximo_passo || null,
    motivo_nao: f.resultado === 'sem_interesse' ? texto(f.motivo_nao) : null,
    observacao: texto(f.observacao),
  };
}

// Visita nova: o lead e a primeira linha do histórico.
export function opsRegistrarVisita(f, agora = new Date()) {
  const id = novoId();
  const lead = { id, criado_em: agora.toISOString(), arquivado: false, ...linhaDoFormulario(f) };
  const contato = { id: novoId(), lead_id: id, data: agora.toISOString(), resultado: lead.resultado, observacao: lead.observacao };
  return [{ tabela: 'leads', linha: lead }, { tabela: 'contatos', linha: contato }];
}

// Retorno de um lead: nova linha no histórico e o estado atual do lead atualizado.
export function opsRegistrarContato(lead, c, agora = new Date()) {
  const venda = c.resultado === 'venda';
  const atualizado = {
    ...lead,
    resultado: c.resultado || lead.resultado,
    faixa_cadencia: c.faixa_cadencia || lead.faixa_cadencia,
    vencimento_seguro: c.vencimento_seguro || lead.vencimento_seguro,
    motivo_nao: c.resultado === 'sem_interesse' ? texto(c.motivo_nao) : null,
    proximo_passo: venda ? null : texto(c.proximo_passo),
    data_proximo_passo: venda ? null : c.data_proximo_passo || null,
    observacao: texto(c.observacao) ?? lead.observacao,
  };
  const contato = { id: novoId(), lead_id: lead.id, data: agora.toISOString(), resultado: c.resultado || null, observacao: texto(c.observacao) };
  return [{ tabela: 'contatos', linha: contato }, { tabela: 'leads', linha: limparLead(atualizado) }];
}

export const opsArquivar = (lead, arquivado = true) => [{ tabela: 'leads', linha: limparLead({ ...lead, arquivado }) }];

export const opsEditar = (lead, f) => [{ tabela: 'leads', linha: limparLead({ ...lead, ...linhaDoFormulario(f) }) }];

// Só as colunas da tabela (sem campos de tela).
const COLUNAS = ['id', 'criado_em', 'origem', 'indicado_por', 'empresa', 'cidade', 'n_veiculos', 'tipo', 'estrategia',
  'falou_decisor', 'resultado', 'faixa_cadencia', 'vencimento_seguro', 'proximo_passo', 'data_proximo_passo',
  'motivo_nao', 'observacao', 'arquivado'];
function limparLead(l) {
  return Object.fromEntries(COLUNAS.filter((c) => c in l).map((c) => [c, l[c]]));
}

export { sugerirProximo };
