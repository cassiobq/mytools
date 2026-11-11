// Pesquisa da abordagem (PAP empresas): o caminho de perguntas, o que falta responder e as linhas a gravar.
// Lógica pura (sem tela), usada no Registrar, no retorno de um lead e na edição.
//
// Falou com o decisor?
//   Não -> retorno com data e hora
//   Sim -> nome + WhatsApp -> nº de veículos
//     0  -> bandeira "Sem veículos"
//     1+ -> nº de segurados
//       algum sem seguro -> motivo -> agendou reunião? (data e hora) -> MQL; se não agendou, perdido
//       algum segurado   -> seguradora, vencimento (mês/ano), nota 0-5
//         todos segurados -> retorno no dia 1 do mês do vencimento; nota 4-5 = bandeira "Satisfeito com o seguro"
//         parte segurada  -> opção de criar um 2º lead só com os segurados (retorno no vencimento)

export const MOTIVOS_SEM_SEGURO = ['Condição financeira', 'Não é prioridade', 'Vou vender o veículo', 'Outro'];
export const NOTA_SATISFEITO = 4;
export const BANDEIRA_SEM_VEICULOS = 'Sem veículos';
export const BANDEIRA_SATISFEITO = 'Satisfeito com o seguro';

const novoId = () => crypto.randomUUID();
const txt = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null);

// "4+" com "Quantos?" vazio vale 4 (e fica marcado como "4 ou mais").
export function numero(escolha, qtd) {
  if (escolha == null) return null;
  if (escolha === '4+') return Number(qtd) >= 4 ? Number(qtd) : 4;
  return escolha;
}

export function opcoesSegurados(nVeiculos) {
  if (!nVeiculos) return [];
  const ops = [];
  for (let i = 0; i <= Math.min(nVeiculos, 3); i++) ops.push(i);
  if (nVeiculos >= 4) ops.push('4+');
  return ops;
}

export function pesquisaVazia(prefs = {}) {
  return {
    empresa: '', origem: 'abordagem', indicado_por: '', cidade: prefs.cidade || '',
    falou_decisor: null, decisor_nome: '', decisor_whatsapp: '',
    veiculos: null, veiculos_qtd: '', segurados: null, segurados_qtd: '',
    motivo_sem_seguro: null, motivo_outro: '', agendou_reuniao: null,
    seguradora: '', vencimento: '', nota: null, criar_lead_segurados: true,
    data: '', hora: '', observacao: '',
  };
}

// Preenche a pesquisa com o que o lead já tem (retorno ou edição).
export function pesquisaDoLead(l) {
  const f = pesquisaVazia();
  const escolha = (n, mais) => (n == null ? null : n >= 4 ? '4+' : n);
  const motivoConhecido = MOTIVOS_SEM_SEGURO.includes(l.motivo_sem_seguro);
  return {
    ...f,
    empresa: l.empresa || '', origem: l.origem || 'abordagem', indicado_por: l.indicado_por || '', cidade: l.cidade || '',
    falou_decisor: l.falou_decisor ?? null, decisor_nome: l.decisor_nome || '', decisor_whatsapp: l.decisor_whatsapp || '',
    veiculos: escolha(l.n_veiculos), veiculos_qtd: l.n_veiculos >= 4 && !l.veiculos_mais ? String(l.n_veiculos) : '',
    segurados: escolha(l.n_segurados), segurados_qtd: l.n_segurados >= 4 ? String(l.n_segurados) : '',
    motivo_sem_seguro: l.motivo_sem_seguro ? (motivoConhecido ? l.motivo_sem_seguro : 'Outro') : null,
    motivo_outro: l.motivo_sem_seguro && !motivoConhecido ? l.motivo_sem_seguro : '',
    agendou_reuniao: l.etapa === 'mql' ? true : null,
    seguradora: l.seguradora || '', vencimento: l.vencimento_seguro ? l.vencimento_seguro.slice(0, 7) : '',
    nota: l.nota_seguro ?? null,
    data: l.proximo_tipo === 'vencimento' ? '' : l.data_proximo_passo || '', hora: l.hora_proximo_passo ? l.hora_proximo_passo.slice(0, 5) : '',
    observacao: l.observacao || '',
  };
}

// O que a pesquisa concluiu: números, caminho e o que ainda falta responder.
export function analisar(f) {
  const nV = numero(f.veiculos, f.veiculos_qtd);
  const nS = nV ? Math.min(numero(f.segurados, f.segurados_qtd) ?? -1, nV) : null;
  const r = { nVeiculos: nV, nSegurados: nS != null && nS >= 0 ? nS : null, falta: [] };
  const falta = (m) => r.falta.push(m);
  if (!txt(f.empresa)) falta('Empresa');
  if (f.falou_decisor == null) { falta('Falou com o decisor?'); return r; }
  if (f.falou_decisor === false) {
    r.caminho = 'retorno';
    if (!f.data) falta('Data do retorno');
    if (!f.hora) falta('Hora do retorno');
    return r;
  }
  if (!txt(f.decisor_nome)) falta('Nome do decisor');
  if (!txt(f.decisor_whatsapp)) falta('WhatsApp do decisor');
  if (nV == null) { falta('Quantos veículos?'); return r; }
  if (nV === 0) { r.caminho = 'sem_veiculos'; return r; }
  if (r.nSegurados == null) { falta('Quantos segurados?'); return r; }
  r.semSeguro = nV - r.nSegurados;
  r.comSeguro = r.nSegurados;
  if (r.semSeguro > 0) {
    if (!f.motivo_sem_seguro) falta('Por que ainda não protegeu?');
    else if (f.motivo_sem_seguro === 'Outro' && !txt(f.motivo_outro)) falta('Qual o motivo?');
    if (f.agendou_reuniao == null) falta('Agendou reunião?');
    if (f.agendou_reuniao) { if (!f.data) falta('Data da reunião'); if (!f.hora) falta('Hora da reunião'); }
  }
  if (r.comSeguro > 0 && f.nota == null) falta('Nota do seguro atual');
  r.satisfeito = r.comSeguro > 0 && f.nota != null && f.nota >= NOTA_SATISFEITO;
  r.caminho = r.semSeguro > 0 ? (r.comSeguro > 0 ? 'parcial' : 'sem_seguro') : 'segurados';
  return r;
}

export const vencimentoISO = (mes) => (mes ? `${mes}-01` : null); // "2027-03" -> "2027-03-01" (retorno no dia 1)

const proximo = (tipo, data, hora, passo) => ({ proximo_tipo: tipo, data_proximo_passo: data || null, hora_proximo_passo: hora || null, proximo_passo: passo });
const SEM_PROXIMO = proximo(null, null, null, null);

// Campos do lead que a pesquisa define (sem id, criado_em, etapa).
function camposDaPesquisa(f, a) {
  const motivo = f.motivo_sem_seguro === 'Outro' ? txt(f.motivo_outro) : f.motivo_sem_seguro;
  return {
    origem: f.origem || 'abordagem',
    indicado_por: f.origem === 'indicacao' ? txt(f.indicado_por) : null,
    empresa: txt(f.empresa),
    cidade: txt(f.cidade),
    falou_decisor: f.falou_decisor,
    decisor_nome: txt(f.decisor_nome),
    decisor_whatsapp: txt(f.decisor_whatsapp),
    n_veiculos: f.falou_decisor ? a.nVeiculos : null,
    veiculos_mais: f.veiculos === '4+' && !(Number(f.veiculos_qtd) >= 4),
    n_segurados: f.falou_decisor && a.nVeiculos ? a.nSegurados : null,
    motivo_sem_seguro: a.semSeguro > 0 ? motivo : null,
    seguradora: a.comSeguro > 0 ? txt(f.seguradora) : null,
    vencimento_seguro: a.comSeguro > 0 ? vencimentoISO(f.vencimento) : null,
    nota_seguro: a.comSeguro > 0 ? f.nota : null,
    observacao: txt(f.observacao),
  };
}

// Situação final do lead (etapa, bandeira, próximo passo) e os eventos do histórico.
function desfecho(f, a, dadosLead) {
  const seg = dadosLead.seguradora ? ` (${dadosLead.seguradora})` : '';
  switch (a.caminho) {
    case 'retorno':
      return { lead: { etapa: 'lead', bandeira: false, motivo_bandeira: null, ...proximo('retorno', f.data, f.hora, 'Retorno: falar com o decisor') }, eventos: [] };
    case 'sem_veiculos':
      return { lead: { etapa: 'lead', bandeira: true, motivo_bandeira: BANDEIRA_SEM_VEICULOS, ...SEM_PROXIMO }, eventos: [] };
    case 'segurados': {
      const venc = dadosLead.vencimento_seguro;
      return {
        lead: {
          etapa: 'lead', bandeira: a.satisfeito, motivo_bandeira: a.satisfeito ? BANDEIRA_SATISFEITO : null,
          ...(venc ? proximo('vencimento', venc, null, `Vencimento do seguro${seg}`) : SEM_PROXIMO),
        },
        eventos: [],
      };
    }
    default: // sem_seguro ou parcial: segue pelos veículos sem seguro
      if (f.agendou_reuniao) {
        return { lead: { etapa: 'mql', bandeira: false, motivo_bandeira: null, ...proximo('reuniao', f.data, f.hora, 'Reunião') }, eventos: [{ evento: 'mql' }] };
      }
      return {
        lead: { etapa: 'perdido', bandeira: false, motivo_bandeira: null, ...SEM_PROXIMO },
        eventos: [{ evento: 'perda', motivo: 'Não quis agendar reunião' }],
      };
  }
}

// Linhas a gravar. modo: 'abordagem' (visita nova) | 'retorno' (lead já existente, conta como retorno, não como lead novo).
// filhos: leads "segurados" que já existem para este lead (para não criar outro).
export function opsPesquisa(f, { lead = null, modo = 'abordagem', filhos = [], agora = new Date() } = {}) {
  const a = analisar(f);
  if (a.falta.length) throw new Error(`Falta responder: ${a.falta.join(', ')}`);
  const id = lead?.id || novoId();
  const etapaAntes = lead?.etapa || 'lead';
  const dados = camposDaPesquisa(f, a);
  const d = desfecho(f, a, dados);
  const linhaLead = {
    ...(lead ? limparLead(lead) : { id, criado_em: agora.toISOString(), arquivado: false, lead_pai_id: null }),
    ...dados, ...d.lead,
  };
  const ops = [{ tabela: 'leads', linha: linhaLead }];
  const t = agora.getTime();
  const contato = (extra, i) => ({
    id: novoId(), lead_id: id, data: new Date(t + i).toISOString(), etapa: etapaAntes,
    resultado: null, observacao: null, veiculos: null, decisor: null, motivo: null, ...extra,
  });
  ops.push({ tabela: 'contatos', linha: contato({ evento: modo === 'abordagem' ? 'abordagem' : 'retorno', decisor: f.falou_decisor, observacao: dados.observacao }, 0) });
  d.eventos.forEach((e, i) => ops.push({ tabela: 'contatos', linha: contato(e, i + 1) }));

  // Parte segurada: 2º lead só com os veículos segurados, para voltar no vencimento.
  if (a.caminho === 'parcial' && f.criar_lead_segurados && !filhos.length) {
    ops.push({
      tabela: 'leads',
      linha: {
        ...linhaLead, ...d.lead,
        id: novoId(), criado_em: agora.toISOString(), lead_pai_id: id, arquivado: false,
        n_veiculos: a.comSeguro, veiculos_mais: false, n_segurados: a.comSeguro, motivo_sem_seguro: null,
        etapa: 'lead', bandeira: a.satisfeito, motivo_bandeira: a.satisfeito ? BANDEIRA_SATISFEITO : null,
        observacao: `Veículos segurados de ${dados.empresa}.`,
        ...(dados.vencimento_seguro
          ? proximo('vencimento', dados.vencimento_seguro, null, `Vencimento do seguro${dados.seguradora ? ` (${dados.seguradora})` : ''}`)
          : SEM_PROXIMO),
      },
    });
  }
  return ops;
}

// Edição pela Lista: só corrige os dados (não cria eventos nem muda etapa).
export function opsEditarLead(lead, f) {
  const a = analisar({ ...f, falou_decisor: f.falou_decisor ?? lead.falou_decisor });
  const dados = camposDaPesquisa(f, a);
  return [{ tabela: 'leads', linha: { ...limparLead(lead), ...dados } }];
}

export const COLUNAS_LEAD = ['id', 'criado_em', 'origem', 'indicado_por', 'empresa', 'cidade', 'n_veiculos', 'tipo', 'estrategia',
  'falou_decisor', 'resultado', 'faixa_cadencia', 'vencimento_seguro', 'proximo_passo', 'data_proximo_passo',
  'motivo_nao', 'observacao', 'arquivado', 'decisor_nome', 'decisor_whatsapp', 'veiculos_mais', 'n_segurados', 'seguradora',
  'nota_seguro', 'motivo_sem_seguro', 'bandeira', 'motivo_bandeira', 'etapa', 'proximo_tipo', 'hora_proximo_passo', 'lead_pai_id'];
export function limparLead(l) {
  return Object.fromEntries(COLUNAS_LEAD.filter((c) => c in l).map((c) => [c, l[c]]));
}
