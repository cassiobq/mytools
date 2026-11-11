// Agenda: horários livres (horário de trabalho menos compromissos) e o botão "Adicionar à agenda" (Android).
import { deISO } from './datas.js';

export const AGENDA_PADRAO = { dias: [1, 2, 3, 4, 5], faixas: [['09:00', '12:00'], ['14:00', '17:00']], duracao: 60 };
export const agendaDe = (config) => ({ ...AGENDA_PADRAO, ...(config?.agenda || {}) });

const min = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

// Horário local (do aparelho) de "AAAA-MM-DD" + "HH:MM" como Date.
export const quando = (dia, hora) => { const d = deISO(dia); const [h, m] = hora.split(':').map(Number); d.setHours(h, m, 0, 0); return d; };

// ocupados: [{inicio: Date|ISO, fim: Date|ISO}]. Devolve os inícios livres ("HH:MM") do dia.
export function horariosLivres(dia, ocupados, agenda = AGENDA_PADRAO, agora = new Date()) {
  const d = deISO(dia);
  if (!agenda.dias.includes(d.getDay())) return [];
  const blocos = ocupados.map((o) => [new Date(o.inicio).getTime(), new Date(o.fim).getTime()]);
  const livres = [];
  for (const [a, b] of agenda.faixas) {
    for (let t = min(a); t + agenda.duracao <= min(b); t += agenda.duracao) {
      const ini = quando(dia, hhmm(t)).getTime();
      const fim = ini + agenda.duracao * 60000;
      if (ini <= agora.getTime()) continue;
      if (blocos.some(([x, y]) => x < fim && y > ini)) continue;
      livres.push(hhmm(t));
    }
  }
  return livres;
}

// Compromissos que o próprio CRM já marcou (conta mesmo antes de o Google atualizar o iCal).
export function ocupadosDoCRM(leads, dia, agenda = AGENDA_PADRAO, excetoId = null) {
  return leads
    .filter((l) => l.id !== excetoId && !l.arquivado && l.data_proximo_passo === dia && l.hora_proximo_passo)
    .map((l) => { const ini = quando(dia, l.hora_proximo_passo.slice(0, 5)); return { inicio: ini, fim: new Date(ini.getTime() + agenda.duracao * 60000) }; });
}

const TITULO = { reuniao: 'Reunião', retorno: 'Retorno', negociacao: 'Retorno da cotação', contrato: 'Assinatura do contrato' };

// Compromisso com hora marcado nesta gravação (para o botão "Adicionar à agenda").
export function compromissoDosOps(ops, agenda = AGENDA_PADRAO) {
  const l = ops.filter((o) => o.tabela === 'leads').map((o) => o.linha).find((x) => x.data_proximo_passo && x.hora_proximo_passo && TITULO[x.proximo_tipo]);
  if (!l) return null;
  const inicio = quando(l.data_proximo_passo, l.hora_proximo_passo.slice(0, 5));
  const detalhes = [
    l.decisor_nome ? `Decisor: ${l.decisor_nome}` : null,
    l.decisor_whatsapp ? `WhatsApp: ${l.decisor_whatsapp}` : null,
    l.n_veiculos != null ? `Veículos: ${l.n_veiculos}${l.n_segurados != null ? ` (${l.n_segurados} segurados)` : ''}` : null,
    l.observacao ? `Obs.: ${l.observacao}` : null,
    'Marcado pelo Micro CRM',
  ].filter(Boolean).join('\n');
  return { titulo: `${TITULO[l.proximo_tipo]} – ${l.empresa}`, inicio, fim: new Date(inicio.getTime() + agenda.duracao * 60000), detalhes, local: [l.empresa, l.cidade].filter(Boolean).join(', ') };
}

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function linkGoogleAgenda(c) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: c.titulo, dates: `${utc(c.inicio)}/${utc(c.fim)}`, details: c.detalhes, location: c.local });
  return `https://calendar.google.com/calendar/render?${p}`;
}
// Android: abre direto a tela "novo evento" do app de agenda (Google Agenda); sem app, cai no link web.
export function linkAndroid(c) {
  const e = encodeURIComponent;
  return `intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.item/event;S.title=${e(c.titulo)};l.beginTime=${c.inicio.getTime()};l.endTime=${c.fim.getTime()};S.eventLocation=${e(c.local)};S.description=${e(c.detalhes)};S.browser_fallback_url=${e(linkGoogleAgenda(c))};end`;
}
export const linkAgenda = (c, ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) => (/Android/i.test(ua) ? linkAndroid(c) : linkGoogleAgenda(c));
