'use client';
// "Gerar relatório": escolhe o período (De / Até), pede o texto à IA (Edge Function "relatorio") e baixa o .docx.
import { useState } from 'react';
import { useApp } from '../AppProvider.js';
import { Dialogo } from '../componentes.js';
import { hojeISO, somarDias, inicioDaSemana, formatarData } from '../../lib/datas.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const lerParticipantes = () => { try { return localStorage.getItem('crm:participantes') || ''; } catch { return ''; } };
const guardarParticipantes = (v) => { try { localStorage.setItem('crm:participantes', v); } catch { /* sem armazenamento */ } };

function atalhos() {
  const h = hojeISO();
  const seg = inicioDaSemana(h);
  const mes = `${h.slice(0, 8)}01`;
  return [
    { rot: 'Hoje', de: h, ate: h },
    { rot: 'Esta semana', de: seg, ate: h },
    { rot: 'Semana passada', de: somarDias(seg, -7), ate: somarDias(seg, -1) },
    { rot: 'Este mês', de: mes, ate: h },
  ];
}

export function baixarArquivo(nome, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lê o corpo de erro da Edge Function (o supabase-js guarda a resposta em error.context).
async function corpoDoErro(error) {
  try { return await error.context.json(); } catch { return { erro: error.message }; }
}

export default function Relatorio({ onFechar }) {
  const { sb, online } = useApp();
  const h = hojeISO();
  const [de, setDe] = useState(inicioDaSemana(h));
  const [ate, setAte] = useState(h);
  const [participantes, setParticipantes] = useState(lerParticipantes);
  const [estado, setEstado] = useState({ fase: 'pronto' }); // pronto | gerando | erro | semIA
  const valido = de && ate && de <= ate;

  const montar = async (fatos, texto) => {
    const { gerarRelatorioDOCX } = await import('../../lib/relatorio.js');
    const blob = await gerarRelatorioDOCX({ fatos, texto, participantes: participantes.trim() });
    baixarArquivo(`relatorio-prospeccao-${de}${de === ate ? '' : `-a-${ate}`}.docx`, new Blob([blob], { type: DOCX_MIME }));
    setEstado({ fase: 'pronto', ok: texto ? 'Relatório gerado.' : 'Relatório gerado sem o texto da IA.' });
  };

  const gerar = async () => {
    guardarParticipantes(participantes.trim());
    setEstado({ fase: 'gerando' });
    const { data, error } = await sb.functions.invoke('relatorio', { body: { inicio: de, fim: ate } });
    if (!error) { await montar(data.fatos, data.texto); return; }
    const corpo = await corpoDoErro(error);
    // Sem a IA (chave não configurada, recusa, limite...), ainda dá para gerar com os registros.
    if (corpo?.fatos) setEstado({ fase: 'semIA', erro: corpo.erro, fatos: corpo.fatos });
    else setEstado({ fase: 'erro', erro: corpo?.erro || 'Não foi possível gerar o relatório.' });
  };

  return (
    <Dialogo titulo="Gerar relatório" onFechar={onFechar}>
      <p className="meta">Escolha o período. O relatório conta, em texto corrido, as visitas e contatos registrados nele.</p>
      <div className="chips" role="group" aria-label="Atalhos de período" style={{ margin: '8px 0 12px' }}>
        {atalhos().map((a) => (
          <button key={a.rot} type="button" className="opcao" aria-pressed={de === a.de && ate === a.ate}
            onClick={() => { setDe(a.de); setAte(a.ate); }}>{a.rot}</button>
        ))}
      </div>
      <div className="periodo">
        <label><span className="rot">De</span>
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} aria-label="Data início" />
        </label>
        <span className="seta" aria-hidden="true">→</span>
        <label><span className="rot">Até</span>
          <input type="date" value={ate} min={de || undefined} max={h} onChange={(e) => setAte(e.target.value)} aria-label="Data fim" />
        </label>
      </div>
      {!valido && <p className="erro-txt">A data de início precisa ser antes da data de fim.</p>}
      <label className="rot" htmlFor="participantes" style={{ marginTop: 12, display: 'block' }}>Participantes</label>
      <input id="participantes" type="text" value={participantes} onChange={(e) => setParticipantes(e.target.value)} placeholder="Ex.: Cássio e Luiz Fernando" />

      {estado.fase === 'semIA' ? (
        <>
          <p className="erro-txt" role="alert">{estado.erro}</p>
          <p className="meta">Dá para gerar mesmo assim, só com os registros (sem o texto corrido da IA).</p>
          <div className="acoes">
            <button type="button" className="btn" onClick={() => montar(estado.fatos, null)}>Gerar sem IA</button>
            <button type="button" className="btn sec" onClick={gerar}>Tentar de novo</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 16, width: '100%' }} disabled={!valido || !online || estado.fase === 'gerando'} onClick={gerar}>
          {estado.fase === 'gerando' ? 'Escrevendo o relatório… (até 1 min)' : `Gerar relatório ${de === ate ? `de ${formatarData(de)}` : `${formatarData(de)} a ${formatarData(ate)}`}`}
        </button>
      )}
      {!online && <p className="meta">Sem sinal: o relatório precisa de internet.</p>}
      {estado.fase === 'erro' && <p className="erro-txt" role="alert">{estado.erro}</p>}
      {estado.ok && <p className="meta" role="status">✓ {estado.ok}</p>}
    </Dialogo>
  );
}
