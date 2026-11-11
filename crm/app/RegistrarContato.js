'use client';
// Diálogo "Registrar contato" (Hoje e Empresas): em Lead refaz a pesquisa (conta como retorno);
// em MQL/SQL/Venda registra o andamento do funil.
import { useApp } from './AppProvider.js';
import { Dialogo } from './componentes.js';
import Pesquisa from './Pesquisa.js';
import FormEtapa from './FormEtapa.js';
import { pesquisaDoLead, opsPesquisa } from '../lib/pesquisa.js';
import { opsFollowup, tentativasSemDecisor } from '../lib/etapas.js';

export const podeRegistrarContato = (l) => !l.arquivado && ['lead', 'mql', 'sql', 'venda'].includes(l.etapa);

export default function RegistrarContato({ lead, onFechar, gravar }) {
  const { leads, contatos } = useApp();
  const doLead = contatos.filter((c) => c.lead_id === lead.id);
  const filhos = leads.filter((l) => l.lead_pai_id === lead.id);
  return (
    <Dialogo titulo={lead.empresa} onFechar={onFechar}>
      {lead.etapa === 'lead' ? (
        <Pesquisa modo="retorno" lead={lead} tentativas={tentativasSemDecisor(doLead)} textoBotao="Salvar contato"
          inicial={{ ...pesquisaDoLead(lead), falou_decisor: null, data: '', hora: '', agendou_reuniao: null, observacao: '' }}
          onSalvar={async (f) => {
            const ok = await gravar(opsPesquisa(f, { lead, modo: 'retorno', filhos }), 'Contato');
            if (ok) onFechar();
            return ok;
          }} />
      ) : (
        <FormEtapa lead={lead} onSalvar={async (c) => { if (await gravar(opsFollowup(lead, c), 'Contato')) onFechar(); }} />
      )}
    </Dialogo>
  );
}
