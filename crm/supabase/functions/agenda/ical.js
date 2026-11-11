// Leitura de um calendário iCal (.ics), como o "endereço secreto iCal" do Google Agenda:
// devolve os horários ocupados num intervalo. JavaScript puro (Deno na Edge Function e Node nos testes).
// Cobre: horários UTC, com TZID e flutuantes; dia inteiro; DTEND ou DURATION; recorrência (RRULE
// DAILY/WEEKLY/MONTHLY/YEARLY com INTERVAL, COUNT, UNTIL, BYDAY semanal), EXDATE, ocorrências alteradas
// (RECURRENCE-ID), cancelados e eventos marcados como "livre" (TRANSP:TRANSPARENT).

const FUSO_PADRAO = 'America/Sao_Paulo';

function desdobrar(texto) {
  return texto.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function linha(l) {
  const i = l.indexOf(':');
  if (i < 0) return null;
  const [nome, ...params] = l.slice(0, i).split(';');
  const p = {};
  for (const x of params) { const [k, v] = x.split('='); p[k.toUpperCase()] = (v || '').replace(/^"|"$/g, ''); }
  return { nome: nome.toUpperCase(), p, valor: l.slice(i + 1) };
}

// Diferença (ms) entre o horário de parede no fuso e o UTC, no instante t.
function deslocamento(fuso, t) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const v = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - t;
}
function paraUTC(a, m, d, h, mi, s, fuso) {
  let fz = fuso;
  try { new Intl.DateTimeFormat('en-US', { timeZone: fz }); } catch { fz = FUSO_PADRAO; }
  const parede = Date.UTC(a, m - 1, d, h, mi, s);
  let t = parede - deslocamento(fz, parede);
  t = parede - deslocamento(fz, t);
  return t;
}

// Valor de data do iCal -> { t: ms UTC, diaInteiro }
function data(valor, p, fusoCal) {
  const v = valor.trim();
  if (p.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const [a, m, d] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].map(Number);
    return { t: paraUTC(a, m, d, 0, 0, 0, fusoCal || FUSO_PADRAO), diaInteiro: true };
  }
  const r = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!r) return null;
  const n = r.slice(1, 7).map(Number);
  if (r[7] === 'Z') return { t: Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]), diaInteiro: false };
  return { t: paraUTC(...n, p.TZID || fusoCal || FUSO_PADRAO), diaInteiro: false };
}

function duracao(v) {
  const r = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!r) return 0;
  const [, sinal, w, d, h, m, s] = r;
  const ms = ((+w || 0) * 7 * 86400 + (+d || 0) * 86400 + (+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0)) * 1000;
  return sinal === '-' ? -ms : ms;
}

export function lerEventos(texto) {
  const eventos = [];
  let fusoCal = null;
  let ev = null;
  for (const bruta of desdobrar(texto)) {
    const l = linha(bruta);
    if (!l) continue;
    if (l.nome === 'X-WR-TIMEZONE') fusoCal = l.valor.trim();
    if (l.nome === 'BEGIN' && l.valor === 'VEVENT') { ev = { exdates: [] }; continue; }
    if (l.nome === 'END' && l.valor === 'VEVENT') { if (ev) eventos.push(ev); ev = null; continue; }
    if (!ev) continue;
    switch (l.nome) {
      case 'UID': ev.uid = l.valor; break;
      case 'DTSTART': ev.ini = data(l.valor, l.p, fusoCal); ev.fusoIni = l.p.TZID || fusoCal || FUSO_PADRAO; break;
      case 'DTEND': ev.fim = data(l.valor, l.p, fusoCal); break;
      case 'DURATION': ev.dur = duracao(l.valor); break;
      case 'RRULE': ev.rrule = Object.fromEntries(l.valor.split(';').map((x) => x.split('='))); break;
      case 'EXDATE': for (const v of l.valor.split(',')) { const d = data(v, l.p, fusoCal); if (d) ev.exdates.push(d.t); } break;
      case 'RECURRENCE-ID': ev.recId = data(l.valor, l.p, fusoCal)?.t; break;
      case 'STATUS': ev.cancelado = l.valor.trim().toUpperCase() === 'CANCELLED'; break;
      case 'TRANSP': ev.livre = l.valor.trim().toUpperCase() === 'TRANSPARENT'; break;
      default:
    }
  }
  return eventos.filter((e) => e.ini);
}

const DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Partes de data no fuso (para repetir "no mesmo horário de parede").
function partes(t, fuso) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const v = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { a: +v.year, m: +v.month, d: +v.day, h: +v.hour, mi: +v.minute, s: +v.second };
}

function* ocorrencias(e, ate) {
  const dur = e.fim ? e.fim.t - e.ini.t : e.dur || (e.ini.diaInteiro ? 86400000 : 0);
  if (!e.rrule) { yield [e.ini.t, e.ini.t + dur]; return; }
  const r = e.rrule;
  const passo = Math.max(1, +(r.INTERVAL || 1));
  const limite = r.UNTIL ? data(r.UNTIL, {}, e.fusoIni)?.t ?? Infinity : Infinity;
  const total = r.COUNT ? +r.COUNT : Infinity;
  const fuso = e.fusoIni;
  const p0 = partes(e.ini.t, fuso);
  const em = (a, m, d) => paraUTC(a, m, d, p0.h, p0.mi, p0.s, fuso);
  const dias = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map((x) => DIAS[x.slice(-2)]).filter((x) => x != null) : null;
  let n = 0;
  for (let k = 0; k < 5000; k++) {
    let candidatos;
    if (r.FREQ === 'DAILY') candidatos = [new Date(Date.UTC(p0.a, p0.m - 1, p0.d + k * passo))];
    else if (r.FREQ === 'WEEKLY') {
      const base = new Date(Date.UTC(p0.a, p0.m - 1, p0.d + k * 7 * passo));
      if (!dias) candidatos = [base];
      else {
        const seg = new Date(base); seg.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
        candidatos = dias.map((dw) => { const x = new Date(seg); x.setUTCDate(seg.getUTCDate() + ((dw + 6) % 7)); return x; }).sort((x, y) => x - y);
      }
    } else if (r.FREQ === 'MONTHLY') candidatos = [new Date(Date.UTC(p0.a, p0.m - 1 + k * passo, p0.d))];
    else if (r.FREQ === 'YEARLY') candidatos = [new Date(Date.UTC(p0.a + k * passo, p0.m - 1, p0.d))];
    else { yield [e.ini.t, e.ini.t + dur]; return; }
    for (const c of candidatos) {
      if (r.FREQ === 'MONTHLY' && c.getUTCDate() !== p0.d) continue; // dia 31 em mês curto: não existe
      const t = em(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate());
      if (t < e.ini.t) continue;
      if (t > limite || n >= total || t > ate) return;
      n++;
      if (!e.exdates.includes(t)) yield [t, t + dur];
    }
  }
}

// Ocupados entre "de" e "ate" (ms). Devolve [{inicio, fim}] em ISO, ordenados.
export function ocupados(texto, de, ate) {
  const eventos = lerEventos(texto);
  const alterados = new Map();
  for (const e of eventos) if (e.recId != null && e.uid) { if (!alterados.has(e.uid)) alterados.set(e.uid, []); alterados.get(e.uid).push(e.recId); }
  const res = [];
  for (const e of eventos) {
    if (e.recId == null && e.uid && alterados.has(e.uid)) e.exdates.push(...alterados.get(e.uid));
    if (e.cancelado || e.livre) continue;
    for (const [i, f] of ocorrencias(e, ate)) if (f > de && i < ate) res.push({ inicio: new Date(i).toISOString(), fim: new Date(Math.max(f, i + 1)).toISOString() });
  }
  return res.sort((a, b) => a.inicio.localeCompare(b.inicio));
}
