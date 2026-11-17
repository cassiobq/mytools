// O servidor do Supabase roda em UTC: os mesmos testes do conector precisam passar lá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// O Node marca processos de teste filhos (NODE_TEST_CONTEXT); sem tirar a marca, a falha do filho não aparece.
const semContexto = ({ NODE_TEST_CONTEXT, ...resto }) => resto;

test('conector: os mesmos testes passam com o relógio em UTC', () => {
  const arquivo = fileURLToPath(new URL('./mcp.test.mjs', import.meta.url));
  const r = spawnSync(process.execPath, ['--test', arquivo], { env: { ...semContexto(process.env), TZ: 'UTC' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.split('\n').filter((l) => /not ok|Error|expected|actual|^\s+[+-] /.test(l)).slice(0, 30).join('\n'));
});
