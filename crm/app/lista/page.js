'use client';
// Todas as empresas: busca, filtros (etapa, bandeira, nº de veículos), contato, edição, histórico,
// reativar, arquivar/desarquivar, exportação XLSX e relatório.
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import { CardLead, Dialogo } from '../componentes.js';
import Pesquisa from '../Pesquisa.js';
import RegistrarContato, { podeRegistrarContato } from '../RegistrarContato.js';
import { pesquisaDoLead, opsEditarLead } from '../../lib/pesquisa.js';
import { opsArquivar, opsReativar, EVENTOS, rotuloEtapa } from '../../lib/etapas.js';
import { gerarXLSX } from '../../lib/xlsx.js';
import { hojeISO } from '../../lib/datas.js';
import Relatorio, { baixarArquivo } from './Relatorio.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const FILTROS = [
  { valor: 'ativas', rotulo: 'Ativas' },
  { valor: 'negociando', rotulo: 'MQL · SQL · Venda' },
  { valor: 'associados', rotulo: 'Associados' },
  { valor: 'bandeira', rotulo: '🚩 Fora do perfil' },
  { valor: 'perdidas', rotulo: 'Perdidas' },
  { valor: 'arquivadas', rotulo: 'Arquivadas' },
  { valor: 'todas', rotulo: 'Todas' },
];
const VEICULOS = [{ valor: null, rotulo: 'Qualquer frota' }, { valor: 1, rotulo: '1' }, { valor: 2, rotulo: '2' }, { valor: 3, rotulo: '3' }, { valor: 4, rotulo: '4+' }];
const passaFiltro = (l, f) => {
  if (f === 'todas') return true;
  if (f === 'arquivadas') return l.arquivado;
  if (l.arquivado) return false;
  if (f === 'ativas') return !l.bandeira && l.etapa !== 'perdido';
  if (f === 'negociando') return ['mql', 'sql', 'venda'].includes(l.etapa);
  if (f === 'associados') return l.etapa === 'associado';
  if (f === 'bandeira') return l.bandeira;
  if (f === 'perdidas') return l.etapa === 'perdido';
  return true;
};

export default function Empresas() {
  const { leads, contatos, pendentes, gravarOps } = useApp();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('ativas');
  const [veic, setVeic] = useState(null);
  const [editando, setEditando] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [contato, setContato] = useState(null);
  const [relatorio, setRelatorio] = useState(false);
  const [aviso, mostrar] = useAviso();

  const filtrados = useMemo(() => {
    const q = norm(busca);
    return leads.filter((l) => passaFiltro(l, filtro)
      && (veic == null || (veic === 4 ? l.n_veiculos >= 4 : l.n_veiculos === veic))
      && (!q || norm(`${l.empresa} ${l.cidade} ${l.decisor_nome} ${l.seguradora} ${l.indicado_por} ${l.observacao}`).includes(q)));
  }, [leads, busca, filtro, veic]);

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
  const exportar = async () => {
    const nomes = { bandeira: '-fora-do-perfil', perdidas: '-perdidas' };
    baixarArquivo(`crm${nomes[filtro] || ''}-${hojeISO()}.xlsx`, new Blob([await gerarXLSX(filtrados, contatos)], { type: XLSX_MIME }));
  };

  return (
    <main>
      <h1>Empresas</h1>
      <input type="search" placeholder="Buscar por empresa, cidade, decisor, seguradora…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
      <div className="chips" role="group" aria-label="Filtro" style={{ margin: '10px 0 6px' }}>
        {FILTROS.map((f) => <button key={f.valor} type="button" className="opcao" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>{f.rotulo}</button>)}
      </div>
      <div className="chips" role="group" aria-label="Veículos" style={{ marginBottom: 10 }}>
        {VEICULOS.map((v) => <button key={String(v.valor)} type="button" className="opcao" aria-pressed={veic === v.valor} onClick={() => setVeic(v.valor)}>{v.rotulo}</button>)}
      </div>
      <div className="acoes" style={{ marginBottom: 14 }}>
        <button type="button" className="btn sec" onClick={exportar}>Exportar XLSX</button>
        <button type="button" className="btn sec" onClick={() => setRelatorio(true)}>Gerar relatório</button>
      </div>
      <p className="meta">{filtrados.length} de {leads.length} empresa{leads.length === 1 ? '' : 's'} · a exportação leva só as filtradas</p>
      {!filtrados.length && <p className="vazio">Nenhuma empresa encontrada.</p>}
      {filtrados.map((l) => (
        <CardLead key={l.id} lead={l} pendente={pendentes.has(l.id)}>
          <div className="acoes">
            {podeRegistrarContato(l) && <button type="button" className="btn" onClick={() => setContato(l)}>Registrar contato</button>}
            {(l.bandeira || l.etapa === 'perdido') && !l.arquivado && (
              <button type="button" className="btn" onClick={() => {
                if (confirm(`Reativar a abordagem de ${l.empresa}? Ela volta para Lead, com retorno hoje.`)) gravar(opsReativar(l), 'Reativação', true);
              }}>Reativar abordagem</button>
            )}
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
      {relatorio && <Relatorio onFechar={() => setRelatorio(false)} />}
      {contato && <RegistrarContato lead={contato} onFechar={() => setContato(null)} gravar={gravar} />}
      {editando && (
        <Dialogo titulo="Editar empresa" onFechar={() => setEditando(null)}>
          <p className="meta">Corrige os dados da empresa. A etapa e a agenda mudam por “Registrar contato”.</p>
          <Pesquisa modo="editar" inicial={pesquisaDoLead(editando)} textoBotao="Salvar alterações"
            onSalvar={async (f) => { const ok = await gravar(opsEditarLead(editando, f), 'Alteração', true); if (ok) setEditando(null); return ok; }} />
        </Dialogo>
      )}
      {historico && (
        <Dialogo titulo={historico.empresa} onFechar={() => setHistorico(null)}>
          <p className="meta">Etapa atual: {rotuloEtapa(historico.etapa)}</p>
          {contatosDe(historico.id).map((c) => (
            <div key={c.id} className="card">
              <div className="titulo">{new Date(c.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              <div className="meta">{EVENTOS[c.evento] || 'Contato'}{c.veiculos ? ` · ${c.veiculos} veículo${c.veiculos === 1 ? '' : 's'}` : ''}
                {c.decisor === false ? ' · sem o decisor' : ''}{c.motivo ? ` · ${c.motivo}` : ''}</div>
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
