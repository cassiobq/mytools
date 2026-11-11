'use client';
// Painel: metas (velocímetros), funil com taxas e gargalo, simulador, leitura do mercado,
// conversão por origem e cidade, e tempo de ciclo.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../AppProvider.js';
import { hojeISO, formatarData } from '../../lib/datas.js';
import { nomeDaAcao } from '../../lib/acoes.js';
import {
  periodo, deslocar, funil, metasDo, esperadoAteHoje, taxasDasMetas, passagens, simular, taxasIniciais,
  mercado, conversaoPor, ciclo, ETAPAS_META, ROTULO_META, UNIDADE_META,
} from '../../lib/painel.js';

const pct = (x) => (x == null || !isFinite(x) ? '—' : `${Math.round(x * 100)}%`);
const n1 = (x) => (x == null || !isFinite(x) ? '—' : x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
const n0 = (x) => (x == null || !isFinite(x) ? '—' : Math.ceil(x - 1e-9).toLocaleString('pt-BR'));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Velocímetro: ponteiro = realizado; marca laranja = esperado até hoje (a meta "andando").
function Velocimetro({ rotulo, unidade, real, meta, esperado }) {
  const max = Math.max(meta || 0, real, 1) * 1.15;
  const ang = (v) => Math.PI * (1 - Math.min(v, max) / max); // 180° (esq) a 0° (dir)
  const pt = (v, r) => [60 + r * Math.cos(ang(v)), 62 - r * Math.sin(ang(v))];
  const arco = (v) => { const [x, y] = pt(v, 48); return `M12 62 A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`; };
  const esp = meta ? meta * esperado : null;
  const [px, py] = pt(real, 40);
  const status = !meta ? 'sem meta' : real >= esp ? 'no ritmo' : `faltam ${n0(esp - real)} p/ o ritmo`;
  const cor = !meta ? 'var(--suave)' : real >= esp ? 'var(--ok)' : 'var(--perigo)';
  return (
    <div className="velo" data-testid={`velo-${rotulo}`}>
      <svg viewBox="0 0 120 70" role="img" aria-label={`${rotulo}: ${n1(real)} de ${meta ? n1(meta) : 'sem meta'}`}>
        <path d="M12 62 A48 48 0 0 1 108 62" fill="none" stroke="var(--borda)" strokeWidth="9" strokeLinecap="round" />
        {meta ? <path d={arco(meta)} fill="none" stroke="var(--sel-bg)" strokeOpacity=".25" strokeWidth="9" strokeLinecap="round" /> : null}
        {esp != null && (() => { const [a, b] = pt(esp, 54); const [c, d] = pt(esp, 40); return <line x1={a} y1={b} x2={c} y2={d} stroke="var(--foco)" strokeWidth="3" />; })()}
        <line x1="60" y1="62" x2={px} y2={py} stroke={cor} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="60" cy="62" r="4" fill={cor} />
      </svg>
      <div className="velo-num"><strong>{n1(real)}</strong>{meta ? <span> / {n1(meta)}</span> : null}</div>
      <div className="velo-rot">{rotulo} <span className="taxa">{unidade}</span></div>
      <div className="taxa" style={{ color: cor }}>{status}</div>
    </div>
  );
}

function Barras({ dados, total }) {
  const max = Math.max(...dados.map((d) => d.v), 1);
  return (
    <div className="barras">
      {dados.map((d) => (
        <div key={d.rot} className="barra-linha">
          <span>{d.rot}</span>
          <div className="barra"><div style={{ width: `${(d.v / max) * 100}%` }} /></div>
          <span className="taxa" style={{ display: 'inline' }}>{d.v}{total ? ` · ${pct(d.v / total)}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function Painel() {
  const { leads: todosLeads, contatos: todosContatos, config, acoes } = useApp();
  const [acaoId, setAcaoId] = useState('');
  // Filtro por ação de vendas: só as empresas registradas nela (e o histórico delas).
  const { leads, contatos } = useMemo(() => {
    if (!acaoId) return { leads: todosLeads, contatos: todosContatos };
    const ls = todosLeads.filter((l) => l.acao_id === acaoId);
    const ids = new Set(ls.map((l) => l.id));
    return { leads: ls, contatos: todosContatos.filter((c) => ids.has(c.lead_id)) };
  }, [todosLeads, todosContatos, acaoId]);
  const listaAcoes = [...acoes].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const hoje = hojeISO();
  const [p, setP] = useState(() => periodo('semana', hoje));
  const [cidade, setCidade] = useState(null);
  const [sim, setSim] = useState(null);

  const f = useMemo(() => funil(contatos, p), [contatos, p]);
  const tudo = useMemo(() => funil(contatos, { ini: '0000-01-01', fim: '9999-12-31' }), [contatos]);
  const metas = metasDo(config, p.tipo);
  const metasMes = metasDo(config, 'mes');
  const esperado = esperadoAteHoje(p, hoje);
  const vpc = tudo.taxas.veic_por_cotacao || 3;
  const esperadas = taxasDasMetas(metasMes, vpc);
  const ps = passagens(f, esperadas);
  const ini = useMemo(() => taxasIniciais(tudo, esperadas), [tudo, config]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = sim || { associados: metasMes.associados || 20, ...ini.taxas };
  const resultado = simular(s);
  const m = useMemo(() => mercado(leads, contatos, p, cidade), [leads, contatos, p, cidade]);
  const porOrigem = useMemo(() => conversaoPor('origem', leads, contatos, p), [leads, contatos, p]);
  const porCidade = useMemo(() => conversaoPor('cidade', leads, contatos, p), [leads, contatos, p]);
  const cic = useMemo(() => ciclo(contatos), [contatos]);
  const real = { leads: f.leads, mql: f.mql, sql: f.sql, vendas: f.vendas, associados: f.associados };
  const semMetas = ETAPAS_META.every((k) => !metas[k]);
  const atual = hoje >= p.ini && hoje < p.fim;

  const campoSim = (k, rot, ehPct = true) => (
    <label className="sim-campo">
      <span>{rot}{ini.fonte[k] ? <span className="taxa">{ { real: 'suas taxas', meta: 'das metas', chute: 'estimativa' }[ini.fonte[k]] }</span> : null}</span>
      <input type="number" inputMode="decimal" min="0" step={ehPct ? 1 : 0.1}
        value={ehPct ? Math.round((s[k] || 0) * 1000) / 10 : Math.round((s[k] || 0) * 10) / 10}
        onChange={(e) => setSim({ ...s, [k]: ehPct ? Number(e.target.value) / 100 : Number(e.target.value) })} aria-label={rot} />
      {ehPct && <span className="meta">%</span>}
    </label>
  );

  return (
    <main>
      <h1>Painel</h1>
      <div className="chips" role="group" aria-label="Período">
        <button type="button" className="opcao" aria-pressed={p.tipo === 'semana'} onClick={() => setP(periodo('semana', hoje))}>Semana</button>
        <button type="button" className="opcao" aria-pressed={p.tipo === 'mes'} onClick={() => setP(periodo('mes', hoje))}>Mês</button>
      </div>
      <div className="semana-nav">
        <button type="button" className="opcao" onClick={() => setP(deslocar(p, -1))} aria-label="Período anterior">‹</button>
        <strong data-testid="periodo">{p.rotulo}</strong>
        <button type="button" className="opcao" onClick={() => setP(deslocar(p, 1))} disabled={!(p.fim <= hoje) && atual} aria-label="Próximo período">›</button>
      </div>

      {listaAcoes.length > 0 && (
        <select aria-label="Ação de vendas" value={acaoId} onChange={(e) => setAcaoId(e.target.value)} className="seletor">
          <option value="">Todas as ações</option>
          {listaAcoes.map((a) => <option key={a.id} value={a.id}>{new Date(a.criado_em).toLocaleDateString('pt-BR')} · {nomeDaAcao(a)}</option>)}
        </select>
      )}

      <h2>Metas {p.tipo === 'semana' ? 'da semana' : 'do mês'}</h2>
      {semMetas
        ? <p className="dica">Defina as metas em <Link href="/config/">Metas e configurações</Link> para ver o ritmo.</p>
        : atual && <p className="meta">Marca laranja = esperado até hoje ({pct(esperado)} {p.tipo === 'semana' ? 'da semana, andando em 5 dias' : 'do mês'}).</p>}
      <div className="velos">
        {ETAPAS_META.map((k) => <Velocimetro key={k} rotulo={ROTULO_META[k]} unidade={UNIDADE_META[k]} real={real[k]} meta={metas[k]} esperado={esperado} />)}
      </div>

      <h2>Funil {p.tipo === 'semana' ? 'da semana' : 'do mês'}</h2>
      <table className="funil" data-testid="funil">
        <thead><tr><th>Etapa</th><th>Empresas</th><th>Veículos</th></tr></thead>
        <tbody>
          <tr><td>Lead <span className="taxa">abordagens</span></td><td>{f.leads}</td><td>—</td></tr>
          <tr><td>MQL <span className="taxa">2ª reunião agendada</span></td><td>{f.mql}</td><td>—</td></tr>
          <tr><td>SQL <span className="taxa">em cotação</span></td><td>{f.sql_empresas}</td><td>{f.sql}</td></tr>
          <tr><td>Venda</td><td>{f.vendas_empresas}</td><td>{f.vendas}</td></tr>
          <tr><td>Associado <span className="taxa">contrato assinado</span></td><td>{f.associados_empresas}</td><td>{f.associados}</td></tr>
        </tbody>
      </table>
      <table className="funil" style={{ marginTop: 10 }} data-testid="taxas">
        <thead><tr><th>Passagem</th><th>Real</th><th>Metas pedem</th></tr></thead>
        <tbody>
          {ps.map((x) => (
            <tr key={x.k} className={x.gargalo ? 'gargalo' : ''}>
              <td>{x.rotulo}{x.gargalo && <span className="tag atraso" style={{ marginLeft: 6 }}>gargalo</span>}
                {x.poucos && x.amostra > 0 && <span className="taxa">poucos dados ({x.amostra})</span>}</td>
              <td>{pct(x.real)}</td><td>{pct(x.esperada)}</td>
            </tr>
          ))}
          <tr><td><strong>Lead → Associado</strong> <span className="taxa">empresas</span></td><td><strong>{pct(f.taxas.total_empresas)}</strong></td><td /></tr>
        </tbody>
      </table>
      <p className="meta" style={{ marginTop: 8 }}>
        Veículos por empresa cotada: <strong>{n1(f.taxas.veic_por_cotacao)}</strong> · por associado: <strong>{n1(f.taxas.veic_por_associado)}</strong>
        {f.no_show ? <> · reuniões que não aconteceram: <strong>{f.no_show}</strong> ({pct(f.taxas.no_show)} dos MQL)</> : null}
      </p>
      {Object.keys(f.perdas).length > 0 && (<>
        <h2>Perdas por etapa</h2>
        {Object.entries(f.perdas).map(([et, x]) => (
          <p key={et} className="meta"><strong>{et.toUpperCase()}: {x.total}</strong> · {Object.entries(x.motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', ')}</p>
        ))}
      </>)}

      <h2>Simulador</h2>
      <p className="meta">Quantas abordagens para fechar a meta? Mude as taxas e veja onde vale melhorar.</p>
      <div className="sim">
        <label className="sim-campo"><span>Associados no mês <span className="taxa">veículos</span></span>
          <input type="number" inputMode="numeric" min="1" value={s.associados} onChange={(e) => setSim({ ...s, associados: Number(e.target.value) })} aria-label="Associados no mês" /></label>
        {campoSim('lead_mql', 'Lead → MQL')}
        {campoSim('mql_sql', 'MQL → SQL')}
        {campoSim('veic_por_cotacao', 'Veículos por empresa cotada', false)}
        {campoSim('sql_venda', 'SQL → Venda (veículos)')}
        {campoSim('venda_assoc', 'Venda → Associado (veículos)')}
      </div>
      {resultado ? (
        <div className="card sim-res" data-testid="simulador">
          <div>Precisa de <strong>{n0(resultado.leads)} leads/mês</strong> ≈ <strong>{n0(resultado.leadsSemana)}/semana</strong> ≈ <strong>{n1(resultado.leadsDia)}/dia</strong></div>
          <div className="meta">→ {n0(resultado.mql)} MQL → {n0(resultado.sqlEmpresas)} empresas em cotação ({n0(resultado.sql)} veículos) → {n0(resultado.vendas)} veículos vendidos → {n0(resultado.associados)} associados</div>
          {metasMes.leads ? <div className={resultado.leads > metasMes.leads ? 'erro-txt' : 'meta'} style={{ marginTop: 4 }}>
            Sua meta de leads é {metasMes.leads}/mês: {resultado.leads > metasMes.leads ? `faltariam ${n0(resultado.leads - metasMes.leads)} abordagens; melhore uma taxa ou aumente a meta de leads.` : 'dá conta.'}</div> : null}
          {sim && <button type="button" className="btn sec" style={{ marginTop: 8 }} onClick={() => setSim(null)}>Voltar às taxas iniciais</button>}
        </div>
      ) : <p className="erro-txt">Preencha todas as taxas com valores acima de zero.</p>}

      <h2>Leitura do mercado (abordagens {p.tipo === 'semana' ? 'da semana' : 'do mês'})</h2>
      {m.cidades.length > 1 && (
        <div className="chips" role="group" aria-label="Cidade do mercado" style={{ marginBottom: 8 }}>
          <button type="button" className="opcao" aria-pressed={!cidade} onClick={() => setCidade(null)}>Todas</button>
          {m.cidades.map((c) => <button key={c} type="button" className="opcao" aria-pressed={cidade === c} onClick={() => setCidade(c)}>{c}</button>)}
        </div>
      )}
      {!m.abordadas ? <p className="vazio">Nenhuma abordagem no período.</p> : (
        <div data-testid="mercado">
          <div className="kpis">
            <div><strong>{m.abordadas}</strong><span>abordadas</span></div>
            <div><strong>{pct(m.falou_decisor / m.abordadas)}</strong><span>falou c/ decisor</span></div>
            <div><strong>{m.veiculos}</strong><span>veículos mapeados</span></div>
            <div><strong>{pct(m.veiculos ? m.segurados / m.veiculos : null)}</strong><span>dos veículos segurados</span></div>
            <div><strong>{m.sem_seguro}</strong><span>veículos sem seguro</span></div>
            <div><strong>{n1(m.nota_media)}</strong><span>nota média do seguro</span></div>
          </div>
          <h3>Empresas com veículos ({m.com_veiculos}) · sem veículos: {m.sem_veiculos}</h3>
          <Barras total={m.com_veiculos} dados={[
            { rot: 'Todos segurados', v: m.empresas_todos_segurados },
            { rot: 'Parte segurada', v: m.empresas_parte_segurada },
            { rot: 'Nenhum segurado', v: m.empresas_nenhum_segurado },
          ]} />
          <h3>Tamanho da frota</h3>
          <Barras total={m.com_veiculos} dados={Object.entries(m.frota).map(([k, v]) => ({ rot: `${k} veíc.`, v }))} />
          {m.seguradoras.length > 0 && (<>
            <h3>Seguradoras</h3>
            <table className="funil">
              <thead><tr><th>Seguradora</th><th>Empresas</th><th>Veículos</th><th>Nota</th></tr></thead>
              <tbody>{m.seguradoras.map((x) => <tr key={x.nome}><td>{x.nome}</td><td>{x.empresas}</td><td>{x.veiculos}</td><td>{n1(x.nota_media)}</td></tr>)}</tbody>
            </table>
          </>)}
          {m.notas.some(Boolean) && (<>
            <h3>Satisfação com o seguro atual</h3>
            <Barras total={m.notas.reduce((a, b) => a + b, 0)} dados={m.notas.map((v, i) => ({ rot: `Nota ${i}`, v }))} />
          </>)}
          {Object.keys(m.motivos).length > 0 && (<>
            <h3>Por que não protegeram</h3>
            <Barras dados={Object.entries(m.motivos).sort((a, b) => b[1] - a[1]).map(([rot, v]) => ({ rot, v }))} />
          </>)}
          {Object.keys(m.vencimentos).length > 0 && (<>
            <h3>Vencimentos (veículos segurados por mês)</h3>
            <Barras dados={Object.entries(m.vencimentos).map(([k, v]) => ({ rot: `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`, v }))} />
          </>)}
        </div>
      )}

      {porOrigem.length > 0 && (<>
        <h2>Conversão por origem e cidade</h2>
        <p className="meta">Das empresas abordadas no período, quantas já chegaram a cada etapa.</p>
        {[['Origem', porOrigem], ['Cidade', porCidade]].map(([t, linhas]) => (
          <table key={t} className="funil" style={{ marginBottom: 10 }}>
            <thead><tr><th>{t}</th><th>Leads</th><th>MQL</th><th>SQL</th><th>Assoc.</th></tr></thead>
            <tbody>{linhas.map((x) => (
              <tr key={x.grupo}><td>{x.grupo}</td><td>{x.leads}</td><td>{x.mql}<span className="taxa">{pct(x.taxa_mql)}</span></td><td>{x.sql}</td><td>{x.associado}<span className="taxa">{pct(x.taxa_total)}</span></td></tr>
            ))}</tbody>
          </table>
        ))}
      </>)}

      <h2>Tempo de ciclo (todo o histórico)</h2>
      <table className="funil">
        <thead><tr><th>Trecho</th><th>Mediana</th><th>Casos</th></tr></thead>
        <tbody>
          {[['Lead → MQL', cic.lead_mql], ['MQL → SQL', cic.mql_sql], ['SQL → Venda', cic.sql_venda], ['Venda → Associado', cic.venda_assoc], ['Lead → Associado', cic.total]].map(([r, x]) => (
            <tr key={r}><td>{r}</td><td>{x.n ? `${n1(x.mediana)} dias` : '—'}</td><td>{x.n}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="meta" style={{ marginTop: 6 }}>Hoje: {formatarData(hoje)}</p>
    </main>
  );
}
