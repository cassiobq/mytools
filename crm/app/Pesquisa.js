'use client';
// Formulário da abordagem: as perguntas aparecem conforme as respostas (ver lib/pesquisa.js).
// modo: 'abordagem' (visita nova) | 'retorno' (lead já existe) | 'editar' (só corrige dados, sem agenda).
import { useEffect, useMemo, useState } from 'react';
import { Escolha, CampoObservacao } from './ui.js';
import CampoData from './CampoData.js';
import { useApp } from './AppProvider.js';
import { analisar, opcoesSegurados, MOTIVOS_SEM_SEGURO, NOTA_SATISFEITO } from '../lib/pesquisa.js';
import { rotuloEtapa } from '../lib/etapas.js';

export const ORIGENS = [{ valor: 'abordagem', rotulo: 'Abordagem' }, { valor: 'indicacao', rotulo: 'Indicação' }];
const SIM_NAO = [{ valor: true, rotulo: 'Sim' }, { valor: false, rotulo: 'Não' }];
const VEICULOS = [0, 1, 2, 3, '4+'].map((v) => ({ valor: v, rotulo: String(v) }));
const NOTAS = [0, 1, 2, 3, 4, 5].map((v) => ({ valor: v, rotulo: String(v) }));

const PREFS = 'crm:prefs';
export function lerPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; }
}
function guardarPrefs(f) {
  try {
    const p = lerPrefs();
    const cidades = [f.cidade, ...(p.cidades || [])].filter(Boolean).filter((c, i, a) => a.indexOf(c) === i).slice(0, 6);
    localStorage.setItem(PREFS, JSON.stringify({ ...p, cidade: f.cidade, cidades }));
  } catch { /* sem localStorage: só não lembra */ }
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function Pesquisa({ inicial, onSalvar, modo = 'abordagem', lead = null, tentativas = 0, textoBotao = 'Salvar visita', aoLimpar }) {
  const { leads } = useApp();
  const [f, setF] = useState(inicial);
  const [cidades, setCidades] = useState([]);
  const [outraCidade, setOutraCidade] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const set = (campo) => (v) => setF((a) => ({ ...a, [campo]: typeof v === 'function' ? v(a[campo]) : v }));
  const mudar = (m) => setF((a) => ({ ...a, ...m }));
  useEffect(() => { setCidades(lerPrefs().cidades || []); }, []);

  const a = analisar(f);
  const editar = modo === 'editar';
  const falta = editar ? (f.empresa.trim() ? [] : ['Empresa']) : a.falta;
  const nV = a.nVeiculos;

  // Empresa repetida (só na visita nova).
  const repetidas = useMemo(() => {
    const q = norm(f.empresa);
    if (modo !== 'abordagem' || q.length < 3) return [];
    return leads.filter((l) => !l.lead_pai_id && norm(l.empresa) === q).slice(0, 3);
  }, [f.empresa, leads, modo]);
  const seguradoras = useMemo(() => [...new Set(leads.map((l) => l.seguradora).filter(Boolean))].sort(), [leads]);

  const salvar = async (e) => {
    e.preventDefault();
    if (falta.length || ocupado) return;
    setOcupado(true);
    try {
      guardarPrefs(f);
      const ok = await onSalvar(f);
      if (ok && modo === 'abordagem') {
        setCidades(lerPrefs().cidades || []);
        setOutraCidade(false);
        aoLimpar?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally { setOcupado(false); }
  };

  const opcoesCidade = [...new Set([f.cidade, ...cidades].filter(Boolean))].map((c) => ({ valor: c, rotulo: c }));
  const opcSeg = opcoesSegurados(nV).map((v) => ({ valor: v, rotulo: String(v) }));

  return (
    <form onSubmit={salvar} noValidate>
      {modo !== 'retorno' ? (<>
        <label className="rot" htmlFor="empresa">Empresa</label>
        <input id="empresa" type="text" value={f.empresa} onChange={(e) => set('empresa')(e.target.value)} autoComplete="off" enterKeyHint="next" />
        {repetidas.map((l) => (
          <p key={l.id} className="dica" role="alert">Já registrada: {l.empresa}{l.cidade ? ` (${l.cidade})` : ''} · {rotuloEtapa(l.etapa)}{l.arquivado ? ' · arquivada' : ''}.
            {' '}Para um novo contato com ela, use “Registrar contato” em Hoje ou Empresas.</p>
        ))}

        <label className="rot">Origem</label>
        <Escolha rotulo="Origem" opcoes={ORIGENS} valor={f.origem} onChange={(v) => set('origem')(v || 'abordagem')} duas desmarcavel={false} />
        {f.origem === 'indicacao' && (<>
          <label className="rot" htmlFor="indicado_por">Indicado por</label>
          <input id="indicado_por" type="text" value={f.indicado_por} onChange={(e) => set('indicado_por')(e.target.value)} />
        </>)}

        <label className="rot">Cidade</label>
        {!outraCidade ? (
          <div className="chips" role="group" aria-label="Cidade">
            {opcoesCidade.map((o) => (
              <button key={o.valor} type="button" className="opcao" aria-pressed={f.cidade === o.valor} onClick={() => set('cidade')(o.valor)}>{o.rotulo}</button>
            ))}
            <button type="button" className="opcao" onClick={() => { setOutraCidade(true); set('cidade')(''); }}>+ Outra</button>
          </div>
        ) : (
          <input type="text" aria-label="Cidade" value={f.cidade} onChange={(e) => set('cidade')(e.target.value)} autoFocus />
        )}
      </>) : (
        <p className="meta">{lead?.cidade || ''}{lead?.decisor_nome ? ` · Decisor: ${lead.decisor_nome}` : ''}</p>
      )}

      <label className="rot">Falou com o decisor?</label>
      <Escolha rotulo="Falou com o decisor" opcoes={SIM_NAO} valor={f.falou_decisor} onChange={set('falou_decisor')} duas />
      {tentativas >= 2 && f.falou_decisor === false && (
        <p className="dica" role="alert">{tentativas + 1}ª tentativa sem encontrar o decisor. Que tal ligar, ou marcar como fora do perfil?</p>
      )}

      {f.falou_decisor === false && !editar && (
        <div className="passo">
          <CampoData id="data-retorno" rotulo="Retorno com o decisor" tipo="retorno" data={f.data} hora={f.hora} onData={set('data')} onHora={set('hora')} />
          <label className="rot" htmlFor="decisor_nome">Nome do decisor (se souber)</label>
          <input id="decisor_nome" type="text" value={f.decisor_nome} onChange={(e) => set('decisor_nome')(e.target.value)} />
          <label className="rot" htmlFor="decisor_whatsapp">WhatsApp (se souber)</label>
          <input id="decisor_whatsapp" type="tel" inputMode="tel" value={f.decisor_whatsapp} onChange={(e) => set('decisor_whatsapp')(e.target.value)} />
        </div>
      )}

      {f.falou_decisor === true && (
        <div className="passo">
          <label className="rot" htmlFor="decisor_nome">Nome do decisor</label>
          <input id="decisor_nome" type="text" value={f.decisor_nome} onChange={(e) => set('decisor_nome')(e.target.value)} autoComplete="off" />
          <label className="rot" htmlFor="decisor_whatsapp">WhatsApp</label>
          <input id="decisor_whatsapp" type="tel" inputMode="tel" value={f.decisor_whatsapp} onChange={(e) => set('decisor_whatsapp')(e.target.value)} placeholder="(64) 9 9999-9999" />

          <label className="rot">Quantos veículos próprios / no CNPJ?</label>
          <Escolha rotulo="Veículos" opcoes={VEICULOS} valor={f.veiculos} onChange={(v) => mudar({ veiculos: v, segurados: null, segurados_qtd: '' })} />
          {f.veiculos === '4+' && (<>
            <label className="rot" htmlFor="veiculos_qtd">Quantos? (opcional)</label>
            <input id="veiculos_qtd" type="number" inputMode="numeric" min="4" value={f.veiculos_qtd} onChange={(e) => mudar({ veiculos_qtd: e.target.value, segurados: null })} />
          </>)}
          {nV === 0 && <p className="dica perigo">🚩 Fora do perfil (sem veículos). Fica registrada, sem retorno.</p>}

          {nV > 0 && (<>
            <label className="rot">Quantos estão segurados?</label>
            <Escolha rotulo="Segurados" opcoes={opcSeg} valor={f.segurados} onChange={set('segurados')} />
            {f.segurados === '4+' && nV > 4 && (<>
              <label className="rot" htmlFor="segurados_qtd">Quantos? (opcional, até {nV})</label>
              <input id="segurados_qtd" type="number" inputMode="numeric" min="4" max={nV} value={f.segurados_qtd} onChange={(e) => set('segurados_qtd')(e.target.value)} />
            </>)}
          </>)}

          {a.semSeguro > 0 && (
            <div className="passo">
              <label className="rot">Por que ainda não protegeu{a.comSeguro > 0 ? ` os ${a.semSeguro} sem seguro` : ''}?</label>
              <Escolha rotulo="Motivo sem seguro" opcoes={MOTIVOS_SEM_SEGURO.map((m) => ({ valor: m, rotulo: m }))} valor={f.motivo_sem_seguro} onChange={set('motivo_sem_seguro')} chips />
              {f.motivo_sem_seguro === 'Outro' && (
                <input type="text" aria-label="Qual o motivo?" placeholder="Qual?" value={f.motivo_outro} onChange={(e) => set('motivo_outro')(e.target.value)} style={{ marginTop: 8 }} />
              )}
              {f.motivo_sem_seguro && !editar && (<>
                <label className="rot">Agendou reunião?</label>
                <Escolha rotulo="Agendou reunião" opcoes={SIM_NAO} valor={f.agendou_reuniao} onChange={set('agendou_reuniao')} duas />
                {f.agendou_reuniao === true && (
                  <CampoData id="data-reuniao" rotulo="Data e hora da reunião" tipo="reuniao" data={f.data} hora={f.hora} onData={set('data')} onHora={set('hora')} />
                )}
                {f.agendou_reuniao === false && <p className="meta">Sem reunião: a empresa fica como “perdida” (dá para reativar na lista).</p>}
              </>)}
            </div>
          )}

          {a.comSeguro > 0 && (
            <div className="passo">
              <label className="rot" htmlFor="seguradora">Seguradora{a.semSeguro > 0 ? ' (dos segurados)' : ''}</label>
              <input id="seguradora" type="text" list="lista-seguradoras" value={f.seguradora} onChange={(e) => set('seguradora')(e.target.value)} autoComplete="off" />
              <datalist id="lista-seguradoras">{seguradoras.map((s) => <option key={s} value={s} />)}</datalist>
              <label className="rot" htmlFor="vencimento">Vencimento do seguro (mês/ano)</label>
              <input id="vencimento" type="month" value={f.vencimento} onChange={(e) => set('vencimento')(e.target.value)} />
              <label className="rot">Nota do seguro atual <span className="meta">(0 = não recomendo · 5 = recomendo)</span></label>
              <Escolha rotulo="Nota do seguro" opcoes={NOTAS} valor={f.nota} onChange={set('nota')} />
              {f.nota != null && !editar && (a.semSeguro === 0
                ? <p className={`dica${f.nota >= NOTA_SATISFEITO ? ' perigo' : ''}`}>{f.nota >= NOTA_SATISFEITO ? '🚩 Satisfeito com o seguro. ' : ''}
                  {f.vencimento ? `Volta para a agenda em 01/${f.vencimento.slice(5, 7)}/${f.vencimento.slice(0, 4)}.` : 'Sem vencimento informado: fica sem retorno.'}</p>
                : (
                  <label className="check">
                    <input type="checkbox" checked={f.criar_lead_segurados} onChange={(e) => set('criar_lead_segurados')(e.target.checked)} />
                    Criar lead para os {a.comSeguro} segurados (retorno no vencimento)
                  </label>
                ))}
            </div>
          )}
        </div>
      )}

      <label className="rot" htmlFor="observacao">Observação</label>
      <CampoObservacao valor={f.observacao} onChange={set('observacao')} />

      <div className="salvar-fixo">
        {falta.length > 0 && <p className="falta" data-testid="falta">Falta: {falta.join(' · ')}</p>}
        <button className="btn" disabled={falta.length > 0 || ocupado}>{ocupado ? 'Salvando…' : textoBotao}</button>
      </div>
    </form>
  );
}
