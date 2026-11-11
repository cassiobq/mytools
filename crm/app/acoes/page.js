'use client';
// Ações de vendas: criar uma nova (finaliza a anterior) e o histórico, com data, duração e resultados.
import { useRouter } from 'next/navigation';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import NovaAcao from '../NovaAcao.js';
import { acaoAtiva, nomeDaAcao, resumoAcao, textoPeriodoAcao } from '../../lib/acoes.js';

export default function Acoes() {
  const { acoes, leads, contatos, gravarOps } = useApp();
  const router = useRouter();
  const [aviso, mostrar] = useAviso();
  const ativa = acaoAtiva(acoes);
  const lista = [...acoes].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
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
  return (
    <main>
      <h1>Ações de vendas</h1>
      <NovaAcao gravar={gravar} onCriada={() => router.push('/')} />
      <h2>Histórico</h2>
      {!lista.length && <p className="vazio">Nenhuma ação ainda.</p>}
      {lista.map((a) => {
        const r = resumoAcao(a, leads, contatos);
        return (
          <article key={a.id} className="card" data-testid="acao">
            <div>{a.id === ativa?.id ? <span className="tag etapa">Ativa</span> : <span className="tag arq">Finalizada</span>}</div>
            <div className="titulo">📍 {nomeDaAcao(a)}</div>
            <div className="meta">{textoPeriodoAcao(r, a)}</div>
            <div className="meta">{r.registros} registro{r.registros === 1 ? '' : 's'} · {r.mql} MQL · {r.sql} SQL · {r.associados} associado{r.associados === 1 ? '' : 's'}</div>
          </article>
        );
      })}
      {aviso}
    </main>
  );
}
