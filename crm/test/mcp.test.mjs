// Conector MCP (Edge Function "mcp") contra um banco falso em memória.
// Roda no fuso de Brasília (npm test) e também em UTC (mcp-utc.test.mjs), como no servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tratar, tratarCorpo } from '../supabase/functions/mcp/protocolo.js';
import { parecido } from '../supabase/functions/mcp/nomes.js';
import { ARQUIVOS_LIB_MCP } from '../scripts/copiar-lib-mcp.mjs';

const USER = 'u1';
function bancoFalso({ falharNa = null } = {}) {
  const t = { leads: new Map(), contatos: new Map(), acoes: new Map(), config: new Map() };
  let upserts = 0;
  const sb = {
    t,
    from(tabela) {
      return {
        select() {
          return { order(col) { return { range(a, b) {
            const linhas = [...t[tabela].values()].sort((x, y) => String(x[col]).localeCompare(String(y[col])));
            return Promise.resolve({ data: linhas.slice(a, b + 1).map((x) => structuredClone(x)), error: null });
          } }; } };
        },
        upsert(linha) {
          return { select() {
            upserts++;
            if (falharNa && upserts === falharNa) return Promise.resolve({ data: null, error: { message: 'sem sinal (simulado)' } });
            if ('user_id' in linha) throw new Error('não mande user_id');
            const atual = t[tabela].get(linha.id) || { user_id: USER };
            t[tabela].set(linha.id, { ...atual, ...structuredClone(linha) });
            return Promise.resolve({ data: [{ id: linha.id }], error: null });
          } };
        },
      };
    },
  };
  return sb;
}
const AGORA = new Date('2026-11-11T13:00:00Z'); // quarta, 10h em Brasília
let n = 0;
async function chamar(sb, name, args, agora = AGORA) {
  const r = await tratar({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, { sb, agora });
  assert.ok(r.result, JSON.stringify(r));
  return r.result.isError ? { erro: r.result.content[0].text } : r.result.structuredContent;
}
const comAcao = (sb, cidade = 'Rio Verde') => {
  sb.t.acoes.set('a1', { id: 'a1', user_id: USER, criado_em: '2026-11-11T11:00:00Z', cidade, endereco: 'Av. Presidente Vargas', finalizada_em: null });
  return sb;
};
const visitaMQL = { empresa: 'Transportes Boa Viagem', falou_decisor: true, decisor_nome: 'Rafael', decisor_whatsapp: '64999990000',
  veiculos: 3, segurados: 0, motivo_sem_seguro: 'condição financeira', agendou_reuniao: true, data: '2026-11-12', hora: '14:00', observacao: 'Quer ver preço.' };

test('protocolo: initialize, lista de ações, notificação e erros', async () => {
  const ini = await tratar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } } }, {});
  assert.equal(ini.result.protocolVersion, '2025-06-18');
  assert.deepEqual(ini.result.capabilities, { tools: { listChanged: false } });
  const velha = await tratar({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2024-01-01' } }, {});
  assert.equal(velha.result.protocolVersion, '2025-11-25');
  assert.equal(await tratar({ jsonrpc: '2.0', method: 'notifications/initialized' }, {}), null);
  assert.equal(await tratarCorpo([{ jsonrpc: '2.0', method: 'notifications/initialized' }], {}), null);
  const lista = await tratar({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, {});
  const nomes = lista.result.tools.map((x) => x.name);
  assert.deepEqual(nomes, ['registrar_visita', 'registrar_contato', 'agenda', 'ficha_lead', 'buscar_leads', 'acao_de_vendas', 'corrigir_lead', 'numeros', 'dados_para_arquivo', 'vincular_evento']);
  for (const f of lista.result.tools) {
    assert.equal(f.inputSchema.type, 'object');
    assert.ok(f.description.length > 40, f.name);
    assert.equal(typeof f.annotations.readOnlyHint, 'boolean');
  }
  assert.equal((await tratar({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, {})).error.code, -32601);
  assert.equal((await tratar({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'apagar_tudo' } }, {})).error.code, -32602);
  assert.equal((await tratar({ foo: 1 }, {})).error.code, -32600);
});

test('registrar_visita: sem ação ativa, faltando dados, e completa (com o que fazer no Google)', async () => {
  const sb = bancoFalso();
  assert.match((await chamar(sb, 'registrar_visita', visitaMQL)).erro, /ação de vendas ativa/);
  comAcao(sb);
  const falta = await chamar(sb, 'registrar_visita', { empresa: 'X Ltda', falou_decisor: true });
  assert.equal(falta.salvo, false);
  assert.deepEqual(falta.falta, ['Nome do decisor', 'WhatsApp do decisor', 'Quantos veículos?']);
  assert.equal(sb.t.leads.size, 0);
  assert.match((await chamar(sb, 'registrar_visita', { ...visitaMQL, hora: '25:00' })).erro, /HH:MM/);

  const r = await chamar(sb, 'registrar_visita', visitaMQL);
  assert.equal(r.salvo, true);
  assert.equal(sb.t.leads.size, 1);
  const lead = [...sb.t.leads.values()][0];
  assert.equal(lead.cidade, 'Rio Verde'); // da ação
  assert.equal(lead.acao_id, 'a1');
  assert.equal(lead.etapa, 'mql');
  assert.equal(lead.motivo_sem_seguro, 'Condição financeira');
  assert.deepEqual([...sb.t.contatos.values()].map((c) => c.evento).sort(), ['abordagem', 'mql']);
  // horário gravado é o real (UTC), qualquer que seja o fuso do servidor
  assert.equal([...sb.t.contatos.values()].find((c) => c.evento === 'abordagem').data, '2026-11-11T13:00:00.000Z');
  assert.match(r.leads[0].situacao, /^Transportes Boa Viagem · Rio Verde · MQL · decisor Rafael \(64999990000\) · 3 veículos, 0 segurados/);
  assert.equal(r.google_agenda.length, 1);
  const g = r.google_agenda[0];
  assert.equal(g.acao, 'criar');
  assert.equal(g.evento.titulo, 'Reunião – Transportes Boa Viagem');
  assert.equal(g.evento.inicio, '2026-11-12T14:00:00-03:00');
  assert.equal(g.evento.fim, '2026-11-12T14:30:00-03:00');
  assert.match(g.evento.descricao, /WhatsApp: 64999990000[\s\S]*micro-crm-virid\.vercel\.app/);
});

test('registrar_visita: avisa nome parecido e só cria com confirmação', async () => {
  const sb = comAcao(bancoFalso());
  await chamar(sb, 'registrar_visita', visitaMQL);
  const r = await chamar(sb, 'registrar_visita', { ...visitaMQL, empresa: 'TRANSPORTES BOA VIAGEM LTDA' });
  assert.equal(r.salvo, false);
  assert.equal(r.parecidos.length, 1);
  assert.equal(sb.t.leads.size, 1);
  const ok = await chamar(sb, 'registrar_visita', { ...visitaMQL, empresa: 'Transportes Boa Viagem LTDA', mesmo_assim_nova: true });
  assert.equal(ok.salvo, true);
  assert.equal(sb.t.leads.size, 2);
  assert.ok(parecido('Auto Peças Silva', 'autopecas silva'.replace('autopecas', 'auto pecas')));
  assert.ok(!parecido('Silva Transportes', 'Souza Materiais'));
});

test('regra nº 1: falha no meio não diz salvo; repetir com o mesmo id_operacao completa sem duplicar', async () => {
  const sb = comAcao(bancoFalso({ falharNa: 2 }));
  const r = await chamar(sb, 'registrar_visita', visitaMQL);
  assert.match(r.erro, /^NÃO SALVO: sem sinal \(simulado\) \(1 de 3 partes gravadas\)/);
  const id = r.erro.match(/id_operacao="([^"]+)"/)[1];
  const ok = await chamar(sb, 'registrar_visita', { ...visitaMQL, id_operacao: id, mesmo_assim_nova: true });
  assert.equal(ok.salvo, true);
  assert.equal(sb.t.leads.size, 1);
  assert.equal(sb.t.contatos.size, 2);
  // repetir de novo (por engano) também não duplica
  await chamar(sb, 'registrar_visita', { ...visitaMQL, id_operacao: id, mesmo_assim_nova: true });
  assert.equal(sb.t.leads.size, 1);
  assert.equal(sb.t.contatos.size, 2);
});

test('registrar_contato: remarcar move o evento, perda cancela, nada é apagado', async () => {
  const sb = comAcao(bancoFalso());
  const v = await chamar(sb, 'registrar_visita', visitaMQL);
  const id = v.leads[0].lead_id;
  assert.equal((await chamar(sb, 'vincular_evento', { lead_id: id, google_event_id: 'g-1' })).salvo, true);

  const naoPode = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'venda' });
  assert.match(naoPode.erro, /Em MQL os tipos possíveis são: relacionamento, sql, no_show, retorno, perda/);
  const falta = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'retorno' });
  assert.deepEqual(falta.falta, ['Data do próximo passo', 'Hora da reunião']);

  const rem = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'retorno', data: '2026-11-13', hora: '09:30' });
  assert.deepEqual([rem.google_agenda[0].acao, rem.google_agenda[0].google_event_id, rem.google_agenda[0].evento.inicio], ['mover', 'g-1', '2026-11-13T09:30:00-03:00']);

  const perda = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'perda', motivo: 'sem interesse' });
  assert.equal(perda.salvo, true);
  assert.deepEqual(perda.google_agenda, [{ lead_id: id, empresa: 'Transportes Boa Viagem', acao: 'cancelar', google_event_id: 'g-1' }]);
  const l = sb.t.leads.get(id);
  assert.equal(l.etapa, 'perdido');
  assert.equal(l.motivo_nao, 'Sem interesse');
  assert.equal(sb.t.leads.size, 1);
  assert.deepEqual([...sb.t.contatos.values()].map((c) => c.evento).sort(), ['abordagem', 'mql', 'perda', 'retorno']);

  const rel = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'relacionamento', observacao: 'Passei para dar um oi.' });
  assert.equal(rel.salvo, true);
  assert.equal(sb.t.leads.get(id).etapa, 'perdido');
  assert.match(rel.leads[0].situacao, /último contato hoje: "Passei para dar um oi\."/);
  assert.deepEqual((await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'relacionamento' })).falta, ['Anotação']);
});

test('registrar_contato: retorno da pesquisa em Lead (decisor encontrado, todos segurados -> vencimento de dia inteiro)', async () => {
  const sb = comAcao(bancoFalso());
  const v = await chamar(sb, 'registrar_visita', { empresa: 'Padaria Pão Quente', falou_decisor: false, data: '2026-11-12', hora: '08:30' });
  const id = v.leads[0].lead_id;
  assert.equal(v.google_agenda[0].evento.titulo, 'Retorno – Padaria Pão Quente');
  const r = await chamar(sb, 'registrar_contato', { lead_id: id, tipo: 'retorno_pesquisa', falou_decisor: true, decisor_nome: 'Joana',
    decisor_whatsapp: '64988887777', veiculos: 2, segurados: 2, seguradora: 'Porto', vencimento: '2027-03', nota: 2 });
  assert.equal(r.salvo, true);
  const ag = r.google_agenda[0];
  assert.equal(ag.acao, 'criar');
  assert.deepEqual([ag.evento.dia_inteiro, ag.evento.data, ag.evento.titulo], [true, '2027-03-01', 'Vencimento do seguro – Padaria Pão Quente']);
  assert.deepEqual([...sb.t.contatos.values()].map((c) => c.evento).sort(), ['abordagem', 'retorno']);
});

test('agenda: atrasados, compromissos, retornos por intervalo, esfriando e horários livres', async () => {
  const sb = comAcao(bancoFalso());
  const L = (id, extra) => sb.t.leads.set(id, { id, user_id: USER, empresa: id, cidade: 'Rio Verde', etapa: 'lead', arquivado: false, bandeira: false, criado_em: '2026-09-01T13:00:00Z', ...extra });
  const C = (id, lead_id, data, extra) => sb.t.contatos.set(id, { id, user_id: USER, lead_id, data, evento: 'retorno', decisor: null, observacao: null, ...extra });
  L('_Atrasada', { proximo_tipo: 'retorno', data_proximo_passo: '2026-11-09', hora_proximo_passo: '09:00:00' });
  L('_Hoje', { proximo_tipo: 'reuniao', etapa: 'mql', data_proximo_passo: '2026-11-11', hora_proximo_passo: '14:00:00' });
  L('_Perdida', { etapa: 'perdido' }); C('c1', '_Perdida', '2026-08-01T13:00:00Z');
  L('_Fria', { etapa: 'sql', proximo_tipo: 'negociacao', data_proximo_passo: '2026-12-20' }); C('c2', '_Fria', '2026-10-20T13:00:00Z');
  L('_Arquivada', { arquivado: true, proximo_tipo: 'retorno', data_proximo_passo: '2026-11-10' });

  const r = await chamar(sb, 'agenda', {});
  assert.equal(r.periodo.hoje, '2026-11-11');
  assert.deepEqual(r.atrasados.map((x) => [x.empresa, x.era_para]), [['_Atrasada', '2026-11-09']]);
  assert.deepEqual(r.compromissos.map((x) => [x.empresa, x.hora]), [['_Hoje', '14:00']]);
  assert.deepEqual(r.retornos_por_intervalo.map((x) => [x.empresa, x.perfil, x.volta_em]), [['_Perdida', 'Perdido', '2026-10-30']]);
  assert.deepEqual(r.esfriando.map((x) => [x.empresa, x.dias_sem_contato]), [['_Fria', 22]]);
  assert.deepEqual(r.ocupados_pelo_crm, [{ inicio: '2026-11-11T14:00:00-03:00', fim: '2026-11-11T14:30:00-03:00' }]);
  assert.match(r.horarios_livres, /ocupados_google/);

  const livres = await chamar(sb, 'agenda', { ocupados_google: [{ inicio: '2026-11-11T11:00:00-03:00', fim: '2026-11-11T12:00:00-03:00' }] });
  // agora 10h: livres a partir de 10h30; 11h-12h ocupado pelo Google; 14h pelo CRM
  assert.deepEqual(livres.horarios_livres['2026-11-11'], ['10:30', '14:30', '15:00', '15:30', '16:00', '16:30']);
  assert.equal(livres.duracao_min, 30);
  assert.match((await chamar(sb, 'agenda', { inicio: '2026-11-01', fim: '2026-12-15' })).erro, /31 dias/);
});

test('buscar_leads, ficha_lead, corrigir_lead e acao_de_vendas', async () => {
  const sb = comAcao(bancoFalso());
  const v = await chamar(sb, 'registrar_visita', visitaMQL);
  const id = v.leads[0].lead_id;
  const b = await chamar(sb, 'buscar_leads', { texto: 'boa viagem' });
  assert.equal(b.total, 1);
  assert.equal((await chamar(sb, 'buscar_leads', { texto: 'rafael' })).total, 1);
  assert.equal((await chamar(sb, 'buscar_leads', { etapa: 'sql' })).total, 0);

  const f = await chamar(sb, 'ficha_lead', { nome: 'transportes boa viagem' });
  assert.equal(f.lead_id, id);
  assert.equal(f.etapa, 'MQL');
  assert.deepEqual(f.historico.map((h) => [h.quando, h.evento]), [['2026-11-11T10:00:00-03:00', 'Abordagem'], ['2026-11-11T10:00:00-03:00', 'Reunião agendada (MQL)']]);
  assert.equal(f.dados_publicos, null);
  assert.equal(f.abordado_em, '2026-11-11T10:00:00-03:00');
  assert.equal((await chamar(sb, 'ficha_lead', { nome: 'Inexistente Comércio' })).encontrado, false);

  await chamar(sb, 'vincular_evento', { lead_id: id, google_event_id: 'g-9' });
  const c = await chamar(sb, 'corrigir_lead', { lead_id: id, decisor_whatsapp: '64911112222' });
  assert.equal(sb.t.leads.get(id).decisor_whatsapp, '64911112222');
  assert.equal(sb.t.leads.get(id).etapa, 'mql');
  assert.deepEqual(c.google_agenda, []); // dados mudaram, horário não
  const h = await chamar(sb, 'corrigir_lead', { lead_id: id, hora: '16:00' });
  assert.deepEqual([h.google_agenda[0].acao, h.google_agenda[0].evento.inicio], ['mover', '2026-11-12T16:00:00-03:00']);
  assert.equal(sb.t.contatos.size, 2); // corrigir não cria evento no funil

  const cons = await chamar(sb, 'acao_de_vendas', { operacao: 'consultar' });
  assert.equal(cons.ativa.nome, 'Av. Presidente Vargas · Rio Verde');
  assert.equal(cons.ativa.registros, 1);
  const nova = await chamar(sb, 'acao_de_vendas', { operacao: 'criar', cidade: 'Jataí' });
  assert.equal(nova.salvo, true);
  assert.equal(nova.ativa.cidade, 'Jataí');
  assert.ok(sb.t.acoes.get('a1').finalizada_em);
  assert.equal(sb.t.acoes.size, 2);
});

test('numeros e dados_para_arquivo', async () => {
  const sb = comAcao(bancoFalso());
  await chamar(sb, 'registrar_visita', visitaMQL);
  sb.t.config.set(USER, { id: USER, user_id: USER, metas: { leads: 40, mql: 12 }, dias_esfriando: 7 });
  const r = await chamar(sb, 'numeros', { periodo: 'semana' });
  assert.equal(r.periodo.de, '2026-11-09');
  assert.equal(r.funil.leads, 1);
  assert.equal(r.funil.mql, 1);
  assert.deepEqual(r.ritmo.leads, { meta: 10, real: 1, esperado_ate_hoje: 6, status: 'abaixo do ritmo' });
  assert.equal(r.mercado.abordadas, 1);
  const arq = await chamar(sb, 'dados_para_arquivo', { inicio: '2026-11-01', fim: '2026-11-30' });
  assert.equal(arq.leads.length, 1);
  assert.equal(arq.contatos.length, 2);
  assert.equal(arq.contatos[0].empresa, 'Transportes Boa Viagem');
});

test('a cópia da lógica dentro da função está igual à do app', () => {
  for (const a of ARQUIVOS_LIB_MCP) {
    assert.equal(readFileSync(new URL(`../supabase/functions/mcp/lib/${a}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../lib/${a}`, import.meta.url), 'utf8'), `${a} desatualizado: rode node scripts/copiar-lib-mcp.mjs`);
  }
});
