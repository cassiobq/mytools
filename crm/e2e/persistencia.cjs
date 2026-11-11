// Teste de ponta a ponta da Regra nº 1 (persistência), no navegador, contra o Supabase real.
// Uso: CRM_URL=http://localhost:4400 SUPABASE_URL=... SUPABASE_KEY=... TESTE_EMAIL=... TESTE_SENHA=...
//      TESTE2_EMAIL=... node e2e/persistencia.cjs
// Precisa de um usuário de teste com senha (o app em si usa só link/código por e-mail).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

const { CRM_URL, SUPABASE_URL, SUPABASE_KEY, TESTE_EMAIL, TESTE_SENHA, TESTE2_EMAIL } = process.env;
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];

async function login(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TESTE_SENHA }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login falhou: ${JSON.stringify(s)}`);
  return s;
}

async function rest(sessao, caminho, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opts, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${sessao.access_token}`, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

const passos = [];
const ok = (msg) => { passos.push(`✓ ${msg}`); console.log(`✓ ${msg}`); };

async function escolher(page, grupo, nome) {
  const b = page.getByRole('group', { name: grupo }).getByRole('button', { name: nome, exact: true });
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
}

// Visita com o decisor: 3 veículos, nenhum segurado, reunião agendada (vira MQL).
async function preencher(page, empresa) {
  await page.fill('#empresa', empresa);
  await escolher(page, 'Falou com o decisor', 'Sim');
  await page.fill('#decisor_nome', 'Rafael, dono');
  await page.fill('#decisor_whatsapp', '(64) 99999-0000');
  await escolher(page, 'Veículos', '3');
  await escolher(page, 'Segurados', '0');
  await escolher(page, 'Motivo sem seguro', 'Não é prioridade');
  await escolher(page, 'Agendou reunião', 'Sim');
  await page.getByRole('group', { name: 'Atalhos: Data e hora da reunião' }).getByRole('button', { name: '+2 dias' }).click();
  await page.getByLabel('Hora: Data e hora da reunião').fill('14:30');
  await page.fill('#observacao', 'Teste automático');
}

(async () => {
  const s1 = await login(TESTE_EMAIL);
  // Ação de vendas ativa (a cidade dos registros vem dela).
  const acao = { id: crypto.randomUUID(), cidade: 'Rio Verde', endereco: 'Teste automático', criado_em: new Date().toISOString() };
  assert.equal((await rest(s1, 'acoes', { method: 'POST', body: JSON.stringify(acao) })).status, 201);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  // Entra como o usuário de teste: a sessão vai para o localStorage, como o supabase-js guarda.
  await ctx.addInitScript(([chave, valor]) => {
    if (!localStorage.getItem(chave)) localStorage.setItem(chave, valor);
    if (!localStorage.getItem('crm:prefs')) localStorage.setItem('crm:prefs', JSON.stringify({ cidade: 'Rio Verde', cidades: ['Rio Verde'] }));
  }, [`sb-${REF}-auth-token`, JSON.stringify(s1)]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));

  const inicial = (await rest(s1, 'leads?arquivado=eq.false&lead_pai_id=is.null&select=id')).corpo.length;
  const contadorDeve = (n) => page.getByTestId('contador').filter({ hasText: new RegExp(`^${n} empresa`) }).waitFor({ timeout: 20000 });
  await page.goto(CRM_URL);
  await contadorDeve(inicial);

  // 1) Online: registrar, só aparece "salvo" depois do banco.
  const nome1 = `Teste Online ${Date.now()}`;
  await preencher(page, nome1);
  await page.getByRole('button', { name: 'Salvar visita' }).click();
  await page.getByText('Visita salva no banco').waitFor({ timeout: 15000 });
  ok('online: aviso "salvo no banco" apareceu');
  let r = await rest(s1, `leads?empresa=eq.${encodeURIComponent(nome1)}&select=*`);
  assert.equal(r.corpo.length, 1);
  assert.equal(r.corpo[0].etapa, 'mql');
  assert.equal(r.corpo[0].n_veiculos, 3);
  assert.equal(r.corpo[0].n_segurados, 0);
  assert.equal(r.corpo[0].hora_proximo_passo, '14:30:00');
  assert.equal(r.corpo[0].cidade, 'Rio Verde');
  assert.equal(r.corpo[0].acao_id, acao.id);
  const c1 = await rest(s1, `contatos?lead_id=eq.${r.corpo[0].id}&select=evento&order=data`);
  assert.deepEqual(c1.corpo.map((c) => c.evento), ['abordagem', 'mql']);
  ok('online: lead (MQL, 3 veículos, reunião 14h30) e eventos abordagem + MQL no banco');
  await page.reload();
  await contadorDeve(inicial + 1);
  ok('online: depois de recarregar, contador = inicial + 1');
  await page.getByTestId('acao-ativa').getByText('Teste automático · Rio Verde').waitFor();
  ok('ação ativa no topo; o registro herdou a cidade e a ação');

  // 2) Sem sinal: fica pendente, não vai ao banco, sobrevive a recarregar.
  await ctx.setOffline(true);
  const nome2 = `Teste Offline ${Date.now()}`;
  await preencher(page, nome2);
  await page.getByRole('button', { name: 'Salvar visita' }).click();
  await page.getByText('Visita pendente').waitFor({ timeout: 15000 });
  ok('offline: aviso "pendente" (não "salvo")');
  r = await rest(s1, `leads?empresa=eq.${encodeURIComponent(nome2)}&select=id`);
  assert.equal(r.corpo.length, 0);
  ok('offline: ainda não está no banco');
  await page.reload(); // sem sinal: o service worker serve o app
  await contadorDeve(inicial + 2);
  await page.getByText(/1 pendente/).waitFor();
  ok('offline: recarregou sem sinal, registro continua na tela como pendente');

  // 3) Volta o sinal: sincroniza sozinho, uma vez só.
  await ctx.setOffline(false);
  await page.getByText('Sincronizado').waitFor({ timeout: 45000 });
  r = await rest(s1, `leads?empresa=eq.${encodeURIComponent(nome2)}&select=*`);
  assert.equal(r.corpo.length, 1);
  const c2 = await rest(s1, `contatos?lead_id=eq.${r.corpo[0].id}&select=id`);
  assert.equal(c2.corpo.length, 2);
  ok('sinal voltou: sincronizou sozinho, 1 lead e 2 eventos no banco');

  // 4) Reenvio da mesma operação (ex.: caiu o sinal depois de gravar): não duplica.
  const lead2 = r.corpo[0];
  await page.evaluate(async (linha) => {
    const req = indexedDB.open('micro-crm');
    await new Promise((res) => { req.onsuccess = res; });
    const tx = req.result.transaction('fila', 'readwrite');
    const { user_id, atualizado_em, ...semUser } = linha;
    tx.objectStore('fila').add({ tabela: 'leads', linha: semUser, criado: Date.now() });
    await new Promise((res) => { tx.oncomplete = res; });
  }, lead2);
  await page.getByRole('button', { name: /pendente|Sincronizado/ }).click();
  await page.getByText('Sincronizado').waitFor({ timeout: 20000 });
  r = await rest(s1, `leads?empresa=eq.${encodeURIComponent(nome2)}&select=id`);
  assert.equal(r.corpo.length, 1);
  ok('reenvio da mesma operação: continua 1 registro (upsert pelo id)');

  // 5) RLS: outro usuário não vê nem altera.
  const s2 = await login(TESTE2_EMAIL);
  r = await rest(s2, 'leads?select=id');
  assert.equal(r.corpo.length, 0);
  const invasao = await rest(s2, 'leads?on_conflict=id', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: lead2.id, origem: 'abordagem', empresa: 'invadido' }),
  });
  assert.notEqual(invasao.status, 201);
  const conferir = await rest(s1, `leads?id=eq.${lead2.id}&select=empresa`);
  assert.equal(conferir.corpo[0].empresa, nome2);
  ok(`RLS: outro usuário vê 0 leads e não consegue sobrescrever (HTTP ${invasao.status})`);
  // Sem DELETE pela API.
  const apagar = await rest(s1, `leads?id=eq.${lead2.id}`, { method: 'DELETE' });
  const aindaExiste = await rest(s1, `leads?id=eq.${lead2.id}&select=id`);
  assert.equal(aindaExiste.corpo.length, 1);
  ok(`sem apagar de verdade: DELETE recusado (HTTP ${apagar.status}), registro continua`);

  assert.deepEqual(erros, []);
  ok('nenhum erro de JavaScript na página');
  await browser.close();
  console.log(`\n${passos.length} verificações passaram.`);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
