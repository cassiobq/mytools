// Copia a lógica pura do app (lib/) para dentro da Edge Function "mcp", que precisa dos arquivos no próprio pacote.
// Rode depois de mudar qualquer um destes arquivos: node scripts/copiar-lib-mcp.mjs (o teste mcp.test.mjs acusa cópia velha).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARQUIVOS_LIB_MCP = ['acoes.js', 'agenda.js', 'datas.js', 'etapas.js', 'painel.js', 'pesquisa.js', 'relacionamento.js', 'situacao.js'];
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'supabase/functions/mcp/lib');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(destino, { recursive: true });
  for (const a of ARQUIVOS_LIB_MCP) copyFileSync(join(raiz, 'lib', a), join(destino, a));
  console.log(`Copiados ${ARQUIVOS_LIB_MCP.length} arquivos para supabase/functions/mcp/lib/`);
}
