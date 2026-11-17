// Protocolo MCP (JSON-RPC 2.0) sem estado: cada POST traz uma mensagem e recebe a resposta em JSON.
import { FERRAMENTAS, chamar } from './ferramentas.js';

export const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26'];
const INSTRUCOES = 'Micro CRM de prospecção PAP de empresas (seguros de frota). Você é a secretária: registra o que o vendedor dita, '
  + 'confirma antes de gravar, diz quem procurar e quando, e a situação de cada lead. Nunca invente dados e nunca sugira o que ele deve fazer. '
  + 'Só diga "salvo" quando a ação responder salvo: true.';

const erro = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });

// Devolve a resposta, ou null para notificações (sem id).
export async function tratar(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return erro(msg?.id, -32600, 'Requisição inválida.');
  const notificacao = msg.id === undefined;
  const { id, method, params = {} } = msg;
  if (notificacao) return null;
  switch (method) {
    case 'initialize': {
      const versao = VERSOES.includes(params.protocolVersion) ? params.protocolVersion : VERSOES[0];
      return ok(id, {
        protocolVersion: versao,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'micro-crm', title: 'Micro CRM', version: '1.0.0' },
        instructions: INSTRUCOES,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: FERRAMENTAS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
    case 'tools/call': {
      if (typeof params.name !== 'string') return erro(id, -32602, 'Informe o nome da ação.');
      if (!FERRAMENTAS.some((t) => t.name === params.name)) return erro(id, -32602, `Ação desconhecida: ${params.name}`);
      const r = await chamar(params.name, params.arguments || {}, ctx);
      if (r.erro) return ok(id, { content: [{ type: 'text', text: r.erro }], isError: true });
      return ok(id, { content: [{ type: 'text', text: JSON.stringify(r.resultado) }], structuredContent: r.resultado, isError: false });
    }
    default:
      return erro(id, -32601, `Método não suportado: ${method}`);
  }
}

// Corpo do POST: uma mensagem ou um lote. Devolve o que responder (ou null = só notificações).
export async function tratarCorpo(corpo, ctx) {
  if (Array.isArray(corpo)) {
    if (!corpo.length) return erro(null, -32600, 'Lote vazio.');
    const rs = (await Promise.all(corpo.map((m) => tratar(m, ctx)))).filter(Boolean);
    return rs.length ? rs : null;
  }
  return tratar(corpo, ctx);
}
