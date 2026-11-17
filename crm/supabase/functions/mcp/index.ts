// Edge Function "mcp": o conector "Micro CRM" para o app do Claude (MCP, transporte Streamable HTTP, sem estado).
// Login: OAuth 2.1 do próprio Supabase Auth. O Claude manda o token do usuário; tudo é lido e gravado com ele (RLS).
// Sem token (ou token inválido): 401 com o endereço dos metadados, para o Claude iniciar o login.
// Deploy com verify_jwt = false: quem confere o token é esta função (para poder responder o 401 do jeito do MCP).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { tratarCorpo } from './protocolo.js';

const BASE = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const RECURSO = `${BASE}/functions/v1/mcp`;
const METADADOS = `${RECURSO}/.well-known/oauth-protected-resource`;
const ESCOPOS = ['email', 'profile']; // sem openid: ele exige chaves assimétricas no projeto

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id',
};
const json = (corpo: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extra } });

function semLogin(motivo: string, erro?: string) {
  const partes = [`resource_metadata="${METADADOS}"`, `scope="${ESCOPOS.join(' ')}"`];
  // Cabeçalho HTTP só aceita ASCII: texto com acento derruba o cabeçalho inteiro (testado em produção).
  if (erro) partes.push(`error="${erro}"`, 'error_description="token invalido ou expirado"');
  return json({ erro: motivo }, 401, { 'WWW-Authenticate': `Bearer ${partes.join(', ')}` });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // Metadados do recurso protegido (RFC 9728): quem emite o login é o Supabase Auth deste projeto.
  if (url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json({
      resource: RECURSO,
      authorization_servers: [`${BASE}/auth/v1`],
      scopes_supported: ESCOPOS,
      bearer_methods_supported: ['header'],
      resource_name: 'Micro CRM',
    });
  }

  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405, { Allow: 'POST, OPTIONS' });

  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return semLogin('Faça login para usar o Micro CRM.');
  const sb = createClient(BASE, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: eu } = await sb.auth.getUser();
  if (eu || !u?.user) return semLogin('Login expirado ou inválido.', 'invalid_token');

  let corpo: unknown;
  try { corpo = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, 400); }

  const resposta = await tratarCorpo(corpo, { sb, agora: new Date() });
  if (resposta === null) return new Response(null, { status: 202, headers: CORS });
  return json(resposta);
});
