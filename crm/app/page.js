'use client';
// Tela inicial: registrar uma visita em poucos toques.
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider.js';
import FormLead, { formularioVazio, lerPrefs } from './FormLead.js';
import { useAviso, textoDoStatus } from './ui.js';
import { opsRegistrarVisita } from '../lib/acoes.js';

export default function Registrar() {
  const { gravarOps } = useApp();
  const [inicial, setInicial] = useState(null);
  const [aviso, mostrar] = useAviso();
  useEffect(() => { setInicial(formularioVazio(lerPrefs())); }, []);
  if (!inicial) return null;

  const salvar = async (f) => {
    try {
      const status = await gravarOps(opsRegistrarVisita(f));
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
      <FormLead inicial={inicial} onSalvar={salvar} textoBotao="Salvar visita" />
      {aviso}
    </main>
  );
}
