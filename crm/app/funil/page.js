'use client';
// Funil da semana (seletor de semana), no total e por estratégia, com a linha de base de abordagens de frota.
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider.js';
import { calcularFunil, abordagensDeFrota, ESTRATEGIAS } from '../../lib/funil.js';
import { hojeISO, somarDias, inicioDaSemana, formatarData } from '../../lib/datas.js';

const META_FROTA = 50;
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);

const LINHAS = [
  { chave: 'abordagens', rotulo: 'Abordagens' },
  { chave: 'decisor', rotulo: 'Falou c/ decisor', taxa: 'taxa_decisor', dica: 'dos registros da semana' },
  { chave: 'indicacoes', rotulo: 'Indicações recebidas' },
  { chave: 'cotacoes', rotulo: 'Cotações', taxa: 'taxa_cotacao', dica: 'dos registros da semana' },
  { chave: 'vendas', rotulo: 'Vendas', taxa: 'taxa_venda', dica: 'das cotações' },
];

export default function Funil() {
  const { leads, contatos } = useApp();
  const [semana, setSemana] = useState(() => inicioDaSemana(hojeISO()));
  const f = useMemo(() => calcularFunil(leads, contatos, semana), [leads, contatos, semana]);
  const frota = abordagensDeFrota(leads);
  const estaSemana = semana === inicioDaSemana(hojeISO());

  return (
    <main>
      <h1>Funil</h1>
      <div className="card">
        <div className="base"><span>Abordagens de frota</span><span data-testid="base-frota">{frota}/{META_FROTA}</span></div>
        <div className="barra" aria-hidden="true"><div style={{ width: `${Math.min(100, (frota / META_FROTA) * 100)}%` }} /></div>
        <div className="meta" style={{ marginTop: 6 }}>Linha de base: todas as abordagens de frota já registradas.</div>
      </div>

      <div className="linha" style={{ margin: '14px 0' }}>
        <button type="button" className="btn sec" style={{ flex: '0 0 56px' }} aria-label="Semana anterior" onClick={() => setSemana((s) => somarDias(s, -7))}>‹</button>
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {estaSemana ? 'Esta semana' : 'Semana'}<br />
          <span className="meta">{formatarData(f.inicio)} a {formatarData(f.fim)}</span>
        </div>
        <button type="button" className="btn sec" style={{ flex: '0 0 56px' }} aria-label="Próxima semana" disabled={estaSemana} onClick={() => setSemana((s) => somarDias(s, 7))}>›</button>
      </div>

      <table className="funil">
        <thead>
          <tr><th>Etapa</th><th>Total</th>{ESTRATEGIAS.map((e) => <th key={e.valor}>{e.rotulo}</th>)}</tr>
        </thead>
        <tbody>
          {LINHAS.map((l) => (
            <tr key={l.chave}>
              <td>{l.rotulo}{l.dica && <span className="taxa">% {l.dica}</span>}</td>
              <td><strong>{f.total[l.chave]}</strong>{l.taxa && <span className="taxa">{pct(f.total[l.taxa])}</span>}</td>
              {ESTRATEGIAS.map((e) => (
                <td key={e.valor}>{f.porEstrategia[e.valor][l.chave]}{l.taxa && <span className="taxa">{pct(f.porEstrategia[e.valor][l.taxa])}</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">Abordagens, decisor e indicações contam as empresas registradas na semana. Cotações e vendas
        contam pela data do contato (visita ou retorno) em que aconteceram.</p>
    </main>
  );
}
