'use client';
// Agenda: retornos atrasados e de hoje (por horário) e negociações esfriando.
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import { CardLead } from '../componentes.js';
import AvisoAgenda from '../AvisoAgenda.js';
import { compromissoDosOps, agendaDe } from '../../lib/agenda.js';
import RegistrarContato from '../RegistrarContato.js';
import { estaNaAgenda, esfriando, tentativasSemDecisor, opsArquivar } from '../../lib/etapas.js';
import { hojeISO } from '../../lib/datas.js';

export default function Hoje() {
  const { leads, contatos, config, pendentes, gravarOps } = useApp();
  const [aberto, setAberto] = useState(null);
  const [aviso, mostrar] = useAviso();
  const [compromisso, setCompromisso] = useState(null);
  const hoje = hojeISO();
  const porLead = useMemo(() => {
    const m = new Map();
    for (const c of contatos) { if (!m.has(c.lead_id)) m.set(c.lead_id, []); m.get(c.lead_id).push(c); }
    return m;
  }, [contatos]);
  const lista = leads.filter((l) => estaNaAgenda(l, hoje))
    .sort((a, b) => a.data_proximo_passo.localeCompare(b.data_proximo_passo)
      || String(a.hora_proximo_passo || '99').localeCompare(String(b.hora_proximo_passo || '99')) || a.empresa.localeCompare(b.empresa));
  const atrasados = lista.filter((l) => l.data_proximo_passo < hoje).length;
  const dias = config?.dias_esfriando || 7;
  const frios = leads.map((l) => ({ l, d: esfriando(l, porLead.get(l.id) || [], dias, hoje) })).filter((x) => x.d)
    .sort((a, b) => b.d - a.d);

  const gravar = async (ops, oQue, feminino = false) => {
    try {
      const status = await gravarOps(ops);
      mostrar(status, textoDoStatus(status, oQue, feminino));
      const c = compromissoDosOps(ops, agendaDe(config));
      if (c) setCompromisso(c);
      return true;
    } catch (e) {
      mostrar('erro', `Não foi possível guardar: ${e.message || e}`);
      return false;
    }
  };

  const cartao = (l, esf = null) => (
    <CardLead key={l.id} lead={l} pendente={pendentes.has(l.id)} esfriando={esf} tentativas={tentativasSemDecisor(porLead.get(l.id) || [])}>
      <div className="acoes">
        <button type="button" className="btn" onClick={() => setAberto(l)}>Registrar contato</button>
        <button type="button" className="btn perigo" onClick={async () => {
          if (confirm(`Arquivar ${l.empresa}? Ela sai da agenda e da contagem, mas continua guardada (dá para desarquivar em Empresas).`)) {
            await gravar(opsArquivar(l), 'Arquivamento');
          }
        }}>Arquivar</button>
      </div>
    </CardLead>
  );

  return (
    <main>
      <h1>Hoje</h1>
      <p className="meta">{lista.length} retorno{lista.length === 1 ? '' : 's'}{atrasados ? ` · ${atrasados} atrasado${atrasados === 1 ? '' : 's'}` : ''}</p>
      {!lista.length && <p className="vazio">Nenhum retorno para hoje. 🎉</p>}
      {lista.map((l) => cartao(l))}
      {frios.length > 0 && (<>
        <h2>Esfriando (mais de {dias} dias sem contato)</h2>
        {frios.map(({ l, d }) => cartao(l, d))}
      </>)}
      {aberto && <RegistrarContato lead={aberto} onFechar={() => setAberto(null)} gravar={gravar} />}
      {compromisso && <div className="aviso-fixo"><AvisoAgenda compromisso={compromisso} onFechar={() => setCompromisso(null)} /></div>}
      {aviso}
    </main>
  );
}
