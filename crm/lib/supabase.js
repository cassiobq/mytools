import { createClient } from '@supabase/supabase-js';

let cliente;
export function supabase() {
  if (!cliente) {
    cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cliente;
}
