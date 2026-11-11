'use client';
// Data (e hora) do próximo passo, com atalhos de um toque (+1, +2, +3, +7 dias).
// O atalho da cadência padrão fica destacado, mas a data só é marcada quando você escolhe.
import { ATALHOS_DIAS, cadencia } from '../lib/etapas.js';
import { hojeISO, somarDias } from '../lib/datas.js';
import { useApp } from './AppProvider.js';

export default function CampoData({ rotulo, tipo, data, hora, onData, onHora, comHora = true, id = 'data' }) {
  const { config } = useApp();
  const hoje = hojeISO();
  const padrao = tipo ? cadencia(config)[tipo] : null;
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
      <div className="linha">
        <input id={id} type="date" value={data} min={hoje} onChange={(e) => onData(e.target.value)} aria-label={rotulo} />
        {comHora && <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} aria-label={`Hora: ${rotulo}`} style={{ flex: '0 0 38%' }} />}
      </div>
    </div>
  );
}
