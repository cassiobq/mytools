'use client';
// Registrar um retorno de uma empresa: resultado, situação, nova data sugerida e observação.
import { useState } from 'react';
import { Escolha, CampoObservacao } from './ui.js';
import { RESULTADOS, MOTIVOS } from './FormLead.js';
import { FAIXAS, sugerirProximo } from '../lib/cadencia.js';

export default function FormContato({ lead, onSalvar }) {
  const inicial = {
    resultado: null, faixa_cadencia: lead.faixa_cadencia || null, vencimento_seguro: lead.vencimento_seguro || '',
    motivo_nao: null, proximo_passo: '', data_proximo_passo: '', observacao: '',
  };
  // Nos retornos, "interessado" volta em 3 dias (o +1 é só depois da primeira visita).
  const comSugestao = (f) => {
    if (f.resultado === 'venda') return { ...f, proximo_passo: '', data_proximo_passo: '' };
    const s = sugerirProximo({ faixa: f.faixa_cadencia, resultado: f.resultado, vencimento: f.vencimento_seguro || null, primeiroRetorno: false });
    return s ? { ...f, proximo_passo: s.passo, data_proximo_passo: s.data } : f;
  };
  const [f, setF] = useState(() => comSugestao(inicial));
  const [ocupado, setOcupado] = useState(false);
  const set = (campo) => (v) => setF((a) => ({ ...a, [campo]: typeof v === 'function' ? v(a[campo]) : v }));
  const sugerir = (mud) => setF((a) => comSugestao({ ...a, ...mud }));

  const salvar = async (e) => {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    try { await onSalvar(f); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={salvar}>
      <label className="rot">Resultado</label>
      <Escolha rotulo="Resultado do contato" opcoes={RESULTADOS} valor={f.resultado} onChange={(v) => sugerir({ resultado: v })} />
      {f.resultado === 'sem_interesse' && (<>
        <label className="rot">Motivo</label>
        <Escolha rotulo="Motivo" opcoes={MOTIVOS} valor={f.motivo_nao} onChange={set('motivo_nao')} chips />
      </>)}
      <label className="rot">Situação</label>
      <Escolha rotulo="Situação do contato" opcoes={FAIXAS} valor={f.faixa_cadencia} onChange={(v) => sugerir({ faixa_cadencia: v })} />
      {f.faixa_cadencia === '2_ja_tem_seguro' && (<>
        <label className="rot" htmlFor="venc-contato">Vencimento do seguro (opcional)</label>
        <input id="venc-contato" type="date" value={f.vencimento_seguro} onChange={(e) => sugerir({ vencimento_seguro: e.target.value })} />
      </>)}
      {f.resultado !== 'venda' && (<>
        <label className="rot" htmlFor="passo-contato">Próximo passo</label>
        <div className="linha">
          <input id="passo-contato" type="text" value={f.proximo_passo} onChange={(e) => set('proximo_passo')(e.target.value)} />
          <input type="date" aria-label="Nova data" value={f.data_proximo_passo} onChange={(e) => set('data_proximo_passo')(e.target.value)} style={{ flex: '0 0 46%' }} />
        </div>
      </>)}
      <label className="rot" htmlFor="obs-contato">Observação</label>
      <CampoObservacao id="obs-contato" valor={f.observacao} onChange={set('observacao')} />
      <button className="btn" style={{ marginTop: 14 }} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar contato'}</button>
    </form>
  );
}
