'use client';
// Estado do app: sessão, leads, contatos e fila. Toda gravação passa por "gravarOps": entra na fila do
// aparelho, é enviada ao Supabase e só então é dada como salva. Sem sinal, fica pendente e é reenviada sozinha.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import * as local from '../lib/local.js';
import { sincronizar } from '../lib/sincronizar.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const SEM_USER = (linha) => { const { user_id, ...resto } = linha; return resto; };

async function buscarTudo(sb, tabela, ordem) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('*').order(ordem).range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

export default function AppProvider({ children }) {
  const sb = useMemo(() => supabase(), []);
  const [sessao, setSessao] = useState(undefined); // undefined = ainda verificando
  const [leads, setLeads] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [config, setConfig] = useState(null);
  const [acoes, setAcoes] = useState([]);
  const [fila, setFila] = useState([]);
  const [online, setOnline] = useState(true);
  const [erroSync, setErroSync] = useState(null);
  const montado = useRef(false);

  // Junta o que veio do banco (ou da cópia local) com o que ainda está na fila.
  const aplicar = useCallback((base, filaAtual) => {
    const porId = new Map(base.leads.map((l) => [l.id, l]));
    const cts = new Map(base.contatos.map((c) => [c.id, c]));
    let cfg = base.config?.[0] || null;
    const acs = new Map((base.acoes || []).map((a) => [a.id, a]));
    for (const op of filaAtual) {
      if (op.tabela === 'leads') porId.set(op.linha.id, { ...(porId.get(op.linha.id) || {}), ...op.linha });
      else if (op.tabela === 'config') cfg = { ...(cfg || {}), ...op.linha };
      else if (op.tabela === 'acoes') acs.set(op.linha.id, { ...(acs.get(op.linha.id) || {}), ...op.linha });
      else cts.set(op.linha.id, op.linha);
    }
    setConfig(cfg);
    setAcoes([...acs.values()]);
    setLeads([...porId.values()].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))));
    setContatos([...cts.values()]);
    setFila(filaAtual);
  }, []);

  const recarregarLocal = useCallback(async () => {
    const [l, c, cfg, ac, f] = await Promise.all([local.todos('leads'), local.todos('contatos'), local.todos('config'), local.todos('acoes'), local.todos('fila')]);
    aplicar({ leads: l, contatos: c, config: cfg, acoes: ac }, f.sort((a, b) => a.seq - b.seq));
  }, [aplicar]);

  // Envia a fila e, se deu tudo certo, baixa a versão do banco.
  const sincronizarAgora = useCallback(async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      await recarregarLocal();
      return { enviados: 0, restantes: null, erro: null };
    }
    const r = await sincronizar(sb);
    setErroSync(r.erro);
    if (!r.erro) {
      try {
        const [l, c, cfg, ac] = await Promise.all([buscarTudo(sb, 'leads', 'criado_em'), buscarTudo(sb, 'contatos', 'data'),
          buscarTudo(sb, 'config', 'id'), buscarTudo(sb, 'acoes', 'criado_em')]);
        await local.substituir('leads', l);
        await local.substituir('contatos', c);
        await local.substituir('config', cfg);
        await local.substituir('acoes', ac);
      } catch (e) {
        setErroSync(String(e.message || e));
      }
    }
    await recarregarLocal();
    return r;
  }, [sb, recarregarLocal]);

  // Gravação: fila local -> Supabase. Devolve 'salvo' só se estas operações chegaram ao banco.
  const gravarOps = useCallback(async (ops) => {
    const limpas = ops.map((op) => ({ tabela: op.tabela, linha: SEM_USER(op.linha) }));
    const seqs = await local.enfileirar(limpas);
    // Mostra já (como pendente) para não "sumir" da tela enquanto envia.
    await recarregarLocal();
    await sincronizarAgora();
    const aindaNaFila = new Set((await local.todos('fila')).map((o) => o.seq));
    return seqs.some((s) => aindaNaFila.has(s)) ? 'pendente' : 'salvo';
  }, [recarregarLocal, sincronizarAgora]);

  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    setOnline(navigator.onLine);
    sb.auth.getSession().then(({ data }) => setSessao(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => setSessao(s ?? null));
    recarregarLocal();
    const aoVoltar = () => { setOnline(true); sincronizarAgora(); };
    const aoCair = () => setOnline(false);
    const aoMostrar = () => { if (document.visibilityState === 'visible') sincronizarAgora(); };
    window.addEventListener('online', aoVoltar);
    window.addEventListener('offline', aoCair);
    document.addEventListener('visibilitychange', aoMostrar);
    const timer = setInterval(() => { if (navigator.onLine) sincronizarAgora(); }, 30000);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('offline', aoCair);
      document.removeEventListener('visibilitychange', aoMostrar);
      clearInterval(timer);
    };
  }, [sb, recarregarLocal, sincronizarAgora]);

  // Ao entrar (ou reabrir com sessão), sincroniza.
  useEffect(() => { if (sessao) sincronizarAgora(); }, [sessao?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empresas com algo na fila (uma visita = lead + contatos = 1 pendente). Configurações não contam.
  const pendentes = useMemo(() => new Set(fila.filter((op) => op.tabela === 'leads' || op.tabela === 'contatos')
    .map((op) => (op.tabela === 'leads' ? op.linha.id : op.linha.lead_id))), [fila]);

  const valor = {
    sb, sessao, leads, contatos, config, acoes, fila, pendentes, online, erroSync,
    gravarOps, sincronizarAgora,
    sair: async () => { await sb.auth.signOut(); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
