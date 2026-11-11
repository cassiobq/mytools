'use client';
// Criar uma ação de vendas: cidade obrigatória, rua opcional. Criar uma nova finaliza a anterior.
import { useMemo, useState } from 'react';
import { useApp } from './AppProvider.js';
import { lerPrefs } from './Pesquisa.js';
import { opsNovaAcao, acaoAtiva, nomeDaAcao } from '../lib/acoes.js';

export default function NovaAcao({ onCriada, gravar }) {
  const { acoes } = useApp();
  const [cidade, setCidade] = useState('');
  const [endereco, setEndereco] = useState('');
  const [outra, setOutra] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ativa = acaoAtiva(acoes);
  const cidades = useMemo(() => {
    const p = typeof window === 'undefined' ? {} : lerPrefs();
    const daAcoes = [...acoes].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).map((a) => a.cidade);
    return [...new Set([...daAcoes, ...(p.cidades || [])].filter(Boolean))].slice(0, 8);
  }, [acoes]);

  const criar = async (e) => {
    e.preventDefault();
    if (!cidade.trim() || ocupado) return;
    setOcupado(true);
    try {
      const ok = await gravar(opsNovaAcao({ cidade, endereco }, acoes), 'Ação', true);
      if (ok) onCriada?.();
    } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={criar} className="card" noValidate>
      <div className="titulo">Nova ação de vendas</div>
      {ativa && <p className="meta">A ação atual ({nomeDaAcao(ativa)}) será finalizada.</p>}
      <label className="rot">Cidade (obrigatória)</label>
      {!outra ? (
        <div className="chips" role="group" aria-label="Cidade da ação">
          {cidades.map((c) => <button key={c} type="button" className="opcao" aria-pressed={cidade === c} onClick={() => setCidade(cidade === c ? '' : c)}>{c}</button>)}
          <button type="button" className="opcao" onClick={() => { setOutra(true); setCidade(''); }}>+ Outra</button>
        </div>
      ) : (
        <input type="text" aria-label="Cidade da ação" value={cidade} onChange={(e) => setCidade(e.target.value)} autoFocus />
      )}
      <label className="rot" htmlFor="endereco-acao">Rua / local (opcional)</label>
      <input id="endereco-acao" type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Ex.: Av. Presidente Vargas" autoComplete="off" />
      <button className="btn" style={{ marginTop: 14 }} disabled={!cidade.trim() || ocupado}>{ocupado ? 'Criando…' : 'Criar ação'}</button>
    </form>
  );
}
