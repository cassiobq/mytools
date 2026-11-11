'use client';
// Data (e hora) do próximo passo: atalhos de um toque (+1, +2, +3, +7 dias) e, com a data escolhida,
// os horários LIVRES (horário de trabalho menos a sua agenda iCal e o que o CRM já marcou).
// O atalho da cadência padrão fica destacado, mas a data só é marcada quando você escolhe.
import { useEffect, useState } from 'react';
import { ATALHOS_DIAS, cadencia } from '../lib/etapas.js';
import { hojeISO, somarDias } from '../lib/datas.js';
import { agendaDe, horariosLivres, ocupadosDoCRM } from '../lib/agenda.js';
import { useApp } from './AppProvider.js';

// Ocupados da agenda iCal por dia (lidos no servidor), guardados por alguns minutos.
const cache = new Map();
async function ocupadosDoDia(sb, dia) {
  const c = cache.get(dia);
  if (c && Date.now() - c.em < 5 * 60000) return c.r;
  const { data, error } = await sb.functions.invoke('agenda', { body: { inicio: dia, fim: dia } });
  let r;
  if (!error) r = { ocupados: data.ocupados || [] };
  else {
    let corpo = {};
    try { corpo = await error.context.json(); } catch { /* sem corpo */ }
    r = corpo.semAgenda ? { ocupados: [], semAgenda: true } : { ocupados: [], erro: corpo.erro || 'Não foi possível ler a agenda.' };
  }
  cache.set(dia, { em: Date.now(), r });
  return r;
}

function useHorarios(dia, ativo, excetoId) {
  const { sb, leads, config, online } = useApp();
  const [r, setR] = useState(null);
  useEffect(() => {
    if (!ativo || !dia) { setR(null); return undefined; }
    let vivo = true;
    setR({ carregando: true, ocupados: [] });
    if (!online) { setR({ ocupados: [], semSinal: true }); return undefined; }
    ocupadosDoDia(sb, dia).then((x) => { if (vivo) setR(x); }).catch((e) => { if (vivo) setR({ ocupados: [], erro: String(e.message || e) }); });
    return () => { vivo = false; };
  }, [sb, dia, ativo, online]);
  if (!r) return null;
  const agenda = agendaDe(config);
  const todos = [...r.ocupados, ...ocupadosDoCRM(leads, dia, agenda, excetoId)];
  return { ...r, livres: horariosLivres(dia, todos, agenda) };
}

export default function CampoData({ rotulo, tipo, data, hora, onData, onHora, comHora = true, id = 'data', excetoId = null }) {
  const { config } = useApp();
  const hoje = hojeISO();
  const padrao = tipo ? cadencia(config)[tipo] : null;
  const h = useHorarios(data, comHora, excetoId);
  return (
    <div>
      <label className="rot" htmlFor={id}>{rotulo}</label>
      <div className="chips" role="group" aria-label={`Atalhos: ${rotulo}`} style={{ marginBottom: 8 }}>
        {ATALHOS_DIAS.map((n) => {
          const d = somarDias(hoje, n);
          return (
            <button key={n} type="button" className={`opcao${padrao === n ? ' sugerida' : ''}`} aria-pressed={data === d} onClick={() => onData(d)}>
              +{n} {n === 1 ? 'dia' : 'dias'}
            </button>
          );
        })}
      </div>
      <input id={id} type="date" value={data} min={hoje} onChange={(e) => onData(e.target.value)} aria-label={rotulo} />
      {comHora && data && h && (
        <div data-testid="horarios">
          {h.carregando ? <p className="meta">Lendo sua agenda…</p> : (<>
            {h.livres.length > 0
              ? <div className="horarios" role="group" aria-label={`Horários livres: ${rotulo}`}>
                {h.livres.map((x) => <button key={x} type="button" className="opcao" aria-pressed={hora === x} onClick={() => onHora(x)}>{x.replace(':', 'h')}</button>)}
              </div>
              : <p className="meta">Nenhum horário livre nesse dia (seg–sex, no seu horário de trabalho).</p>}
            {h.semAgenda && <p className="meta">Considerando só o que o CRM já marcou. Conecte sua agenda (iCal) em Metas e configurações.</p>}
            {h.semSinal && <p className="meta">Sem sinal: considerando só o que o CRM já marcou.</p>}
            {h.erro && <p className="erro-txt">{h.erro} Considerando só o que o CRM já marcou.</p>}
          </>)}
        </div>
      )}
      {comHora && (
        <div className="linha" style={{ marginTop: 6 }}>
          <span className="meta" style={{ flex: '0 0 auto' }}>Outro horário:</span>
          <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} aria-label={`Hora: ${rotulo}`} />
        </div>
      )}
    </div>
  );
}
