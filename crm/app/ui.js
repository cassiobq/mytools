'use client';
// Componentes compartilhados: botões de escolha, ditado por voz, aviso de gravação, login, topo e navegação.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppProvider.js';
import { estaNaAgenda } from '../lib/etapas.js';

// Grupo de botões grandes; clicar de novo no escolhido desmarca (quando permitido).
export function Escolha({ opcoes, valor, onChange, duas = false, chips = false, rotulo, desmarcavel = true }) {
  return (
    <div className={chips ? 'chips' : `opcoes${duas ? ' duas' : ''}`} role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={String(o.valor)} type="button" className="opcao" aria-pressed={valor === o.valor}
          onClick={() => onChange(valor === o.valor && desmarcavel ? null : o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

// Observação com ditado por voz (Web Speech API; no iPhone, o microfone do teclado também funciona).
export function CampoObservacao({ valor, onChange, id = 'observacao' }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [suporta, setSuporta] = useState(false);
  const rec = useRef(null);
  useEffect(() => { setSuporta(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const alternar = () => {
    if (ouvindo) { rec.current?.stop(); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = 'pt-BR';
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const novo = Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(' ').trim();
      if (novo) onChange((atual) => (atual ? `${atual.trim()} ${novo}` : novo));
    };
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    rec.current = r;
    r.start();
    setOuvindo(true);
  };
  return (
    <div className="linha">
      <textarea id={id} value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Toque no microfone para ditar" />
      {suporta && (
        <button type="button" className={`btn-voz${ouvindo ? ' ouvindo' : ''}`} onClick={alternar}
          aria-label={ouvindo ? 'Parar ditado' : 'Ditar observação'}>{ouvindo ? '■' : '🎤'}</button>
      )}
    </div>
  );
}

// Aviso de resultado da gravação: "Salvo" só quando o banco confirmou.
export function useAviso() {
  const [aviso, setAviso] = useState(null);
  const t = useRef();
  const mostrar = (status, texto) => {
    clearTimeout(t.current);
    setAviso({ status, texto });
    t.current = setTimeout(() => setAviso(null), status === 'salvo' ? 2500 : 5000);
  };
  const el = aviso && (
    <div className={`toast ${aviso.status === 'salvo' ? 'ok' : aviso.status === 'pendente' ? 'pend' : 'erro'}`} role="status" aria-live="polite">
      {aviso.texto}
    </div>
  );
  return [el, mostrar];
}

// oQue: "Visita" / "Contato"...; feminino ajusta a concordância ("Visita salva", "Contato salvo").
export const textoDoStatus = (status, oQue = 'Registro', feminino = false) => (status === 'salvo'
  ? `✓ ${oQue} ${feminino ? 'salva' : 'salvo'} no banco`
  : `⏳ ${oQue} pendente: sem conexão. Vai ser enviado sozinho quando o sinal voltar.`);

function Login() {
  const { sb } = useApp();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setErro(''); setOcupado(true);
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setOcupado(false);
    if (error) setErro(error.message); else setEnviado(true);
  };
  const confirmar = async (e) => {
    e.preventDefault();
    setErro(''); setOcupado(true);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'email' });
    setOcupado(false);
    if (error) setErro('Código inválido ou expirado.');
  };
  return (
    <main>
      <h1>Micro CRM</h1>
      {!enviado ? (
        <form onSubmit={enviar}>
          <label className="rot" htmlFor="email">Seu e-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="meta">Você recebe um link (e um código) para entrar. Não precisa de senha.</p>
          <button className="btn" disabled={ocupado}>Enviar link de acesso</button>
        </form>
      ) : (
        <form onSubmit={confirmar}>
          <p>Enviamos um e-mail para <strong>{email}</strong>. Toque no link ou digite o código abaixo
            (no app instalado no iPhone, use o código).</p>
          <label className="rot" htmlFor="codigo">Código do e-mail</label>
          <input id="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button className="btn" disabled={ocupado || codigo.trim().length < 6} style={{ marginTop: 12 }}>Entrar</button>
          <button type="button" className="btn sec" style={{ marginTop: 8 }} onClick={() => setEnviado(false)}>Trocar e-mail</button>
        </form>
      )}
      {erro && <p className="erro-txt">{erro}</p>}
    </main>
  );
}

// Topo: menu ☰ (com o nº de retornos de hoje), contador e situação da sincronização.
function Topo() {
  const { leads, pendentes, online, erroSync, sincronizarAgora } = useApp();
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  useEffect(() => { setAberto(false); }, [caminho]);
  const n = leads.filter((l) => !l.arquivado && !l.lead_pai_id).length;
  const nHoje = leads.filter((l) => estaNaAgenda(l)).length;
  const pend = pendentes.size; // empresas com algo na fila (uma visita = lead + contatos = 1 pendente)
  let cls = 'ok';
  let txt = online ? 'Sincronizado' : 'Sem sinal';
  if (pend) { cls = 'pend'; txt = `${pend} pendente${pend > 1 ? 's' : ''}`; }
  if (erroSync && online && pend) { cls = 'erro'; txt = 'Erro ao enviar'; }
  const itens = [
    { href: '/', ico: '＋', rot: 'Registrar visita' },
    { href: '/hoje/', ico: '☑', rot: 'Hoje', badge: nHoje },
    { href: '/painel/', ico: '◔', rot: 'Painel' },
    { href: '/lista/', ico: '☰', rot: 'Empresas' },
    { href: '/config/', ico: '⚙', rot: 'Metas e configurações' },
  ];
  const ativo = (h) => caminho === h || `${caminho}/` === h;
  return (
    <>
      <header className="topo">
        <button type="button" className="menu-btn" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
          ☰{nHoje ? <span className="badge" data-testid="badge-hoje">{nHoje}</span> : null}
        </button>
        <span className="contador" data-testid="contador">{n} {n === 1 ? 'empresa registrada' : 'empresas registradas'}</span>
        <button type="button" className={`status ${cls}`} onClick={() => sincronizarAgora()} title={erroSync || 'Tocar para sincronizar'}>{txt}</button>
      </header>
      {aberto && (
        <div className="menu-fundo" onClick={() => setAberto(false)}>
          <nav className="menu" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            {itens.map((i) => (
              <Link key={i.href} href={i.href} className={ativo(i.href) ? 'ativo' : ''} onClick={() => setAberto(false)}>
                <span className="ico" aria-hidden="true">{i.ico}</span>{i.rot}
                {i.badge ? <span className="badge">{i.badge}</span> : null}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

export function Shell({ children }) {
  const { sessao } = useApp();
  if (sessao === undefined) return <main className="vazio">Carregando…</main>;
  if (!sessao) return <Login />;
  return (<><Topo />{children}</>);
}
