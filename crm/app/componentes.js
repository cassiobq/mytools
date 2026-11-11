'use client';
// Cartão de empresa e janela de diálogo, usados em Hoje e Empresas.
import { useEffect } from 'react';
import { rotuloEtapa, TIPOS_PROXIMO, estaNaAgenda } from '../lib/etapas.js';
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

// Link de WhatsApp (assume Brasil se vier sem o 55).
export function linkWhats(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith('55') && d.length > 11 ? d : `55${d}`}`;
}

export function CardLead({ lead, pendente, esfriando = null, tentativas = 0, children }) {
  const hoje = hojeISO();
  const atrasado = estaNaAgenda(lead, hoje) && lead.data_proximo_passo < hoje;
  const dias = atrasado ? Math.round((new Date(hoje) - new Date(lead.data_proximo_passo)) / 86400000) : 0;
  const veic = lead.n_veiculos != null ? `${lead.n_veiculos}${lead.veiculos_mais ? '+' : ''} veíc.${lead.n_segurados != null ? ` (${lead.n_segurados} seg.)` : ''}` : null;
  const detalhes = [lead.cidade, veic, lead.seguradora ? `${lead.seguradora}${lead.nota_seguro != null ? ` · nota ${lead.nota_seguro}` : ''}` : null].filter(Boolean).join(' · ');
  const wa = linkWhats(lead.decisor_whatsapp);
  const hora = lead.hora_proximo_passo ? ` às ${lead.hora_proximo_passo.slice(0, 5).replace(':', 'h')}` : '';
  return (
    <article className={`card${atrasado ? ' atrasado' : ''}`}>
      <div>
        <span className="tag etapa">{rotuloEtapa(lead.etapa)}</span>
        {lead.bandeira && <span className="tag bandeira">🚩 {lead.motivo_bandeira || 'Fora do perfil'}</span>}
        {lead.lead_pai_id && <span className="tag filho">Segurados</span>}
        {atrasado && <span className="tag atraso">Atrasado {dias} {dias === 1 ? 'dia' : 'dias'}</span>}
        {esfriando && <span className="tag esfria">Esfriando · {esfriando} dias sem contato</span>}
        {tentativas >= 3 && <span className="tag atraso">{tentativas} tentativas sem decisor</span>}
        {pendente && <span className="tag pend">Pendente</span>}
        {lead.arquivado && <span className="tag arq">Arquivada</span>}
      </div>
      <div className="titulo">{lead.empresa}</div>
      {detalhes && <div className="meta">{detalhes}</div>}
      {lead.decisor_nome && (
        <div className="meta">Decisor: {lead.decisor_nome}{wa ? <> · <a className="wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a></> : lead.decisor_whatsapp ? ` · ${lead.decisor_whatsapp}` : ''}</div>
      )}
      {lead.data_proximo_passo && (
        <div style={{ marginTop: 6 }}>➜ {TIPOS_PROXIMO[lead.proximo_tipo] || lead.proximo_passo || 'Retorno'} · {formatarData(lead.data_proximo_passo)}{hora}</div>
      )}
      {lead.observacao && <div className="meta" style={{ marginTop: 4 }}>“{lead.observacao}”</div>}
      {children}
    </article>
  );
}
