'use client';
// Tela inicial: registrar uma visita (pesquisa da abordagem).
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider.js';
import Pesquisa, { lerPrefs } from './Pesquisa.js';
import { useAviso, textoDoStatus } from './ui.js';
import { pesquisaVazia, opsPesquisa } from '../lib/pesquisa.js';

export default function Registrar() {
  const { gravarOps } = useApp();
  const [inicial, setInicial] = useState(null);
  const [vez, setVez] = useState(0); // troca a "key" para limpar o formulário depois de salvar
  const [aviso, mostrar] = useAviso();
  useEffect(() => { setInicial(pesquisaVazia(lerPrefs())); }, []);
  if (!inicial) return null;

  const salvar = async (f) => {
    try {
      const status = await gravarOps(opsPesquisa(f));
      mostrar(status, textoDoStatus(status, 'Visita', true));
      return true;
    } catch (e) {
      mostrar('erro', `Não foi possível guardar: ${e.message || e}`);
      return false;
    }
  };

  return (
    <main>
      <h1>Registrar visita</h1>
      <Pesquisa key={vez} inicial={inicial} onSalvar={salvar} aoLimpar={() => { setInicial(pesquisaVazia(lerPrefs())); setVez((v) => v + 1); }} />
      {aviso}
    </main>
  );
}
