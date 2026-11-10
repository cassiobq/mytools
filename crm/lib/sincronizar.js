// Envio da fila ao Supabase, em ordem. Cada operação é um upsert pelo id gerado no app:
// reenviar a mesma operação (sinal caiu depois de gravar, app fechado no meio) nunca duplica.
import * as local from './local.js';

let rodando = null;

export function sincronizar(supabase) {
  // Uma sincronização por vez; quem chamar durante uma, espera a mesma.
  if (!rodando) rodando = executar(supabase).finally(() => { rodando = null; });
  return rodando;
}

async function executar(supabase) {
  const fila = (await local.todos('fila')).sort((a, b) => a.seq - b.seq);
  let enviados = 0;
  for (const op of fila) {
    let erro;
    try {
      ({ error: erro } = await supabase.from(op.tabela).upsert(op.linha, { onConflict: 'id' }));
    } catch (e) {
      erro = e;
    }
    if (erro) {
      // Para na primeira falha para manter a ordem (o contato depende do lead já estar no banco).
      await local.gravar('fila', { ...op, erro: String(erro.message || erro), tentativas: (op.tentativas || 0) + 1 });
      return { enviados, restantes: fila.length - enviados, erro: String(erro.message || erro) };
    }
    await local.apagar('fila', op.seq);
    enviados++;
  }
  return { enviados, restantes: 0, erro: null };
}
