// Leitura e gravação no banco com o login de quem chamou (RLS: só os dados do próprio usuário).
import { linhaEntrando, opsSaindo } from './fuso.js';

const ORDEM = { leads: 'criado_em', contatos: 'data', acoes: 'criado_em', config: 'id' };

async function buscarTudo(sb, tabela) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('*').order(ORDEM[tabela]).range(de, de + 999);
    if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

// Tudo do usuário, já no relógio deslocado (ver fuso.js). O volume de um vendedor cabe com folga.
export async function carregar(sb) {
  const [leads, contatos, acoes, config] = await Promise.all(['leads', 'contatos', 'acoes', 'config'].map((t) => buscarTudo(sb, t)));
  const porLead = new Map();
  const cts = contatos.map((c) => linhaEntrando('contatos', c));
  for (const c of cts) { if (!porLead.has(c.lead_id)) porLead.set(c.lead_id, []); porLead.get(c.lead_id).push(c); }
  return {
    leads: leads.map((l) => linhaEntrando('leads', l)),
    contatos: cts,
    acoes: acoes.map((a) => linhaEntrando('acoes', a)),
    config: config[0] ? linhaEntrando('config', config[0]) : null,
    contatosDe: (id) => porLead.get(id) || [],
  };
}

const SEM_USER = ({ user_id, ...resto }) => resto;

// Grava em ordem (o contato depende do lead). Upsert pelo id: repetir a mesma gravação não duplica.
// Regra nº 1: devolve salvo só se TODAS as operações foram confirmadas pelo banco.
export async function gravar(sb, ops) {
  const reais = opsSaindo(ops);
  let feitas = 0;
  for (const op of reais) {
    const { data, error } = await sb.from(op.tabela).upsert(SEM_USER(op.linha), { onConflict: 'id' }).select('id');
    if (error || !data?.length) {
      return { salvo: false, gravadas: feitas, de: reais.length, erro: error?.message || 'O banco não confirmou a gravação.' };
    }
    feitas++;
  }
  return { salvo: true, gravadas: feitas, de: reais.length };
}

// Ids estáveis por operação: as linhas novas recebem ids derivados de id_operacao (+ posição).
// Se a gravação falhar no meio e o Claude repetir com o mesmo id_operacao, regrava as mesmas linhas: não duplica.
async function uuidDe(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; // formato UUID (versão 5, variante RFC 4122)
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
const REFS = ['id', 'lead_id', 'lead_pai_id', 'acao_id'];
export async function idsEstaveis(ops, idOperacao, existentes) {
  const troca = new Map();
  let n = 0;
  for (const op of ops) {
    const id = op.linha.id;
    if (id && !existentes.has(id) && !troca.has(id)) troca.set(id, await uuidDe(`${idOperacao}:${n++}`));
  }
  return ops.map((op) => {
    const linha = { ...op.linha };
    for (const c of REFS) if (linha[c] && troca.has(linha[c])) linha[c] = troca.get(linha[c]);
    return { tabela: op.tabela, linha };
  });
}
