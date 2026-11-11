// Teste de ponta a ponta das telas (Registrar, Hoje, Empresas, Configurações, Painel), contra o Supabase real.
// Mesmas variáveis de e2e/persistencia.cjs; FOTOS=<pasta> salva capturas de tela.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

const { CRM_URL, SUPABASE_URL, SUPABASE_KEY, TESTE_EMAIL, TESTE2_EMAIL, TESTE_SENHA, FOTOS } = process.env;
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const ok = (m) => console.log(`✓ ${m}`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(new Date());
const somar = (s, n) => { const [a, m, d] = s.split('-').map(Number); return iso(new Date(a, m - 1, d + n)); };

async function login(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TESTE_SENHA }),
  });
  return r.json();
}
async function rest(s, caminho, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opts, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', prefer: 'return=representation', ...(opts.headers || {}) },
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}
async function escolher(raiz, grupo, nome) {
  const b = raiz.getByRole('group', { name: grupo }).getByRole('button', { name: nome, exact: true });
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
}
const foto = async (page, nome) => { if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nome}.png`, fullPage: true }); };
// Salva e espera o aviso DESTE salvamento (o aviso anterior some antes).
async function salvarVisita(page) {
  await page.getByText('Visita salva no banco').waitFor({ state: 'detached', timeout: 10000 });
  await page.getByRole('button', { name: 'Salvar visita' }).click();
  await page.getByText('Visita salva no banco').waitFor({ timeout: 15000 });
}
const lead = async (s, empresa) => (await rest(s, `leads?empresa=eq.${encodeURIComponent(empresa)}&select=*`)).corpo;

(async () => {
  const s = await login(TESTE_EMAIL);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [`sb-${REF}-auth-token`, JSON.stringify(s)]);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (d) => d.accept());
  const t = Date.now();
  const A = `Ausente ${t}`; const B = `SemSeguro ${t}`; const C = `Satisfeito ${t}`; const D = `Parcial ${t}`;

  // Ação de vendas: cidade obrigatória, rua opcional; vira a ativa e a anterior é finalizada.
  const antes = (await rest(s, 'acoes?select=id,finalizada_em&order=criado_em.desc&limit=1')).corpo[0];
  await page.goto(`${CRM_URL}/acoes/`);
  await page.getByRole('group', { name: 'Cidade da ação' }).getByRole('button', { name: '+ Outra' }).click();
  await page.getByLabel('Cidade da ação').fill('Caçu');
  await page.locator('#endereco-acao').fill(`Rua ${t}`);
  await page.getByRole('button', { name: 'Criar ação' }).click();
  await page.getByTestId('acao-ativa').getByText(`Rua ${t} · Caçu`).waitFor({ timeout: 15000 });
  const acao = (await rest(s, `acoes?endereco=eq.${encodeURIComponent(`Rua ${t}`)}&select=*`)).corpo[0];
  assert.equal(acao.cidade, 'Caçu');
  if (antes) assert.ok((await rest(s, `acoes?id=eq.${antes.id}&select=finalizada_em`)).corpo[0].finalizada_em);
  ok('Ação: criada (Caçu, rua opcional), virou a ativa no topo e finalizou a anterior');

  // A: decisor ausente -> retorno com data e hora; o botão só liga com a data e a hora.
  await page.fill('#empresa', A);
  await escolher(page, 'Falou com o decisor', 'Não');
  assert.equal(await page.getByRole('button', { name: 'Salvar visita' }).isDisabled(), true);
  await page.getByRole('group', { name: 'Atalhos: Retorno com o decisor' }).getByRole('button', { name: '+1 dia' }).click();
  await page.getByLabel('Hora: Retorno com o decisor').fill('09:00');
  await salvarVisita(page);
  let l = (await lead(s, A))[0];
  assert.equal(l.proximo_tipo, 'retorno'); assert.equal(l.data_proximo_passo, somar(hoje(), 1)); assert.equal(l.hora_proximo_passo, '09:00:00');
  assert.equal(l.cidade, 'Caçu'); assert.equal(l.acao_id, acao.id);
  await page.getByTestId('aviso-agenda').getByText(`Retorno – ${A}`).waitFor();
  assert.match(await page.getByRole('link', { name: 'Adicionar à agenda' }).getAttribute('href'), /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await page.getByRole('button', { name: 'Agora não' }).click();
  ok('Registrar: decisor ausente exige data e hora; registro na cidade da ação; oferece "Adicionar à agenda"');

  // B: sem seguro -> reunião -> MQL. Aviso de empresa repetida ao digitar de novo.
  await page.fill('#empresa', B);
  await escolher(page, 'Falou com o decisor', 'Sim');
  await page.fill('#decisor_nome', 'Marcos'); await page.fill('#decisor_whatsapp', '64999990001');
  await escolher(page, 'Veículos', '2'); await escolher(page, 'Segurados', '0');
  await escolher(page, 'Motivo sem seguro', 'Condição financeira'); await escolher(page, 'Agendou reunião', 'Sim');
  let util = somar(hoje(), 1);
  while ([0, 6].includes(new Date(`${util}T12:00:00`).getDay())) util = somar(util, 1);
  await page.locator('#data-reuniao').fill(util);
  const livres = page.getByRole('group', { name: 'Horários livres: Data e hora da reunião' });
  await livres.waitFor({ timeout: 15000 });
  const slots = await livres.getByRole('button').allTextContents();
  assert.ok(slots.length > 0 && slots.every((x) => /^(09|10|11|14|15|16)h00$/.test(x)), slots.join(','));
  await livres.getByRole('button').first().click();
  const horaB = `${slots[0].slice(0, 2)}:00`;
  await foto(page, '1-registrar');
  await salvarVisita(page);
  assert.equal((await lead(s, B))[0].etapa, 'mql');
  assert.equal((await lead(s, B))[0].hora_proximo_passo, `${horaB}:00`);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await page.fill('#empresa', B.toUpperCase());
  await page.getByText(/Já registrada: SemSeguro/).waitFor();
  await page.fill('#empresa', '');
  // O horário marcado some dos livres daquele dia.
  await page.fill('#empresa', `Conflito ${t}`);
  await escolher(page, 'Falou com o decisor', 'Não');
  await page.locator('#data-retorno').fill(util);
  const livres2 = await page.getByRole('group', { name: 'Horários livres: Retorno com o decisor' }).getByRole('button').allTextContents();
  assert.ok(!livres2.includes(slots[0]), `${slots[0]} ainda aparece livre`);
  await page.fill('#empresa', '');
  ok(`Registrar: sem seguro + reunião = MQL no horário livre ${slots[0]} (seg–sex, 9–12/14–17); o horário sai dos livres; avisa empresa repetida`);

  // C: todos segurados, nota 5 -> bandeira, retorno no dia 1 do vencimento, fora da agenda.
  const venc = somar(hoje(), 60).slice(0, 7);
  await page.fill('#empresa', C);
  await escolher(page, 'Falou com o decisor', 'Sim');
  await page.fill('#decisor_nome', 'Cida'); await page.fill('#decisor_whatsapp', '64999990002');
  await escolher(page, 'Veículos', '1'); await escolher(page, 'Segurados', '1');
  await page.fill('#seguradora', 'Porto Seguro'); await page.fill('#vencimento', venc);
  await escolher(page, 'Nota do seguro', '5');
  await page.getByText('Satisfeito com o seguro').waitFor();
  await salvarVisita(page);
  l = (await lead(s, C))[0];
  assert.equal(l.bandeira, true); assert.equal(l.data_proximo_passo, `${venc}-01`); assert.equal(l.proximo_tipo, 'vencimento');
  ok('Registrar: segurado e satisfeito = 🚩 + retorno no dia 1 do mês do vencimento');

  // D: parte segurada -> lead MQL + lead "segurados" (retorno no vencimento).
  await page.fill('#empresa', D);
  await escolher(page, 'Falou com o decisor', 'Sim');
  await page.fill('#decisor_nome', 'Paulo'); await page.fill('#decisor_whatsapp', '64999990003');
  await escolher(page, 'Veículos', '4+'); await page.fill('#veiculos_qtd', '10');
  await escolher(page, 'Segurados', '3');
  await escolher(page, 'Motivo sem seguro', 'Outro'); await page.getByLabel('Qual o motivo?').fill('Acha caro');
  await escolher(page, 'Agendou reunião', 'Não');
  await page.fill('#seguradora', 'Allianz'); await page.fill('#vencimento', venc); await escolher(page, 'Nota do seguro', '2');
  await salvarVisita(page);
  const ds = await lead(s, D);
  assert.equal(ds.length, 2);
  const pai = ds.find((x) => !x.lead_pai_id); const filho = ds.find((x) => x.lead_pai_id);
  assert.equal(pai.etapa, 'perdido'); assert.equal(pai.n_veiculos, 10); assert.equal(pai.motivo_sem_seguro, 'Acha caro');
  assert.equal(filho.lead_pai_id, pai.id); assert.equal(filho.n_veiculos, 3); assert.equal(filho.data_proximo_passo, `${venc}-01`);
  ok('Registrar: parte segurada cria o lead dos 3 segurados; sem reunião, o principal fica perdido');

  // Hoje: B atrasado -> follow-up "Reunião feita -> em cotação" com veículos.
  await rest(s, `leads?empresa=eq.${encodeURIComponent(B)}`, { method: 'PATCH', body: JSON.stringify({ data_proximo_passo: somar(hoje(), -1) }) });
  await page.goto(`${CRM_URL}/hoje/`);
  const cardB = page.locator('article', { hasText: B });
  await cardB.getByText('Atrasado 1 dia').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('article', { hasText: C }).count(), 0);
  await foto(page, '2-hoje');
  await cardB.getByRole('button', { name: 'Registrar contato' }).click();
  const dlg = page.getByRole('dialog');
  await escolher(dlg, 'O que aconteceu', 'Reunião feita → em cotação');
  await dlg.locator('#veiculos-acao').fill('2');
  await dlg.getByRole('group', { name: 'Atalhos: Próximo retorno' }).getByRole('button', { name: '+2 dias' }).click();
  await foto(page, '3-followup');
  await dlg.getByRole('button', { name: 'Salvar contato' }).click();
  await page.getByText('Contato salvo no banco').waitFor({ timeout: 15000 });
  l = (await lead(s, B))[0];
  assert.equal(l.etapa, 'sql'); assert.equal(l.data_proximo_passo, somar(hoje(), 2));
  const ev = (await rest(s, `contatos?lead_id=eq.${l.id}&select=evento,veiculos&order=data`)).corpo;
  assert.deepEqual(ev.map((c) => c.evento), ['abordagem', 'mql', 'sql']); assert.equal(ev[2].veiculos, 2);
  ok('Hoje: atrasado em destaque; bandeira fora da agenda; MQL → SQL com 2 veículos cotados');

  // Empresas: filtro 🚩 e reativar.
  await page.goto(`${CRM_URL}/lista/`);
  await escolher(page, 'Filtro', '🚩 Fora do perfil');
  await page.getByLabel('Buscar').fill(C);
  const cardC = page.locator('article', { hasText: C });
  await cardC.waitFor({ timeout: 15000 });
  await foto(page, '4-empresas');
  await cardC.getByRole('button', { name: 'Reativar abordagem' }).click();
  await page.getByText('Reativação salva no banco').waitFor({ timeout: 15000 });
  l = (await lead(s, C))[0];
  assert.equal(l.bandeira, false); assert.equal(l.etapa, 'lead'); assert.equal(l.data_proximo_passo, hoje());
  ok('Empresas: filtro “Fora do perfil” e reativar (volta para Lead, retorno hoje)');

  // Configurações: metas gravadas na tabela config (e protegidas por RLS).
  await page.goto(`${CRM_URL}/config/`);
  await page.locator('#meta-leads').fill('40');
  await page.locator('#meta-mql').fill('16');
  await page.locator('#meta-associados').fill('8');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await page.getByText('Configuração salva no banco').waitFor({ timeout: 15000 });
  const cfg = (await rest(s, 'config?select=*')).corpo;
  assert.equal(cfg.length, 1); assert.equal(cfg[0].metas.leads, 40); assert.equal(cfg[0].metas.associados, 8);
  const s2 = await login(TESTE2_EMAIL);
  assert.equal((await rest(s2, 'config?select=*')).corpo.length, 0);
  ok('Configurações: metas gravadas; outro usuário não vê (RLS)');
  await page.locator('#ical').fill('https://calendar.google.com/calendar/ical/pt.brazilian%23holiday%40group.v.calendar.google.com/public/basic.ics');
  await page.getByRole('button', { name: 'Testar' }).click();
  await page.getByText(/Agenda lida: \d+ compromisso/).waitFor({ timeout: 30000 });
  ok('Configurações: testar link iCal (agenda pública de feriados) lê a agenda pelo servidor');

  // Painel: velocímetros e funil batem com o banco.
  await page.goto(`${CRM_URL}/painel/`);
  const seg = (() => { const d = new Date(); const w = (d.getDay() + 6) % 7; return somar(hoje(), -w); })();
  const abordagens = (await rest(s, `contatos?evento=eq.abordagem&data=gte.${seg}T03:00:00Z&select=lead_id`)).corpo;
  const nLeads = new Set(abordagens.map((c) => c.lead_id)).size;
  await page.getByTestId('velo-Leads').getByText(`${nLeads}`, { exact: true }).waitFor({ timeout: 15000 });
  await page.getByTestId('velo-Leads').getByText('/ 10').waitFor();
  await page.getByTestId('simulador').waitFor();
  await page.getByTestId('mercado').waitFor();
  await page.getByLabel('Ação de vendas').selectOption(acao.id);
  await page.getByTestId('funil').locator('tbody tr').first().locator('td').nth(1).filter({ hasText: /^4$/ }).waitFor({ timeout: 10000 });
  await foto(page, '5-painel');
  ok(`Painel: velocímetro de Leads ${nLeads} / 10 na semana (meta 40 ÷ 4), simulador, mercado e filtro por ação (4 leads nesta ação)`);

  // Exportar XLSX (filtro Todas): linhas = empresas.
  await page.goto(`${CRM_URL}/lista/`);
  await escolher(page, 'Filtro', 'Todas');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar XLSX' }).click()]);
  const ExcelJS = require(require.resolve('exceljs', { paths: [`${__dirname}/..`] }));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const total = (await rest(s, 'leads?select=id')).corpo.length;
  assert.equal(wb.getWorksheet('Empresas').rowCount - 1, total);
  const cab = wb.getWorksheet('Empresas').getRow(1).values;
  for (const col of ['Etapa', 'Decisor', 'WhatsApp', 'Seguradora', 'Nota do seguro (0-5)', 'Fora do perfil']) assert.ok(cab.includes(col), col);
  ok(`Exportar XLSX: ${total} empresas, com etapa, decisor, seguradora, nota e bandeira`);

  assert.deepEqual(erros, []);
  ok('nenhum erro de JavaScript');
  await browser.close();
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
