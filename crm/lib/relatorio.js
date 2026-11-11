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
  const partes = [e.etapa_atual];
  if (e.fora_do_perfil) partes.push(`fora do perfil (${String(e.fora_do_perfil).toLowerCase()})`);
  if (e.motivo_perda) partes.push(e.motivo_perda.toLowerCase());
  if (e.proximo_passo && e.data_proximo_passo) partes.push(`${e.proximo_passo.toLowerCase()} em ${e.data_proximo_passo}`);
  if (e.arquivado) partes.push('arquivada');
  return [...new Set(partes.filter(Boolean))].join('; ');
}
const frotaDe = (e) => (e.veiculos == null ? '' : `${e.veiculos} veíc.${e.veiculos_segurados != null ? ` (${e.veiculos_segurados} seg.)` : ''}`);

// Versão sem IA de cada visita: só o que está registrado.
function visitaSemIA(e) {
  const pontos = [];
  if (e.origem === 'Indicação') pontos.push(`Indicação${e.indicado_por ? ` de ${e.indicado_por}` : ''}.`);
  if (e.falou_decisor === false && !e.veiculos) pontos.push('Não encontrou o decisor.');
  if (e.veiculos != null) {
    pontos.push(e.veiculos === 0 ? 'Empresa sem veículos próprios.' : `Frota de ${e.veiculos} veículo(s), ${e.veiculos_segurados ?? 0} segurado(s).`);
  }
  if (e.veiculos_sem_seguro && e.por_que_nao_protegeu) pontos.push(`Por que não protegeu: ${e.por_que_nao_protegeu}.`);
  if (e.seguradora) pontos.push(`Seguradora atual: ${e.seguradora}${e.nota_seguro_0a5 != null ? `, nota ${e.nota_seguro_0a5}/5` : ''}${e.vencimento_seguro ? `, vence em ${e.vencimento_seguro}` : ''}.`);
  for (const c of e.contatos) {
    const det = [c.evento, c.veiculos ? `${c.veiculos} veíc.` : null, c.motivo, c.observacao].filter(Boolean).join(' · ');
    pontos.push(`${c.data} (${c.hora}): ${det}`);
  }
  return { contato: e.decisor || '', pontos, status: `${statusDe(e)}.`, oportunidade: '' };
}

// Resultados consolidados: sempre os números calculados, nunca os da IA.
export function resultadosConsolidados(f) {
  const n = f.numeros;
  const m = f.mercado;
  const t = (x) => (x == null ? '—' : `${x}%`);
  const r = [
    `${plural(n.leads_empresas_abordadas, 'empresa abordada', 'empresas abordadas')} (Lead) e ${plural(n.retornos, 'retorno', 'retornos')};`,
    `${plural(n.mql_reunioes_agendadas, 'reunião agendada', 'reuniões agendadas')} (MQL), ${t(n.taxa_lead_mql_pct)} dos leads${n.reunioes_que_nao_aconteceram ? `; ${n.reunioes_que_nao_aconteceram} não aconteceram` : ''};`,
    `${plural(n.sql_empresas_em_cotacao, 'empresa em cotação', 'empresas em cotação')} (SQL), somando ${plural(n.sql_veiculos_cotados, 'veículo cotado', 'veículos cotados')};`,
    `${plural(n.vendas_veiculos, 'veículo vendido', 'veículos vendidos')} em ${plural(n.vendas_empresas, 'empresa', 'empresas')} (${t(n.taxa_sql_venda_veiculos_pct)} dos cotados);`,
    `${plural(n.associados_veiculos, 'veículo associado', 'veículos associados')} (contratos assinados) em ${plural(n.associados_empresas, 'empresa', 'empresas')};`,
  ];
  if (m.empresas_com_decisor_pesquisadas) {
    r.push(`Pesquisa com ${plural(m.empresas_com_decisor_pesquisadas, 'decisor', 'decisores')}: ${plural(m.veiculos_mapeados, 'veículo mapeado', 'veículos mapeados')}, ${m.veiculos_sem_seguro} sem seguro;`);
  }
  if (m.fora_do_perfil) r.push(`${plural(m.fora_do_perfil, 'empresa fora do perfil', 'empresas fora do perfil')};`);
  const perdas = Object.entries(n.perdas_por_etapa_e_motivo);
  if (perdas.length) r.push(`Perdas: ${perdas.map(([k, v]) => `${k} (${v})`).join(', ')};`);
  if (n.indicacoes_recebidas) r.push(`${plural(n.indicacoes_recebidas, 'indicação trabalhada', 'indicações trabalhadas')};`);
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
  else corpo.push(p(`No período de ${periodo}, foram ${plural(fatos.numeros.leads_empresas_abordadas, 'empresa abordada', 'empresas abordadas')} e ${plural(fatos.empresas.length, 'empresa trabalhada', 'empresas trabalhadas')} no total, em ${cidades}.`));

  if (texto?.panorama?.length) { secao('Panorama do Campo'); texto.panorama.forEach((t) => corpo.push(item(t))); }

  const grupos = [
    ['Negociações em Andamento e Fechamentos', fatos.empresas.filter((e) => ['MQL', 'SQL', 'Venda', 'Associado'].includes(e.etapa_atual))],
    ['Abordagens e Retornos', fatos.empresas.filter((e) => e.etapa_atual === 'Lead' && !e.fora_do_perfil)],
    ['Perdidas e Fora do Perfil', fatos.empresas.filter((e) => e.etapa_atual === 'Perdido' || (e.etapa_atual === 'Lead' && e.fora_do_perfil))],
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
      if (v.oportunidade) corpo.push(item(v.oportunidade, 'Oportunidade'));
    });
  }

  // Leitura do mercado (pesquisa das abordagens): números calculados.
  const m = fatos.mercado;
  if (m.empresas_com_decisor_pesquisadas) {
    secao('Leitura do Mercado');
    const segPct = m.veiculos_mapeados ? Math.round((m.veiculos_segurados / m.veiculos_mapeados) * 100) : 0;
    corpo.push(item(`${plural(m.empresas_com_decisor_pesquisadas, 'empresa pesquisada', 'empresas pesquisadas')} com o decisor; ${m.empresas_sem_veiculos} sem veículos.`));
    corpo.push(item(`${plural(m.veiculos_mapeados, 'veículo mapeado', 'veículos mapeados')}: ${segPct}% segurados e ${m.veiculos_sem_seguro} sem seguro.`));
    corpo.push(item(`Frota toda segurada: ${m.empresas_com_toda_frota_segurada} · parte segurada: ${m.empresas_com_parte_segurada} · nenhum seguro: ${m.empresas_sem_nenhum_seguro}.`));
    if (m.nota_media_seguro_atual != null) corpo.push(item(`Nota média do seguro atual: ${String(m.nota_media_seguro_atual).replace('.', ',')}/5 (${m.satisfeitos_nota_4_ou_5} satisfeitos, nota 4 ou 5).`));
    const mot = Object.entries(m.por_que_nao_protegeram);
    if (mot.length) corpo.push(item(mot.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', '), 'Por que não protegeram'));
    if (m.seguradoras.length) {
      const lg = [3400, 1800, 1800, 2026];
      corpo.push(new Paragraph({ spacing: { before: 120 } }));
      corpo.push(tabela(lg, [
        new TableRow({ tableHeader: true, children: ['Seguradora', 'Empresas', 'Veículos', 'Nota média'].map((t, i) => cel(t, lg[i], { negrito: true, fundo: AZUL, cor: 'FFFFFF' })) }),
        ...m.seguradoras.map((x) => new TableRow({ cantSplit: true, children: [cel(x.nome, lg[0]), cel(x.empresas, lg[1]), cel(x.veiculos, lg[2]), cel(x.nota_media == null ? '—' : String(x.nota_media).replace('.', ','), lg[3])] })),
      ]));
    }
  }

  secao('Quadro-Resumo das Visitas');
  const larg = [2700, 2000, 1500, 2826];
  const cab = new TableRow({ tableHeader: true, children: ['Empresa', 'Decisor', 'Frota', 'Status'].map((t, i) => cel(t, larg[i], { negrito: true, fundo: AZUL, cor: 'FFFFFF' })) });
  corpo.push(tabela(larg, [cab, ...fatos.empresas.map((e) => new TableRow({
    cantSplit: true,
    children: [cel(e.empresa, larg[0]), cel(porId.get(e.id)?.contato || e.decisor || '', larg[1]), cel(frotaDe(e), larg[2]), cel(statusDe(e), larg[3])],
  }))]));

  secao('Resultados Consolidados');
  resultadosConsolidados(fatos).forEach((t) => corpo.push(item(t)));

  if (texto?.oportunidades?.length) { secao('Oportunidades Identificadas'); texto.oportunidades.forEach((t) => corpo.push(item(t))); }
  secao('Próximos Passos');
  if (texto?.proximos_passos?.length) texto.proximos_passos.forEach((t) => corpo.push(item(t)));
  else {
    const passos = fatos.empresas.filter((e) => e.proximo_passo && e.data_proximo_passo && !e.arquivado);
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
