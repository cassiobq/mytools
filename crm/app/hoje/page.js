'use client';
// Retornos de hoje e atrasados (atrasados primeiro, em destaque).
import { useState } from 'react';
import { useApp } from '../AppProvider.js';
import { useAviso, textoDoStatus } from '../ui.js';
import { CardLead, Dialogo } from '../componentes.js';
import FormContato from '../FormContato.js';
import { opsRegistrarContato, opsArquivar } from '../../lib/acoes.js';
import { hojeISO } from '../../lib/datas.js';

export default function Hoje() {
  const { leads, pendentes, gravarOps } = useApp();
  const [aberto, setAberto] = useState(null);
  const [aviso, mostrar] = useAviso();
  const hoje = hojeISO();
  const lista = leads
    .filter((l) => !l.arquivado && l.resultado !== 'venda' && l.data_proximo_passo && l.data_proximo_passo <= hoje)
    .sort((a, b) => a.data_proximo_passo.localeCompare(b.data_proximo_passo) || a.empresa.localeCompare(b.empresa));
  const atrasados = lista.filter((l) => l.data_proximo_passo < hoje).length;

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

  return (
    <main>
      <h1>Hoje</h1>
      <p className="meta">{lista.length} retorno{lista.length === 1 ? '' : 's'}{atrasados ? ` · ${atrasados} atrasado${atrasados === 1 ? '' : 's'}` : ''}</p>
      {!lista.length && <p className="vazio">Nenhum retorno para hoje. 🎉</p>}
      {lista.map((l) => (
        <CardLead key={l.id} lead={l} pendente={pendentes.has(l.id)}>
          <div className="acoes">
            <button type="button" className="btn" onClick={() => setAberto(l)}>Registrar contato</button>
            <button type="button" className="btn perigo" onClick={async () => {
              if (confirm(`Arquivar ${l.empresa}? Ela sai de Hoje e da contagem, mas continua guardada (dá para desarquivar na Lista).`)) {
                await gravar(opsArquivar(l), 'Arquivamento');
              }
            }}>Arquivar</button>
          </div>
        </CardLead>
      ))}
      {aberto && (
        <Dialogo titulo={aberto.empresa} onFechar={() => setAberto(null)}>
          <FormContato lead={aberto} onSalvar={async (c) => {
            if (await gravar(opsRegistrarContato(aberto, c), 'Contato')) setAberto(null);
          }} />
        </Dialogo>
      )}
      {aviso}
    </main>
  );
}
