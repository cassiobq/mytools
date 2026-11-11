'use client';
// Tela inicial: registrar uma visita na ação de vendas ativa (a última criada). A cidade é a da ação.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './AppProvider.js';
import Pesquisa, { lerPrefs } from './Pesquisa.js';
import NovaAcao from './NovaAcao.js';
import AvisoAgenda from './AvisoAgenda.js';
import { useAviso, textoDoStatus } from './ui.js';
import { pesquisaVazia, opsPesquisa } from '../lib/pesquisa.js';
import { acaoAtiva, nomeDaAcao, resumoAcao, textoPeriodoAcao } from '../lib/acoes.js';
import { compromissoDosOps, agendaDe } from '../lib/agenda.js';

export default function Registrar() {
  const { gravarOps, acoes, leads, contatos, config } = useApp();
  const [inicial, setInicial] = useState(null);
  const [vez, setVez] = useState(0); // troca a "key" para limpar o formulário depois de salvar
  const [compromisso, setCompromisso] = useState(null);
  const [aviso, mostrar] = useAviso();
  useEffect(() => { setInicial(pesquisaVazia(lerPrefs())); }, []);
  if (!inicial) return null;
  const acao = acaoAtiva(acoes);

  const gravar = async (ops, oQue, feminino) => {
    try {
      const status = await gravarOps(ops);
      mostrar(status, textoDoStatus(status, oQue, feminino));
      return true;
    } catch (e) {
      mostrar('erro', `Não foi possível guardar: ${e.message || e}`);
      return false;
    }
  };
  const salvar = async (f) => {
    let ops;
    try { ops = opsPesquisa(f, { acao }); } catch (e) { mostrar('erro', e.message); return false; }
    const ok = await gravar(ops, 'Visita', true);
    if (ok) setCompromisso(compromissoDosOps(ops, agendaDe(config)));
    return ok;
  };

  if (!acao) {
    return (
      <main>
        <h1>Registrar visita</h1>
        <p className="dica">Antes de registrar, crie a ação de vendas: a cidade (e a rua) onde você vai prospectar.</p>
        <NovaAcao gravar={gravar} />
        {aviso}
      </main>
    );
  }
  const r = resumoAcao(acao, leads, contatos);
  return (
    <main>
      <div className="acao-ativa" data-testid="acao-ativa">
        <div>
          <div className="titulo">📍 {nomeDaAcao(acao)}</div>
          <div className="meta">{textoPeriodoAcao(r, acao)} · {r.registros} registro{r.registros === 1 ? '' : 's'}</div>
        </div>
        <Link href="/acoes/" className="btn sec" style={{ width: 'auto', textDecoration: 'none' }}>Nova ação</Link>
      </div>
      <h1>Registrar visita</h1>
      <AvisoAgenda compromisso={compromisso} onFechar={() => setCompromisso(null)} />
      <Pesquisa key={vez} inicial={inicial} onSalvar={salvar} aoLimpar={() => { setInicial(pesquisaVazia(lerPrefs())); setVez((v) => v + 1); }} />
      {aviso}
    </main>
  );
}
