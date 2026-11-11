'use client';
// Depois de salvar um compromisso com hora: botão para levar ao Google Agenda do celular (um toque para confirmar).
import { linkAgenda } from '../lib/agenda.js';

export default function AvisoAgenda({ compromisso, onFechar }) {
  if (!compromisso) return null;
  const quando = compromisso.inicio.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="card aviso-agenda" role="status" data-testid="aviso-agenda">
      <div className="titulo">📅 {compromisso.titulo}</div>
      <div className="meta">{quando}</div>
      <div className="acoes">
        <a className="btn" href={linkAgenda(compromisso)} target="_blank" rel="noreferrer" onClick={() => setTimeout(onFechar, 500)} style={{ textAlign: 'center', textDecoration: 'none' }}>
          Adicionar à agenda
        </a>
        <button type="button" className="btn sec" onClick={onFechar}>Agora não</button>
      </div>
    </div>
  );
}
