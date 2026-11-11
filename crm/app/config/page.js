'use client';
// Metas mensais (a semana é ÷ 4), cadência padrão dos follow-ups e o alerta de "esfriando".
import { useEffect, useState } from 'react';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import { ETAPAS_META, ROTULO_META, UNIDADE_META, taxasDasMetas } from '../../lib/painel.js';
import { CADENCIA_PADRAO, TIPOS_PROXIMO, cadencia } from '../../lib/etapas.js';
import { agendaDe } from '../../lib/agenda.js';
import { hojeISO, somarDias } from '../../lib/datas.js';

const pct = (x) => (x == null || !isFinite(x) ? '—' : `${Math.round(x * 100)}%`);
const num = (v) => (v === '' || v == null ? null : Math.max(0, Number(v)));

export default function Configuracoes() {
  const { config, sessao, gravarOps, sair, sb } = useApp();
  const [ical, setIcal] = useState(null);
  const [teste, setTeste] = useState(null);
  const [f, setF] = useState(null);
  const [aviso, mostrar] = useAviso();
  useEffect(() => {
    if (f) return;
    const m = config?.metas || {};
    setF({
      ...Object.fromEntries(ETAPAS_META.map((k) => [k, m[k] ?? ''])),
      cadencia: cadencia(config),
      dias_esfriando: config?.dias_esfriando ?? 7,
    });
  }, [config, f]);
  const [tocouIcal, setTocouIcal] = useState(false);
  useEffect(() => { if (!tocouIcal) setIcal(config?.ical_url || ''); }, [config, tocouIcal]);
  if (!f) return null;
  const ag = agendaDe(config);

  const testarIcal = async () => {
    setTeste({ carregando: true });
    const { data, error } = await sb.functions.invoke('agenda', { body: { inicio: hojeISO(), fim: somarDias(hojeISO(), 7), url: ical.trim() } });
    if (!error) { setTeste({ ok: `Agenda lida: ${data.ocupados.length} compromisso(s) nos próximos 7 dias.` }); return; }
    let corpo = {};
    try { corpo = await error.context.json(); } catch { /* sem corpo */ }
    setTeste({ erro: corpo.erro || error.message });
  };
  const salvarIcal = async () => {
    const url = ical.trim();
    if (url && !/^https:\/\//.test(url)) { mostrar('erro', 'O link iCal precisa começar com https://'); return; }
    try {
      const status = await gravarOps([{ tabela: 'config', linha: { id: sessao.user.id, ical_url: url || null } }]);
      mostrar(status, textoDoStatus(status, 'Agenda', true));
    } catch (err) { mostrar('erro', `Não foi possível guardar: ${err.message || err}`); }
  };

  const setMeta = (k) => (e) => setF((a) => ({ ...a, [k]: e.target.value }));
  const metas = Object.fromEntries(ETAPAS_META.map((k) => [k, num(f[k])]));
  const implicitas = taxasDasMetas(metas, 3);

  const salvar = async (e) => {
    e.preventDefault();
    const linha = {
      id: sessao.user.id,
      metas: { ...metas, cadencia: Object.fromEntries(Object.entries(f.cadencia).map(([k, v]) => [k, Math.max(1, Number(v) || CADENCIA_PADRAO[k])])) },
      dias_esfriando: Math.min(90, Math.max(1, Number(f.dias_esfriando) || 7)),
    };
    try {
      const status = await gravarOps([{ tabela: 'config', linha }]);
      mostrar(status, textoDoStatus(status, 'Configuração', true));
    } catch (err) {
      mostrar('erro', `Não foi possível guardar: ${err.message || err}`);
    }
  };

  return (
    <main>
      <h1>Metas e configurações</h1>
      <form onSubmit={salvar}>
        <h2>Metas do mês</h2>
        <p className="meta">A meta da semana é a do mês ÷ 4. Topo do funil em empresas (seu esforço); do SQL em diante, em veículos.</p>
        {ETAPAS_META.map((k) => (
          <div key={k} className="linha" style={{ marginTop: 10 }}>
            <label htmlFor={`meta-${k}`} style={{ fontWeight: 600 }}>{ROTULO_META[k]}<span className="taxa">{UNIDADE_META[k]}</span></label>
            <input id={`meta-${k}`} type="number" inputMode="numeric" min="0" value={f[k]} onChange={setMeta(k)} style={{ flex: '0 0 30%' }} />
            <span className="meta" style={{ flex: '0 0 26%' }}>{num(f[k]) ? `${(num(f[k]) / 4).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/sem.` : ''}</span>
          </div>
        ))}
        <p className="meta" style={{ marginTop: 10 }}>
          Suas metas pressupõem: Lead→MQL {pct(implicitas.lead_mql)} · SQL→Venda {pct(implicitas.sql_venda)} · Venda→Associado {pct(implicitas.venda_assoc)}.
        </p>

        <h2>Cadência padrão (dias)</h2>
        <p className="meta">O atalho destacado nos campos de data. Você sempre escolhe a data.</p>
        {Object.keys(CADENCIA_PADRAO).map((k) => (
          <div key={k} className="linha" style={{ marginTop: 10 }}>
            <label htmlFor={`cad-${k}`} style={{ fontWeight: 600 }}>{TIPOS_PROXIMO[k]}</label>
            <input id={`cad-${k}`} type="number" inputMode="numeric" min="1" max="60" value={f.cadencia[k]}
              onChange={(e) => setF((a) => ({ ...a, cadencia: { ...a.cadencia, [k]: e.target.value } }))} style={{ flex: '0 0 30%' }} />
          </div>
        ))}

        <h2>Alerta de “esfriando”</h2>
        <div className="linha">
          <label htmlFor="dias-esfriando" style={{ fontWeight: 600 }}>MQL/SQL/Venda sem contato há mais de (dias)</label>
          <input id="dias-esfriando" type="number" inputMode="numeric" min="1" max="90" value={f.dias_esfriando}
            onChange={(e) => setF((a) => ({ ...a, dias_esfriando: e.target.value }))} style={{ flex: '0 0 30%' }} />
        </div>

        <button className="btn" style={{ marginTop: 18 }}>Salvar configurações</button>
      </form>
      <h2>Agenda (Google Agenda pelo iCal)</h2>
      <p className="meta">Com o link, ao marcar reunião ou retorno o app mostra só os horários livres
        ({ag.faixas.map(([a, b]) => `${a.slice(0, 2)}h–${b.slice(0, 2)}h`).join(' e ')}, seg–sex, blocos de {ag.duracao} min).</p>
      <details className="card" style={{ marginTop: 8 }}>
        <summary style={{ fontWeight: 700 }}>Como pegar o link (uma vez só)</summary>
        <ol className="meta" style={{ paddingLeft: 18 }}>
          <li>No Chrome do celular, abra <strong>calendar.google.com</strong> e, no menu ⋮, marque <strong>Versão para computador</strong>.</li>
          <li>Engrenagem ⚙ → <strong>Configurações</strong> → em “Configurações das minhas agendas”, toque na sua agenda.</li>
          <li>Em <strong>Integrar agenda</strong>, copie o <strong>Endereço secreto no formato iCal</strong> (termina em .ics).</li>
          <li>Cole abaixo, toque em <strong>Testar</strong> e depois em <strong>Salvar agenda</strong>.</li>
        </ol>
        <p className="meta">O link é secreto: quem tiver ele vê seus compromissos. Ele fica só na sua conta do CRM.
          O Google pode levar algum tempo para refletir um compromisso novo nesse link; o que você marca pelo CRM já conta na hora.</p>
      </details>
      <label className="rot" htmlFor="ical">Endereço secreto iCal</label>
      <input id="ical" type="url" inputMode="url" value={ical ?? ''} onChange={(e) => { setTocouIcal(true); setIcal(e.target.value); setTeste(null); }}
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" />
      <div className="acoes">
        <button type="button" className="btn sec" disabled={!ical?.trim() || teste?.carregando} onClick={testarIcal}>{teste?.carregando ? 'Testando…' : 'Testar'}</button>
        <button type="button" className="btn" onClick={salvarIcal}>Salvar agenda</button>
      </div>
      {teste?.ok && <p className="dica ok" role="status">{teste.ok}</p>}
      {teste?.erro && <p className="erro-txt" role="alert">{teste.erro}</p>}

      <button type="button" className="btn sec" style={{ marginTop: 28 }} onClick={() => { if (confirm('Sair deste aparelho? Para entrar de novo, vai pedir o código por e-mail.')) sair(); }}>Sair da conta</button>
      {aviso}
    </main>
  );
}
