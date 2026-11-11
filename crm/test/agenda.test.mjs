import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ocupados, lerEventos } from '../supabase/functions/agenda/ical.js';
import { horariosLivres, ocupadosDoCRM, compromissoDosOps, linkAndroid, linkGoogleAgenda } from '../lib/agenda.js';
import { opsNovaAcao, acaoAtiva, resumoAcao, textoDuracao } from '../lib/acoes.js';

const ICS = [
  'BEGIN:VCALENDAR', 'X-WR-TIMEZONE:America/Sao_Paulo',
  // Simples com TZID: 12/11 10:00-11:00 BRT
  'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=America/Sao_Paulo:20261112T100000', 'DTEND;TZID=America/Sao_Paulo:20261112T110000', 'SUMMARY:Dentista', 'END:VEVENT',
  // UTC: 12/11 17:00Z = 14:00 BRT, 30 min
  'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261112T170000Z', 'DURATION:PT30M', 'END:VEVENT',
  // Livre (não bloqueia) e cancelado
  'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261112T150000Z', 'DTEND:20261112T160000Z', 'TRANSP:TRANSPARENT', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:d', 'DTSTART:20261112T180000Z', 'DTEND:20261112T190000Z', 'STATUS:CANCELLED', 'END:VEVENT',
  // Semanal seg/qua 09:00 BRT, a partir de 02/11, com EXDATE em 11/11 e uma ocorrência movida (16/11 -> 16/11 16h)
  'BEGIN:VEVENT', 'UID:r', 'DTSTART;TZID=America/Sao_Paulo:20261102T090000', 'DTEND;TZID=America/Sao_Paulo:20261102T100000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE;TZID=America/Sao_Paulo:20261111T090000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:r', 'RECURRENCE-ID;TZID=America/Sao_Paulo:20261116T090000', 'DTSTART;TZID=America/Sao_Paulo:20261116T160000',
  'DTEND;TZID=America/Sao_Paulo:20261116T170000', 'END:VEVENT',
  // Dia inteiro (ocupado) em 13/11, linha dobrada
  'BEGIN:VEVENT', 'UID:e', 'DTSTART;VALUE=DATE:20261113', 'DTEND;VALUE=DATE:20261114', 'SUMMARY:Via', '  gem', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const brt = (s) => Date.parse(`${s}-03:00`);

test('iCal: fusos, duração, livre/cancelado, recorrência com exceções', () => {
  assert.equal(lerEventos(ICS).length, 7);
  const o = ocupados(ICS, brt('2026-11-12T00:00:00'), brt('2026-11-12T23:59:59'));
  assert.deepEqual(o.map((x) => [x.inicio, x.fim]), [
    ['2026-11-12T13:00:00.000Z', '2026-11-12T14:00:00.000Z'],
    ['2026-11-12T17:00:00.000Z', '2026-11-12T17:30:00.000Z'],
  ]);
  const sem = ocupados(ICS, brt('2026-11-02T00:00:00'), brt('2026-11-30T23:59:59')).filter((x) => x.inicio.endsWith('12:00:00.000Z') || x.inicio.startsWith('2026-11-16'));
  // Seg/qua 9h BRT (12:00Z): 02, 04, 09, (11 excluído), 16 movido para 16h, 18 -> COUNT=6 conta as 6 primeiras datas.
  assert.deepEqual(sem.map((x) => x.inicio.slice(0, 16)), ['2026-11-02T12:00', '2026-11-04T12:00', '2026-11-09T12:00', '2026-11-16T19:00', '2026-11-18T12:00']);
  const diaInteiro = ocupados(ICS, brt('2026-11-13T00:00:00'), brt('2026-11-13T23:59:59'));
  assert.deepEqual(diaInteiro.map((x) => [x.inicio, x.fim]), [['2026-11-13T03:00:00.000Z', '2026-11-14T03:00:00.000Z']]);
});

test('horários livres: seg-sex 9-12 e 14-17, blocos de 60 min, sem conflito e sem horário passado', () => {
  process.env.TZ = 'America/Sao_Paulo';
  const ag = { dias: [1, 2, 3, 4, 5], faixas: [['09:00', '12:00'], ['14:00', '17:00']], duracao: 60 };
  const cedo = new Date('2026-11-01T12:00:00Z');
  const oc = ocupados(ICS, brt('2026-11-12T00:00:00'), brt('2026-11-12T23:59:59'));
  assert.deepEqual(horariosLivres('2026-11-12', oc, ag, cedo), ['09:00', '11:00', '15:00', '16:00']); // 10h e 14h ocupados
  assert.deepEqual(horariosLivres('2026-11-14', [], ag, cedo), []); // sábado
  assert.deepEqual(horariosLivres('2026-11-12', [], ag, new Date('2026-11-12T13:30:00Z')), ['11:00', '14:00', '15:00', '16:00']); // agora 10h30
  const crm = ocupadosDoCRM([{ id: 'x', data_proximo_passo: '2026-11-12', hora_proximo_passo: '09:00:00' }], '2026-11-12', ag);
  assert.deepEqual(horariosLivres('2026-11-12', [...oc, ...crm], ag, cedo), ['11:00', '15:00', '16:00']);
});

test('adicionar à agenda: compromisso do que foi gravado e links (Android e web)', () => {
  process.env.TZ = 'America/Sao_Paulo';
  const ops = [{ tabela: 'leads', linha: { empresa: 'ACME', cidade: 'Rio Verde', decisor_nome: 'Rafael', decisor_whatsapp: '64999990000',
    proximo_tipo: 'reuniao', data_proximo_passo: '2026-11-12', hora_proximo_passo: '14:00', n_veiculos: 3, n_segurados: 0 } }];
  const c = compromissoDosOps(ops);
  assert.equal(c.titulo, 'Reunião – ACME');
  assert.equal(c.inicio.toISOString(), '2026-11-12T17:00:00.000Z');
  assert.equal(c.fim.toISOString(), '2026-11-12T18:00:00.000Z');
  assert.match(linkAndroid(c), /^intent:#Intent;action=android\.intent\.action\.INSERT;type=vnd\.android\.cursor\.item\/event;S\.title=Reuni%C3%A3o%20%E2%80%93%20ACME;l\.beginTime=1794502800000;/);
  assert.match(linkGoogleAgenda(c), /dates=20261112T170000Z%2F20261112T180000Z/);
  assert.equal(compromissoDosOps([{ tabela: 'leads', linha: { proximo_tipo: 'vencimento', data_proximo_passo: '2027-03-01' } }]), null);
});

test('ações: a nova finaliza a anterior; resumo pela hora das visitas', () => {
  const agora = new Date('2026-11-12T12:00:00Z');
  const ops1 = opsNovaAcao({ cidade: 'Caçu', endereco: '' }, [], agora);
  assert.equal(ops1.length, 1);
  const a1 = ops1[0].linha;
  assert.equal(a1.endereco, null);
  const ops2 = opsNovaAcao({ cidade: 'Rio Verde', endereco: 'Av. Presidente Vargas' }, [a1], new Date('2026-11-12T18:00:00Z'));
  assert.equal(ops2[0].linha.id, a1.id); assert.ok(ops2[0].linha.finalizada_em);
  assert.equal(acaoAtiva([a1, ops2[1].linha]).cidade, 'Rio Verde');
  assert.throws(() => opsNovaAcao({ cidade: ' ' }, []), /cidade/);
  const leads = [{ id: 'l1', acao_id: a1.id }, { id: 'l2', acao_id: a1.id }, { id: 'l3', acao_id: a1.id, lead_pai_id: 'l1' }];
  const cs = [
    { lead_id: 'l1', evento: 'abordagem', data: '2026-11-12T12:10:00Z' }, { lead_id: 'l1', evento: 'mql', data: '2026-11-12T12:10:01Z' },
    { lead_id: 'l2', evento: 'abordagem', data: '2026-11-12T14:45:00Z' },
  ];
  const r = resumoAcao(a1, leads, cs);
  assert.equal(r.registros, 2); assert.equal(r.mql, 1); assert.equal(r.duracaoMin, 155);
  assert.equal(textoDuracao(155), '2h35'); assert.equal(textoDuracao(45), '45 min');
});
