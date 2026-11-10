// Relatório de prospecção em .docx, no layout do modelo "Relatório de Viagem" (Arial, azul 1F3864,
// títulos numerados com filete, tabela de identificação e quadro-resumo).
// Os números vêm sempre de `fatos` (calculados no servidor); o texto corrido vem da IA (`texto`).
// Sem texto da IA, monta uma versão só com os registros (observações, status e próximos passos).

const AZUL = '1F3864';
const AZUL2 = '2F5496';
const CINZA = '595959';
const FUNDO = 'D9E2F3';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const diaDaSemana = (br) => { const [d, m, a] = br.split('/').map(Number); return DIAS[new Date(a, m - 1, d).getDay()]; };

export function textoDoPeriodo(p) {
  return p.inicio === p.fim ? `${diaDaSemana(p.inicio)}, ${p.inicio}` : `${p.inicio} a ${p.fim}`;
}

// Situação curta para o quadro-resumo e para o status sem IA.
function statusDe(e) {
  const partes = [e.resultado_atual];
  if (e.situacao_atual) partes.push(e.situacao_atual.toLowerCase());
  if (e.resultado_atual === 'Sem interesse' && e.motivo_nao) partes.push(e.motivo_nao.toLowerCase());
  if (e.arquivado) partes.push('arquivada');
  return [...new Set(partes.filter(Boolean))].join('; ');
}
const tipoDe = (e) => (e.tipo === 'Frota' ? `Frota${e.n_veiculos ? ` (${e.n_veiculos})` : ''}` : e.tipo || '');

// Versão sem IA de cada visita: só o que está registrado.
function visitaSemIA(e) {
  const pontos = [];
  if (e.origem === 'Indicação') pontos.push(`Indicação${e.indicado_por ? ` de ${e.indicado_por}` : ''}.`);
  if (e.tipo === 'Frota' && e.n_veiculos) pontos.push(`Frota de ${plural(e.n_veiculos, 'veículo', 'veículos')}.`);
  if (e.falou_decisor != null) pontos.push(e.falou_decisor ? 'Falou com o decisor.' : 'Não falou com o decisor.');
  if (e.vencimento_seguro) pontos.push(`Seguro atual vence em ${e.vencimento_seguro}.`);
  for (const c of e.contatos) if (c.observacao) pontos.push(`${c.data} (${c.hora}): ${c.observacao}`);
  const passo = e.proximo_passo ? `Próximo passo: ${e.proximo_passo}${e.data_proximo_passo ? ` em ${e.data_proximo_passo}` : ''}.` : '';
  return { contato: '', pontos, status: `${statusDe(e)}.`, oportunidade: passo };
}

// Resultados consolidados: sempre os números calculados, nunca os da IA.
export function resultadosConsolidados(f) {
  const n = f.numeros;
  const r = [
    `${plural(n.empresas_contatadas, 'empresa trabalhada', 'empresas trabalhadas')} (${n.empresas_novas} ${n.empresas_novas === 1 ? 'nova' : 'novas'} e ${plural(n.retornos_a_empresas_antigas, 'retorno', 'retornos')}), em ${plural(n.contatos_registrados, 'contato registrado', 'contatos registrados')};`,
    `${plural(n.frotas, 'frota prospectada', 'frotas prospectadas')}${n.veiculos_nas_frotas ? `, somando ${plural(n.veiculos_nas_frotas, 'veículo', 'veículos')}` : ''};`,
    `${n.falou_com_decisor} ${n.falou_com_decisor === 1 ? 'conversa' : 'conversas'} com o decisor;`,
    `${plural(n.cotacoes, 'cotação', 'cotações')} e ${plural(n.vendas, 'venda', 'vendas')}${n.vendas ? ` (${plural(n.veiculos_vendidos, 'veículo', 'veículos')})` : ''};`,
  ];
  if (n.indicacoes_recebidas) r.push(`${plural(n.indicacoes_recebidas, 'indicação recebida', 'indicações recebidas')};`);
  if (n.sem_interesse) {
    const m = Object.entries(n.motivos_sem_interesse).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join(', ');
    r.push(`${n.sem_interesse} sem interesse${m ? ` (${m})` : ''};`);
  }
  const cid = Object.entries(n.empresas_por_cidade);
  if (cid.length > 1) r.push(`Por cidade: ${cid.map(([c, v]) => `${c} ${v}`).join(', ')};`);
  r.push(`${plural(f.periodo.dias_com_atividade, 'dia', 'dias')} com atividade no período.`);
  return r;
}

export async function gerarRelatorioDOCX({ fatos, texto, participantes = '' }) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
    Header, Footer, AlignmentType, LevelFormat, PageNumber } = d;

  const p = (t, o = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...o, children: [new TextRun(t)] });
  const h1 = (t) => new Paragraph({ style: 'T1', children: [new TextRun(t)] });
  const h2 = (t) => new Paragraph({ style: 'T2', children: [new TextRun(t)] });
  const item = (t, rotulo) => new Paragraph({
    numbering: { reference: 'marcador', level: 0 }, spacing: { after: 60, line: 276 },
    children: rotulo ? [new TextRun({ text: `${rotulo}: `, bold: true }), new TextRun(t)] : [new TextRun(t)],
  });
  const borda = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };
  const cel = (t, largura, o = {}) => new TableCell({
    width: { size: largura, type: WidthType.DXA }, borders: bordas,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: o.fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fundo } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ''), size: 20, bold: o.negrito, color: o.cor })] })],
  });
  const tabela = (larguras, linhas) => new Table({
    width: { size: larguras.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: larguras, rows: linhas,
  });

  const porId = new Map((texto?.visitas || []).map((v) => [v.lead_id, v]));
  const visitaDe = (e) => {
    const v = porId.get(e.id);
    return v ? { contato: v.contato, pontos: v.pontos, status: v.status, oportunidade: v.oportunidade } : visitaSemIA(e);
  };
  const cidades = fatos.cidades.length ? fatos.cidades.join(', ') : 'Não informada';
  const periodo = textoDoPeriodo(fatos.periodo);
  const varioDias = fatos.periodo.inicio !== fatos.periodo.fim;

  const corpo = [];
  corpo.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'RELATÓRIO DE PROSPECÇÃO', bold: true, size: 36, color: AZUL })] }));
  corpo.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'Departamento de Expansão e Frotas - Valle', size: 24, color: CINZA })] }));
  const ident = [['Cidades', cidades], ['Participantes', participantes || '—'], ['Período', periodo]];
  corpo.push(tabela([2600, 6426], ident.map(([k, v]) => new TableRow({ cantSplit: true, children: [cel(k, 2600, { negrito: true, fundo: FUNDO }), cel(v, 6426)] }))));

  let n = 0;
  const secao = (titulo) => corpo.push(h1(`${++n}. ${titulo}`));

  secao('Resumo Executivo');
  if (texto?.resumo_executivo?.length) texto.resumo_executivo.forEach((t) => corpo.push(p(t)));
  else corpo.push(p(`No período de ${periodo}, foram ${plural(fatos.numeros.empresas_contatadas, 'empresa trabalhada', 'empresas trabalhadas')} em ${cidades}, com ${plural(fatos.numeros.contatos_registrados, 'contato registrado', 'contatos registrados')}.`));

  if (texto?.panorama?.length) { secao('Panorama do Campo'); texto.panorama.forEach((t) => corpo.push(item(t))); }

  const grupos = [
    ['Prospecção de Frotas', fatos.empresas.filter((e) => e.tipo === 'Frota')],
    ['Prospecção de Pessoa Física', fatos.empresas.filter((e) => e.tipo !== 'Frota')],
  ].filter(([, es]) => es.length);
  for (const [titulo, es] of grupos) {
    secao(titulo);
    es.forEach((e, i) => {
      const c0 = e.contatos[0];
      const quando = c0 ? (varioDias ? `${c0.data.slice(0, 5)}, ${c0.hora}` : c0.hora) : '';
      corpo.push(h2(`${n}.${i + 1}. ${e.empresa}${quando ? ` (${quando})` : ''}`));
      const v = visitaDe(e);
      if (v.contato) corpo.push(item(v.contato, 'Contato'));
      v.pontos.forEach((t) => corpo.push(item(t)));
      if (v.status) corpo.push(item(v.status, 'Status'));
      if (v.oportunidade) corpo.push(item(v.oportunidade, texto ? 'Oportunidade' : undefined));
    });
  }

  secao('Quadro-Resumo das Visitas');
  const larg = [2700, 2000, 1500, 2826];
  const cab = new TableRow({ tableHeader: true, children: ['Empresa', 'Contato', 'Tipo', 'Status'].map((t, i) => cel(t, larg[i], { negrito: true, fundo: AZUL, cor: 'FFFFFF' })) });
  corpo.push(tabela(larg, [cab, ...fatos.empresas.map((e) => new TableRow({
    cantSplit: true,
    children: [cel(e.empresa, larg[0]), cel(porId.get(e.id)?.contato || '', larg[1]), cel(tipoDe(e), larg[2]), cel(statusDe(e), larg[3])],
  }))]));

  secao('Resultados Consolidados');
  resultadosConsolidados(fatos).forEach((t) => corpo.push(item(t)));

  if (texto?.oportunidades?.length) { secao('Oportunidades Identificadas'); texto.oportunidades.forEach((t) => corpo.push(item(t))); }
  secao('Próximos Passos');
  if (texto?.proximos_passos?.length) texto.proximos_passos.forEach((t) => corpo.push(item(t)));
  else {
    const passos = fatos.empresas.filter((e) => e.proximo_passo && !e.arquivado && e.resultado_atual !== 'Venda');
    if (passos.length) passos.forEach((e) => corpo.push(item(`${e.empresa}: ${e.proximo_passo}${e.data_proximo_passo ? ` (${e.data_proximo_passo})` : ''}.`)));
    else corpo.push(p('Nenhum próximo passo registrado.'));
  }
  if (texto?.conclusao?.length) { secao('Conclusão'); texto.conclusao.forEach((t) => corpo.push(p(t))); }

  const doc = new Document({
    creator: 'Micro CRM',
    title: `Relatório de Prospecção - ${periodo}`,
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'T1', name: 'Título 1', basedOn: 'Normal', next: 'Normal', run: { bold: true, color: AZUL, size: 28 },
          paragraph: { keepNext: true, spacing: { before: 300, after: 120 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: AZUL } } } },
        { id: 'T2', name: 'Título 2', basedOn: 'Normal', next: 'Normal', run: { bold: true, color: AZUL2, size: 23 },
          paragraph: { keepNext: true, spacing: { before: 180, after: 80 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: 'marcador', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, right: 1300, bottom: 1200, left: 1300, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [
        new TextRun({ text: 'VALLE', bold: true, color: AZUL, size: 18 }),
        new TextRun({ text: ' | Departamento de Expansão e Frotas', color: CINZA, size: 18 }),
      ] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: `Relatório de Prospecção | ${periodo} | Página `, color: '7F7F7F', size: 18 }),
        new TextRun({ children: [PageNumber.CURRENT], color: '7F7F7F', size: 18 }),
      ] })] }) },
      children: corpo,
    }],
  });
  return Packer.toBlob(doc);
}
