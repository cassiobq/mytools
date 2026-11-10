'use client';
// Cartão de empresa e janela de diálogo, usados em Hoje e Lista.
import { useEffect } from 'react';
import { rotuloDe, RESULTADOS } from './FormLead.js';
import { FAIXAS } from '../lib/cadencia.js';
import { formatarData, hojeISO } from '../lib/datas.js';

export function Dialogo({ titulo, onFechar, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onFechar]);
  return (
    <div className="dialogo" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div>
        <div className="cab"><h1 style={{ margin: 0 }}>{titulo}</h1><button type="button" className="fechar" onClick={onFechar} aria-label="Fechar">×</button></div>
        {children}
      </div>
    </div>
  );
}

export function CardLead({ lead, pendente, children }) {
  const hoje = hojeISO();
  const atrasado = lead.data_proximo_passo && lead.data_proximo_passo < hoje && !lead.arquivado && lead.resultado !== 'venda';
  const dias = atrasado ? Math.round((new Date(hoje) - new Date(lead.data_proximo_passo)) / 86400000) : 0;
  const detalhes = [lead.cidade, lead.tipo === 'frota' ? `Frota${lead.n_veiculos ? ` · ${lead.n_veiculos} veíc.` : ''}` : lead.tipo,
    rotuloDe(RESULTADOS, lead.resultado), rotuloDe(FAIXAS, lead.faixa_cadencia)].filter(Boolean).join(' · ');
  return (
    <article className={`card${atrasado ? ' atrasado' : ''}`}>
      <div>
        {atrasado && <span className="tag atraso">Atrasado {dias} {dias === 1 ? 'dia' : 'dias'}</span>}
        {pendente && <span className="tag pend">Pendente</span>}
        {lead.arquivado && <span className="tag arq">Arquivado</span>}
      </div>
      <div className="titulo">{lead.empresa}</div>
      {detalhes && <div className="meta">{detalhes}</div>}
      {lead.proximo_passo && <div style={{ marginTop: 6 }}>➜ {lead.proximo_passo}{lead.data_proximo_passo ? ` · ${formatarData(lead.data_proximo_passo)}` : ''}</div>}
      {lead.observacao && <div className="meta" style={{ marginTop: 4 }}>“{lead.observacao}”</div>}
      {children}
    </article>
  );
}
