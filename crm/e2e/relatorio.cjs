// Teste de ponta a ponta do "Gerar relatório": período De/Até, chamada à Edge Function e download do .docx.
// Mesmas variáveis de e2e/persistencia.cjs. Com COM_IA=1 espera o texto da IA (precisa da ANTHROPIC_API_KEY
// no Supabase); sem ela, espera o aviso de chave faltando e gera a versão "sem IA".
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const { CRM_URL, SUPABASE_URL, SUPABASE_KEY, TESTE_EMAIL, TESTE_SENHA, COM_IA, FOTOS } = process.env;
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const ok = (m) => console.log(`✓ ${m}`);
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const s = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: TESTE_EMAIL, password: TESTE_SENHA }),
  })).json();
  const leads = await (await fetch(`${SUPABASE_URL}/rest/v1/leads?select=empresa`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${s.access_token}` } })).json();
  assert.ok(leads.length > 0, 'o usuário de teste precisa ter ao menos uma empresa');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [`sb-${REF}-auth-token`, JSON.stringify(s)]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));

  await page.goto(`${CRM_URL}/lista/`);
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  const dlg = page.getByRole('dialog', { name: 'Gerar relatório' });
  await dlg.getByLabel('Data início').fill('2020-01-01');
  await dlg.getByLabel('Data fim').fill(hoje());
  await dlg.locator('#participantes').fill('Equipe de Teste');
  await page.screenshot({ path: FOTOS ? `${FOTOS}/6-relatorio.png` : '/dev/null' });
  ok('diálogo com período De → Até e participantes');

  // Período sem nada: mensagem clara.
  await dlg.getByLabel('Data início').fill('2020-01-01');
  await dlg.getByLabel('Data fim').fill('2020-01-02');
  await dlg.getByRole('button', { name: /^Gerar relatório/ }).click();
  await dlg.getByText('Nenhum contato registrado nesse período.').waitFor({ timeout: 30000 });
  ok('período sem registros: avisa "Nenhum contato registrado nesse período."');
  await dlg.getByLabel('Data fim').fill(hoje());

  const baixar = async (botao) => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 150000 }), botao.click()]);
    assert.match(d.suggestedFilename(), /^relatorio-prospeccao-2020-01-01-a-\d{4}-\d{2}-\d{2}\.docx$/);
    return execFileSync('unzip', ['-p', await d.path(), 'word/document.xml']).toString().replace(/<[^>]+>/g, ' ');
  };
  let texto;
  if (COM_IA) {
    texto = await baixar(dlg.getByRole('button', { name: /^Gerar relatório/ }));
    assert.match(texto, /Resumo Executivo/);
    assert.match(texto, /Conclusão/);
    ok('com IA: .docx com resumo executivo e conclusão');
  } else {
    await dlg.getByRole('button', { name: /^Gerar relatório/ }).click();
    await dlg.getByText(/Falta configurar a chave da IA/).waitFor({ timeout: 30000 });
    ok('sem chave da IA: avisa e oferece "Gerar sem IA"');
    texto = await baixar(dlg.getByRole('button', { name: 'Gerar sem IA' }));
  }
  assert.match(texto, /RELATÓRIO DE PROSPECÇÃO/);
  assert.match(texto, /Equipe de Teste/);
  assert.match(texto, /Quadro-Resumo das Visitas/);
  assert.match(texto, /Resultados Consolidados/);
  for (const l of leads) assert.ok(texto.includes(l.empresa.replace(/&/g, '&amp;')), `faltou ${l.empresa} no relatório`);
  ok(`.docx baixado, no layout do modelo, com as ${leads.length} empresas do período`);

  // Participantes lembrados.
  await page.reload();
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  assert.equal(await page.locator('#participantes').inputValue(), 'Equipe de Teste');
  ok('participantes lembrados para a próxima vez');

  assert.deepEqual(erros, []);
  ok('nenhum erro de JavaScript');
  await browser.close();
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
