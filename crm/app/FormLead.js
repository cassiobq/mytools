'use client';
// Formulário de empresa: registro de visita (tela inicial) e edição (Lista).
// Só empresa e observação são digitadas; o resto é botão. Estratégia, tipo e cidade são lembrados.
import { useEffect, useState } from 'react';
import { Escolha, CampoObservacao } from './ui.js';
import { FAIXAS, sugerirProximo } from '../lib/cadencia.js';
import { ESTRATEGIAS } from '../lib/funil.js';

export const ORIGENS = [{ valor: 'abordagem', rotulo: 'Abordagem' }, { valor: 'indicacao', rotulo: 'Indicação' }];
export const TIPOS = [{ valor: 'PF', rotulo: 'PF' }, { valor: 'frota', rotulo: 'Frota' }];
export const RESULTADOS = [
  { valor: 'sem_interesse', rotulo: 'Sem interesse' },
  { valor: 'agendou', rotulo: 'Agendou' },
  { valor: 'cotacao', rotulo: 'Cotação' },
  { valor: 'venda', rotulo: 'Venda' },
];
export const MOTIVOS = ['Preço', 'Já tem seguro', 'Não vê necessidade', 'Vai pensar', 'Outro'].map((m) => ({ valor: m, rotulo: m }));
const SIM_NAO = [{ valor: true, rotulo: 'Sim' }, { valor: false, rotulo: 'Não' }];
const VEICULOS = [1, 2, 3, 5, 10, 20, 50];

export const rotuloDe = (lista, v) => lista.find((o) => o.valor === v)?.rotulo ?? '';

const PREFS = 'crm:prefs';
export function lerPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; }
}
function guardarPrefs(f) {
  try {
    const p = lerPrefs();
    const cidades = [f.cidade, ...(p.cidades || [])].filter(Boolean).filter((c, i, a) => a.indexOf(c) === i).slice(0, 6);
    localStorage.setItem(PREFS, JSON.stringify({ estrategia: f.estrategia, tipo: f.tipo, cidade: f.cidade, cidades }));
  } catch { /* sem localStorage: só não lembra */ }
}

export function formularioVazio(prefs = {}) {
  return {
    empresa: '', origem: 'abordagem', indicado_por: '', cidade: prefs.cidade || '', n_veiculos: null,
    tipo: prefs.tipo || null, estrategia: prefs.estrategia || null, falou_decisor: null, resultado: null,
    faixa_cadencia: null, vencimento_seguro: '', proximo_passo: '', data_proximo_passo: '', motivo_nao: null, observacao: '',
  };
}

export function formularioDoLead(l) {
  return {
    ...formularioVazio(),
    ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v ?? (typeof formularioVazio()[k] === 'string' ? '' : null)])),
  };
}

export default function FormLead({ inicial, onSalvar, textoBotao = 'Salvar', modo = 'registrar' }) {
  const [f, setF] = useState(inicial);
  const [cidades, setCidades] = useState([]);
  const [outraCidade, setOutraCidade] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const set = (campo) => (v) => setF((atual) => ({ ...atual, [campo]: typeof v === 'function' ? v(atual[campo]) : v }));

  useEffect(() => { setCidades(lerPrefs().cidades || []); }, []);

  // Sugestão de próximo passo ao mudar situação, resultado ou vencimento (editável depois).
  const sugerir = (mudanca) => setF((atual) => {
    const novo = { ...atual, ...mudanca };
    const s = sugerirProximo({ faixa: novo.faixa_cadencia, resultado: novo.resultado, vencimento: novo.vencimento_seguro || null, primeiroRetorno: true });
    if (novo.resultado === 'venda') return { ...novo, proximo_passo: '', data_proximo_passo: '' };
    return s ? { ...novo, proximo_passo: s.passo, data_proximo_passo: s.data } : novo;
  });

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.empresa.trim() || ocupado) return;
    setOcupado(true);
    try {
      guardarPrefs(f);
      const ok = await onSalvar(f);
      if (ok && modo === 'registrar') {
        const p = lerPrefs();
        setCidades(p.cidades || []);
        setOutraCidade(false);
        setF(formularioVazio(p));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setOcupado(false);
    }
  };

  const venda = f.resultado === 'venda';
  const opcoesCidade = [...new Set([f.cidade, ...cidades].filter(Boolean))].map((c) => ({ valor: c, rotulo: c }));

  return (
    <form onSubmit={salvar} noValidate>
      <label className="rot" htmlFor="empresa">Empresa</label>
      <input id="empresa" type="text" value={f.empresa} onChange={(e) => set('empresa')(e.target.value)} autoComplete="off" enterKeyHint="next" required />

      <label className="rot">Origem</label>
      <Escolha rotulo="Origem" opcoes={ORIGENS} valor={f.origem} onChange={(v) => set('origem')(v || 'abordagem')} duas desmarcavel={false} />
      {f.origem === 'indicacao' && (<>
        <label className="rot" htmlFor="indicado_por">Indicado por</label>
        <input id="indicado_por" type="text" value={f.indicado_por} onChange={(e) => set('indicado_por')(e.target.value)} />
      </>)}

      <label className="rot">Cidade</label>
      {!outraCidade ? (
        <div className="chips">
          {opcoesCidade.map((o) => (
            <button key={o.valor} type="button" className="opcao" aria-pressed={f.cidade === o.valor} onClick={() => set('cidade')(o.valor)}>{o.rotulo}</button>
          ))}
          <button type="button" className="opcao" onClick={() => { setOutraCidade(true); set('cidade')(''); }}>+ Outra</button>
        </div>
      ) : (
        <input type="text" aria-label="Cidade" value={f.cidade} onChange={(e) => set('cidade')(e.target.value)} autoFocus />
      )}

      <label className="rot">Tipo</label>
      <Escolha rotulo="Tipo" opcoes={TIPOS} valor={f.tipo} onChange={set('tipo')} duas />
      {f.tipo === 'frota' && (<>
        <label className="rot">Nº de veículos</label>
        <div className="chips">
          {VEICULOS.map((n) => (
            <button key={n} type="button" className="opcao" aria-pressed={f.n_veiculos === n} onClick={() => set('n_veiculos')(f.n_veiculos === n ? null : n)}>{n === 50 ? '50+' : n}</button>
          ))}
          <button type="button" className="opcao" aria-label="Menos um veículo" onClick={() => set('n_veiculos')((v) => Math.max(0, (v || 0) - 1))}>−</button>
          <span className="opcao" aria-live="polite" style={{ display: 'grid', placeItems: 'center', minWidth: 56 }}>{f.n_veiculos ?? '—'}</span>
          <button type="button" className="opcao" aria-label="Mais um veículo" onClick={() => set('n_veiculos')((v) => (v || 0) + 1)}>+</button>
        </div>
      </>)}

      <label className="rot">Estratégia</label>
      <Escolha rotulo="Estratégia" opcoes={ESTRATEGIAS} valor={f.estrategia} onChange={set('estrategia')} />

      <label className="rot">Falou com o decisor?</label>
      <Escolha rotulo="Falou com o decisor" opcoes={SIM_NAO} valor={f.falou_decisor} onChange={set('falou_decisor')} duas />

      <label className="rot">Resultado</label>
      <Escolha rotulo="Resultado" opcoes={RESULTADOS} valor={f.resultado} onChange={(v) => sugerir({ resultado: v })} />
      {f.resultado === 'sem_interesse' && (<>
        <label className="rot">Motivo</label>
        <Escolha rotulo="Motivo" opcoes={MOTIVOS} valor={f.motivo_nao} onChange={set('motivo_nao')} chips />
      </>)}

      <label className="rot">Situação</label>
      <Escolha rotulo="Situação" opcoes={FAIXAS} valor={f.faixa_cadencia} onChange={(v) => sugerir({ faixa_cadencia: v })} />
      {f.faixa_cadencia === '2_ja_tem_seguro' && (<>
        <label className="rot" htmlFor="vencimento">Vencimento do seguro (opcional)</label>
        <input id="vencimento" type="date" value={f.vencimento_seguro} onChange={(e) => sugerir({ vencimento_seguro: e.target.value })} />
      </>)}

      {!venda && (<>
        <label className="rot" htmlFor="proximo_passo">Próximo passo</label>
        <div className="linha">
          <input id="proximo_passo" type="text" value={f.proximo_passo} onChange={(e) => set('proximo_passo')(e.target.value)} />
          <input type="date" aria-label="Data do próximo passo" value={f.data_proximo_passo} onChange={(e) => set('data_proximo_passo')(e.target.value)} style={{ flex: '0 0 46%' }} />
        </div>
      </>)}

      <label className="rot" htmlFor="observacao">Observação</label>
      <CampoObservacao valor={f.observacao} onChange={set('observacao')} />

      <div className="salvar-fixo">
        <button className="btn" disabled={!f.empresa.trim() || ocupado}>{ocupado ? 'Salvando…' : textoBotao}</button>
      </div>
    </form>
  );
}
