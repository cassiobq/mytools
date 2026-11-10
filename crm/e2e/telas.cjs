// Teste de ponta a ponta das telas Hoje, Funil e Lista (com exportação CSV), contra o Supabase real.
// Mesmas variáveis de e2e/persistencia.cjs; FOTOS=<pasta> salva capturas de tela.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { CRM_URL, SUPABASE_URL, SUPABASE_KEY, TESTE_EMAIL, TESTE_SENHA, FOTOS } = process.env;
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const ok = (m) => console.log(`✓ ${m}`);
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const somar = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

async function login() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: TESTE_EMAIL, password: TESTE_SENHA }),
  });
  return r.json();
}
async function rest(s, caminho, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opts, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', prefer: 'return=representation', ...(opts.headers || {}) },
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}
async function escolher(page, grupo, nome, raiz = page) {
  const b = raiz.getByRole('group', { name: grupo }).getByRole('button', { name: nome, exact: true });
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
}
async function registrar(page, empresa, faixa) {
  await page.goto(CRM_URL);
  await page.fill('#empresa', empresa);
  await escolher(page, 'Tipo', 'Frota');
  await escolher(page, 'Estratégia', 'Ligação');
  await escolher(page, 'Falou com o decisor', 'Não');
  await escolher(page, 'Resultado', 'Agendou');
  await escolher(page, 'Situação', faixa);
  await page.getByRole('button', { name: 'Salvar visita' }).click();
  await page.getByText('Visita salva no banco').waitFor({ timeout: 15000 });
}
const foto = async (page, nome) => { if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nome}.png`, fullPage: true }); };

(async () => {
  const s = await login();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [`sb-${REF}-auth-token`, JSON.stringify(s)]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (d) => d.accept()); // confirma o "Arquivar?"

  // Duas empresas com retorno; depois movemos as datas para o passado (atrasadas).
  const t = Date.now();
  const nomeA = `Hoje A ${t}`;
  const nomeB = `Hoje B ${t}`;
  await registrar(page, nomeA, 'Dono ausente');
  await foto(page, '1-registrar');
  // Sugestão "Dono ausente" = +3 dias.
  let r = await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeA)}&select=*`);
  assert.equal(r.corpo[0].data_proximo_passo, somar(hoje(), 3));
  ok('Registrar: "Dono ausente" sugeriu e gravou +3 dias');
  await registrar(page, nomeB, 'Recusou');
  await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeA)}`, { method: 'PATCH', body: JSON.stringify({ data_proximo_passo: somar(hoje(), -2) }) });
  await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeB)}`, { method: 'PATCH', body: JSON.stringify({ data_proximo_passo: hoje() }) });

  // Hoje: atrasado em destaque, antes dos de hoje.
  await page.goto(`${CRM_URL}/hoje/`);
  const cardA = page.locator('article', { hasText: nomeA });
  await cardA.getByText('Atrasado 2 dias').waitFor({ timeout: 20000 });
  await page.locator('article', { hasText: nomeB }).waitFor();
  const ordem = await page.locator('article .titulo').allTextContents();
  assert.ok(ordem.indexOf(nomeA) < ordem.indexOf(nomeB));
  ok('Hoje: atrasado aparece em destaque e antes do de hoje');
  await foto(page, '2-hoje');

  // Registrar contato no atrasado: Cotação + Interessado -> sugestão +3 (retorno seguinte).
  await cardA.getByRole('button', { name: 'Registrar contato' }).click();
  const dlg = page.getByRole('dialog');
  await escolher(page, 'Resultado do contato', 'Cotação', dlg);
  await escolher(page, 'Situação do contato', 'Interessado', dlg);
  assert.equal(await dlg.getByLabel('Nova data').inputValue(), somar(hoje(), 3));
  await dlg.locator('#obs-contato').fill('Pediu cotação de 10 veículos');
  await foto(page, '3-registrar-contato');
  await dlg.getByRole('button', { name: 'Salvar contato' }).click();
  await page.getByText('Contato salvo no banco').waitFor({ timeout: 15000 });
  r = await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeA)}&select=*`);
  assert.equal(r.corpo[0].resultado, 'cotacao');
  assert.equal(r.corpo[0].data_proximo_passo, somar(hoje(), 3));
  const hist = await rest(s, `contatos?lead_id=eq.${r.corpo[0].id}&select=*&order=data`);
  assert.equal(hist.corpo.length, 2);
  assert.equal(hist.corpo[1].observacao, 'Pediu cotação de 10 veículos');
  await cardA.waitFor({ state: 'detached', timeout: 10000 });
  ok('Hoje: contato gravado (2 linhas no histórico, lead atualizado, +3 dias) e saiu da lista');

  // Arquivar.
  const antes = Number((await page.getByTestId('contador').textContent()).match(/\d+/)[0]);
  await page.locator('article', { hasText: nomeB }).getByRole('button', { name: 'Arquivar' }).click();
  await page.getByText('Arquivamento salvo no banco').waitFor({ timeout: 15000 });
  r = await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeB)}&select=arquivado`);
  assert.equal(r.corpo[0].arquivado, true);
  await page.getByTestId('contador').filter({ hasText: new RegExp(`^${antes - 1} empresa`) }).waitFor();
  ok('Hoje: arquivar grava arquivado=true no banco (não apaga) e o contador diminui');

  // Funil: linha de base confere com o banco.
  await page.goto(`${CRM_URL}/funil/`);
  const todos = (await rest(s, 'leads?select=origem,tipo')).corpo;
  const frota = todos.filter((l) => l.origem === 'abordagem' && l.tipo === 'frota').length;
  await page.getByTestId('base-frota').filter({ hasText: `${frota}/50` }).waitFor({ timeout: 10000 });
  ok(`Funil: linha de base ${frota}/50 abordagens de frota confere com o banco`);
  await foto(page, '4-funil');
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  assert.equal(await page.getByRole('button', { name: 'Próxima semana' }).isEnabled(), true);
  ok('Funil: seletor de semana funciona');

  // Lista: busca, edição, CSV.
  await page.goto(`${CRM_URL}/lista/`);
  await page.getByLabel('Buscar').fill(`hoje a ${t}`);
  await page.locator('article', { hasText: nomeA }).waitFor();
  assert.equal(await page.locator('article').count(), 1);
  ok('Lista: busca sem acento/maiúscula encontra a empresa');
  await foto(page, '5-lista');
  await page.locator('article', { hasText: nomeA }).getByRole('button', { name: 'Editar' }).click();
  const nomeEditado = `${nomeA} Editada`;
  await page.getByRole('dialog').locator('#empresa').fill(nomeEditado);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByText('Alteração salva no banco').waitFor({ timeout: 15000 });
  r = await rest(s, `leads?empresa=eq.${encodeURIComponent(nomeEditado)}&select=id,resultado`);
  assert.equal(r.corpo.length, 1);
  assert.equal(r.corpo[0].resultado, 'cotacao');
  ok('Lista: edição gravada no banco, sem perder os outros campos');

  await page.getByLabel('Buscar').fill('');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar XLSX' }).click()]);
  assert.match(download.suggestedFilename(), /^crm-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const ExcelJS = require(require.resolve('exceljs', { paths: [__dirname + '/..'] }));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const emp = wb.getWorksheet('Empresas');
  const total = (await rest(s, 'leads?select=id')).corpo.length;
  assert.equal(emp.rowCount - 1, total);
  const linhaEditada = emp.getRows(2, emp.rowCount - 1).find((r) => r.getCell(1).value === nomeEditado);
  assert.equal(linhaEditada.getCell(9).value, 'Cotação'); // valores em português
  assert.ok(linhaEditada.getCell(17).value instanceof Date); // datas como datas
  const abaHist = wb.getWorksheet('Histórico');
  assert.equal(abaHist.rowCount - 1, (await rest(s, 'contatos?select=id')).corpo.length);
  ok(`Exportar XLSX: aba Empresas com ${total} linhas e aba Histórico batem com o banco; valores em português e datas como data`);

  assert.deepEqual(erros, []);
  ok('nenhum erro de JavaScript');
  await browser.close();
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
