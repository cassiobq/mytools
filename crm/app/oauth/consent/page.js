'use client';
// Autorizar o Claude (OAuth do Supabase Auth): o app do Claude pede acesso ao Micro CRM; aqui o usuário,
// já logado (o Shell mostra o login por código antes), confirma ou recusa. Depois volta para o Claude.
import { useEffect, useState } from 'react';
import { useApp } from '../../AppProvider.js';

export default function Autorizar() {
  const { sb, sessao } = useApp();
  const [id, setId] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('authorization_id')); }, []);
  useEffect(() => {
    if (!id || !sessao) return;
    sb.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (error) { setErro(`Não foi possível abrir o pedido: ${error.message}`); return; }
      if (data?.redirect_url) { window.location.assign(data.redirect_url); return; } // já autorizado antes
      setPedido(data);
    });
  }, [id, sessao, sb]);

  const decidir = async (aprovar) => {
    setOcupado(true); setErro('');
    const f = aprovar ? sb.auth.oauth.approveAuthorization : sb.auth.oauth.denyAuthorization;
    const { data, error } = await f.call(sb.auth.oauth, id, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) { setOcupado(false); setErro(`Não deu certo: ${error?.message || 'sem resposta'}. Tente de novo pelo Claude.`); return; }
    window.location.assign(data.redirect_url);
  };

  if (id === null) return <main className="vazio">Carregando…</main>;
  if (!id) return <main><h1>Autorizar acesso</h1><p className="dica perigo">Pedido sem identificação. Comece de novo pelo app do Claude.</p></main>;
  return (
    <main>
      <h1>Autorizar acesso</h1>
      {erro && <p className="dica perigo" role="alert">{erro}</p>}
      {!pedido && !erro && <p className="vazio">Carregando o pedido…</p>}
      {pedido && (
        <div className="card">
          <p><strong>{pedido.client?.name || 'Um aplicativo'}</strong> quer acessar o seu Micro CRM
            {pedido.user?.email ? <> ({pedido.user.email})</> : null}.</p>
          <p className="meta">Ele vai poder ler e registrar visitas, contatos e a agenda dos seus leads, como você faz no app.
            Nada é apagado. Você pode tirar o acesso quando quiser.</p>
          <button className="btn" disabled={ocupado} onClick={() => decidir(true)} style={{ marginTop: 12 }}>Autorizar</button>
          <button className="btn sec" disabled={ocupado} onClick={() => decidir(false)} style={{ marginTop: 8 }}>Recusar</button>
        </div>
      )}
    </main>
  );
}
