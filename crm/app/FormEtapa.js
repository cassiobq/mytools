'use client';
// Follow-up de quem já está em MQL, SQL ou Venda: o que aconteceu, veículos, próximo passo ou motivo da perda.
import { useState } from 'react';
import { Escolha, CampoObservacao } from './ui.js';
import CampoData from './CampoData.js';
import { ACOES, MOTIVOS_PERDA, faltaNoFollowup, rotuloEtapa } from '../lib/etapas.js';

export default function FormEtapa({ lead, onSalvar }) {
  const [c, setC] = useState({ acao: null, veiculos: '', data: '', hora: '', motivo: null, motivo_outro: '', observacao: '' });
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (v) => setC((a) => ({ ...a, [k]: typeof v === 'function' ? v(a[k]) : v }));
  const acoes = ACOES[lead.etapa] || [];
  const acao = acoes.find((x) => x.valor === c.acao);
  const falta = faltaNoFollowup(lead.etapa, c);

  const salvar = async (e) => {
    e.preventDefault();
    if (falta.length || ocupado) return;
    setOcupado(true);
    try { await onSalvar(c); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={salvar} noValidate>
      <p className="meta">Etapa atual: <strong>{rotuloEtapa(lead.etapa)}</strong>{lead.decisor_nome ? ` · ${lead.decisor_nome}` : ''}</p>
      <label className="rot">O que aconteceu?</label>
      <Escolha rotulo="O que aconteceu" opcoes={acoes.map((x) => ({ valor: x.valor, rotulo: x.rotulo }))} valor={c.acao}
        onChange={(v) => setC((a) => ({ ...a, acao: v, motivo: null }))} />

      {acao?.veiculos && (<>
        <label className="rot" htmlFor="veiculos-acao">{acao.veiculos}</label>
        <input id="veiculos-acao" type="number" inputMode="numeric" min="1" value={c.veiculos} onChange={(e) => set('veiculos')(e.target.value)} />
      </>)}
      {acao?.proxima && (
        <CampoData id="data-acao" tipo={acao.proxima} excetoId={lead.id}
          rotulo={acao.proxima === 'reuniao' ? 'Nova data e hora da reunião' : acao.proxima === 'contrato' ? 'Cobrar assinatura em' : 'Próximo retorno'}
          data={c.data} hora={c.hora} onData={set('data')} onHora={set('hora')} />
      )}
      {acao?.motivo && (<>
        <label className="rot">Motivo</label>
        <Escolha rotulo="Motivo da perda" opcoes={(MOTIVOS_PERDA[lead.etapa] || ['Outro']).map((m) => ({ valor: m, rotulo: m }))} valor={c.motivo} onChange={set('motivo')} chips />
        {c.motivo === 'Outro' && <input type="text" aria-label="Qual o motivo?" placeholder="Qual?" value={c.motivo_outro} onChange={(e) => set('motivo_outro')(e.target.value)} style={{ marginTop: 8 }} />}
      </>)}

      <label className="rot" htmlFor="obs-contato">Observação</label>
      <CampoObservacao id="obs-contato" valor={c.observacao} onChange={set('observacao')} />
      {falta.length > 0 && <p className="falta">Falta: {falta.join(' · ')}</p>}
      <button className="btn" style={{ marginTop: 10 }} disabled={falta.length > 0 || ocupado}>{ocupado ? 'Salvando…' : 'Salvar contato'}</button>
    </form>
  );
}
