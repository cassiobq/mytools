// Edge Function "agenda": lê o endereço secreto iCal salvo nas configurações de quem chamou (sob RLS)
// e devolve os horários ocupados do intervalo pedido. O link iCal nunca sai do servidor de volta.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { ocupados } from './ical.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  let corpo: { inicio?: string; fim?: string; url?: string };
  try { corpo = await req.json(); } catch { return json({ erro: 'Corpo inválido.' }, 400); }
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (!corpo.inicio || !corpo.fim || !data.test(corpo.inicio) || !data.test(corpo.fim) || corpo.inicio > corpo.fim) {
    return json({ erro: 'Informe início e fim (AAAA-MM-DD).' }, 400);
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: u, error: eu } = await sb.auth.getUser();
  if (eu || !u?.user) return json({ erro: 'Faça login de novo.' }, 401);

  // "url" só para testar um link antes de salvar (Configurações); senão, o salvo.
  let url = corpo.url;
  if (!url) {
    const { data: cfg, error } = await sb.from('config').select('ical_url').maybeSingle();
    if (error) return json({ erro: `Falha ao ler as configurações: ${error.message}` }, 500);
    url = cfg?.ical_url ?? undefined;
  }
  if (!url) return json({ erro: 'Agenda não conectada.', semAgenda: true }, 404);
  if (!/^https:\/\//.test(url)) return json({ erro: 'O link iCal precisa começar com https://' }, 400);

  let texto: string;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'text/calendar' } });
    if (!r.ok) return json({ erro: `A agenda respondeu ${r.status}. Confira o link iCal.` }, 502);
    texto = await r.text();
  } catch (e) {
    return json({ erro: `Não foi possível ler a agenda: ${(e as Error).message}` }, 502);
  }
  if (!texto.includes('BEGIN:VCALENDAR')) return json({ erro: 'O link não é de uma agenda iCal (.ics).' }, 400);

  // Intervalo em horário de Brasília (-03:00), com folga de 1 dia para eventos longos.
  const de = Date.parse(`${corpo.inicio}T00:00:00-03:00`);
  const ate = Date.parse(`${corpo.fim}T23:59:59-03:00`);
  try {
    return json({ ocupados: ocupados(texto, de, ate), lidoEm: new Date().toISOString() });
  } catch (e) {
    return json({ erro: `Não foi possível interpretar a agenda: ${(e as Error).message}` }, 500);
  }
});
