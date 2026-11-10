'use client';
// Todas as empresas: busca, edição, histórico, arquivar/desarquivar e exportação CSV.
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import { CardLead, Dialogo } from '../componentes.js';
import FormLead, { formularioDoLead, rotuloDe, RESULTADOS } from '../FormLead.js';
import { opsEditar, opsArquivar } from '../../lib/acoes.js';
import { paraCSV, COLUNAS_LEADS, COLUNAS_CONTATOS } from '../../lib/csv.js';
import { hojeISO } from '../../lib/datas.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function baixar(nome, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Lista() {
  const { leads, contatos, pendentes, gravarOps } = useApp();
  const [busca, setBusca] = useState('');
  const [verArquivados, setVerArquivados] = useState(false);
  const [editando, setEditando] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [aviso, mostrar] = useAviso();

  const filtrados = useMemo(() => {
    const q = norm(busca);
    return leads.filter((l) => (verArquivados || !l.arquivado)
      && (!q || norm(`${l.empresa} ${l.cidade} ${l.indicado_por} ${l.observacao}`).includes(q)));
  }, [leads, busca, verArquivados]);

  const gravar = async (ops, oQue, feminino = false) => {
    try {
      const status = await gravarOps(ops);
      mostrar(status, textoDoStatus(status, oQue, feminino));
      return true;
    } catch (e) {
      mostrar('erro', `Não foi possível guardar: ${e.message || e}`);
      return false;
    }
  };

  const contatosDe = (id) => contatos.filter((c) => c.lead_id === id).sort((a, b) => String(b.data).localeCompare(String(a.data)));

  return (
    <main>
      <h1>Empresas</h1>
      <input type="search" placeholder="Buscar por empresa, cidade, observação…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
      <div className="linha" style={{ margin: '10px 0' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={verArquivados} onChange={(e) => setVerArquivados(e.target.checked)} style={{ width: 22, height: 22 }} />
          Mostrar arquivadas
        </label>
      </div>
      <div className="acoes" style={{ marginBottom: 14 }}>
        <button type="button" className="btn sec" onClick={() => baixar(`crm-empresas-${hojeISO()}.csv`, paraCSV(leads, COLUNAS_LEADS))}>Exportar CSV</button>
        <button type="button" className="btn sec" onClick={() => baixar(`crm-contatos-${hojeISO()}.csv`, paraCSV(contatos, COLUNAS_CONTATOS))}>CSV do histórico</button>
      </div>
      <p className="meta">{filtrados.length} de {leads.length} empresa{leads.length === 1 ? '' : 's'}</p>
      {!filtrados.length && <p className="vazio">Nenhuma empresa encontrada.</p>}
      {filtrados.map((l) => (
        <CardLead key={l.id} lead={l} pendente={pendentes.has(l.id)}>
          <div className="acoes">
            <button type="button" className="btn sec" onClick={() => setEditando(l)}>Editar</button>
            <button type="button" className="btn sec" onClick={() => setHistorico(l)}>Histórico ({contatosDe(l.id).length})</button>
            {l.arquivado
              ? <button type="button" className="btn sec" onClick={() => gravar(opsArquivar(l, false), 'Desarquivamento')}>Desarquivar</button>
              : <button type="button" className="btn perigo" onClick={() => {
                if (confirm(`Arquivar ${l.empresa}? Continua guardada e dá para desarquivar.`)) gravar(opsArquivar(l), 'Arquivamento');
              }}>Arquivar</button>}
          </div>
        </CardLead>
      ))}
      {editando && (
        <Dialogo titulo="Editar empresa" onFechar={() => setEditando(null)}>
          <FormLead modo="editar" inicial={formularioDoLead(editando)} textoBotao="Salvar alterações"
            onSalvar={async (f) => { const ok = await gravar(opsEditar(editando, f), 'Alteração', true); if (ok) setEditando(null); return ok; }} />
        </Dialogo>
      )}
      {historico && (
        <Dialogo titulo={historico.empresa} onFechar={() => setHistorico(null)}>
          {contatosDe(historico.id).map((c) => (
            <div key={c.id} className="card">
              <div className="titulo">{new Date(c.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              <div className="meta">{rotuloDe(RESULTADOS, c.resultado) || 'Sem resultado'}</div>
              {c.observacao && <div>“{c.observacao}”</div>}
            </div>
          ))}
          {!contatosDe(historico.id).length && <p className="vazio">Sem contatos registrados.</p>}
        </Dialogo>
      )}
      {aviso}
    </main>
  );
}
