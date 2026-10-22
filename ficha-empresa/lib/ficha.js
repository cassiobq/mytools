// Orquestra a ficha de uma empresa: busca web -> busca CNPJ -> Minha Receita.
// As dependências externas são injetáveis para os testes usarem respostas mockadas.
import { buscarWeb as buscarWebPadrao, buscarLocal as buscarLocalPadrao, textoDoResultado } from './busca.js';
import { consultarReceita as consultarReceitaPadrao, estaAtiva, resumirEmpresa, extrairSocio } from './receita.js';
import { extrairCnpjs, validarCnpj, formatarCnpj } from './cnpj.js';
import { compararNomes, mesmaCidade } from './texto.js';
import { encontrarInstagram, usuarioDoPerfil } from './instagram.js';
import { escolherLocal, confirmarPorLocal, linkMapsPorCid } from './local.js';
import {
  acharSiteDaEmpresa, buscarFtidNoSite as buscarFtidNoSitePadrao, linkMapsPorEndereco, linkMapsPorFtid,
} from './maps.js';

export const MAX_CANDIDATOS = 5;
export const MAX_PARALELO = 3;

const padrao = {
  buscarWeb: buscarWebPadrao,
  buscarLocal: buscarLocalPadrao,
  consultarReceita: consultarReceitaPadrao,
  buscarFtidNoSite: buscarFtidNoSitePadrao,
};

const st = (status, mensagem = '') => ({ status, mensagem });
const msgErro = (e) => String(e?.message ?? e).slice(0, 160);

function fichaVazia(item) {
  return {
    entrada: item.entrada,
    nome: item.nome,
    cidade: item.cidade,
    uf: item.uf,
    cidade_inferida: item.cidade_inferida,
    etapas: { busca_web: st('pendente'), busca_cnpj: st('pendente'), receita: st('pendente') },
    empresa: { status: 'nao_encontrado', mensagem: 'não encontrado' },
    socio: { status: 'nao_encontrado', nome: null, origem: null, mensagem: 'não encontrado' },
    instagram: { status: 'nao_encontrado', url: null, usuario: null, mensagem: 'não encontrado', descartados: [] },
    maps: { status: 'nao_encontrado', url: null, origem: null, mensagem: 'não encontrado' },
    local: null, // lugar do Google Maps que confere com nome e cidade
    ambiguo: false,
    outros_candidatos: [],
    candidatos_descartados: [],
  };
}

// Avalia um candidato já consultado. Devolve { aceito, motivo, score }.
export function avaliarCandidato(dados, item) {
  if (!mesmaCidade(dados.municipio, item.cidade)) {
    return { aceito: false, motivo: `outra cidade (${dados.municipio ?? '?'}/${dados.uf ?? '?'})`, score: 0 };
  }
  if (item.uf && dados.uf && item.uf.toUpperCase() !== String(dados.uf).toUpperCase()) {
    return { aceito: false, motivo: `outra UF (${dados.uf})`, score: 0 };
  }
  const { score, parecido } = compararNomes(item.nome, `${dados.nome_fantasia ?? ''} ${dados.razao_social ?? ''}`);
  if (!parecido) return { aceito: false, motivo: 'nome diferente do digitado', score };
  return { aceito: true, motivo: '', score };
}

// Entre os aceitáveis: ativo primeiro, depois maior semelhança, depois ordem da busca.
export function escolherCandidato(aceitos) {
  return [...aceitos].sort((a, b) =>
    (estaAtiva(b.dados) - estaAtiva(a.dados)) || (b.score - a.score) || (a.ordem - b.ordem));
}

function resumoCandidato(c, motivo) {
  const d = c.dados;
  return {
    cnpj: c.cnpj,
    cnpj_formatado: formatarCnpj(c.cnpj),
    nome: d ? (d.nome_fantasia || d.razao_social || '') : '',
    municipio: d ? `${d.municipio ?? ''}/${d.uf ?? ''}` : '',
    situacao: d?.descricao_situacao_cadastral ?? '',
    motivo,
  };
}

export async function gerarFicha(item, deps = {}, aoMudarEtapa = () => {}) {
  const { buscarWeb, buscarLocal, consultarReceita, buscarFtidNoSite } = { ...padrao, ...deps };
  const ficha = fichaVazia(item);
  if (item.erro) {
    for (const k of Object.keys(ficha.etapas)) ficha.etapas[k] = st('erro', item.erro);
    ficha.empresa = { status: 'erro', mensagem: item.erro };
    return ficha;
  }

  // 1) Busca com o input do usuário: Instagram e base para o Maps.
  aoMudarEtapa('busca_web');
  let r1 = [];
  try {
    r1 = await buscarWeb(item.entrada);
    ficha.etapas.busca_web = st('ok', `${r1.length} resultados`);
    ficha.instagram = encontrarInstagram(r1, item.nome, item.cidade);
  } catch (e) {
    ficha.etapas.busca_web = st('erro', msgErro(e));
    ficha.instagram = { status: 'erro', url: null, usuario: null, mensagem: 'falha na busca' };
  }
  // ftid só do site oficial da empresa (links do Maps soltos nos resultados podem ser de outro local).
  // Roda em paralelo com as etapas seguintes.
  const site = acharSiteDaEmpresa(r1, item.nome);
  const ftidPromise = site ? buscarFtidNoSite(site) : Promise.resolve(null);
  // Lugar no Google Maps (telefone, endereço, cid). Também em paralelo; falha não afeta o resto.
  const localPromise = Promise.resolve()
    .then(() => buscarLocal(`${item.nome} ${item.cidade}`))
    .then((locais) => escolherLocal(locais, item.nome, item.cidade))
    .catch(() => null);

  // 1b) Instagram fora da primeira página: uma busca extra só no Instagram (site:instagram.com).
  if (ficha.instagram.status === 'nao_encontrado') {
    try {
      const rInsta = await buscarWeb(`${item.nome} ${item.cidade} site:instagram.com`);
      const novo = encontrarInstagram(rInsta, item.nome, item.cidade);
      const vistos = new Set(ficha.instagram.descartados.map((d) => d.usuario));
      novo.descartados = [...ficha.instagram.descartados, ...novo.descartados.filter((d) => !vistos.has(d.usuario))];
      ficha.instagram = novo;
    } catch {
      // Mantém "não encontrado"; a falha da busca extra não afeta o resto.
    }
  }

  // 1c) Site cadastrado no Google Maps que é um perfil do Instagram.
  const local = await localPromise;
  ficha.local = local;
  const instaDoLocal = local && usuarioDoPerfil(local.site);
  if (ficha.instagram.status !== 'ok' && instaDoLocal) {
    ficha.instagram = {
      status: 'ok', url: `https://www.instagram.com/${instaDoLocal}/`, usuario: `@${instaDoLocal}`,
      mensagem: 'site cadastrado no Google Maps', descartados: ficha.instagram.descartados ?? [],
    };
  }
  const linkCid = local && linkMapsPorCid(local.cid);
  if (linkCid) ficha.maps = { status: 'ok', url: linkCid, origem: 'google_maps', mensagem: '' };

  // 2) Busca com "CNPJ": candidatos de 14 dígitos validados pelo DV.
  aoMudarEtapa('busca_cnpj');
  let r2 = [];
  try {
    r2 = await buscarWeb(`${item.entrada} CNPJ`);
  } catch (e) {
    ficha.etapas.busca_cnpj = st('erro', msgErro(e));
  }
  const brutos = extrairCnpjs([...r2, ...r1].map(textoDoResultado).join('\n'));
  const validos = brutos.filter(validarCnpj);
  for (const cnpj of brutos.filter((c) => !validarCnpj(c)).slice(0, 5)) {
    ficha.candidatos_descartados.push(resumoCandidato({ cnpj }, 'dígito verificador inválido'));
  }
  if (ficha.etapas.busca_cnpj.status !== 'erro') {
    ficha.etapas.busca_cnpj = validos.length
      ? st('ok', `${validos.length} CNPJ válido(s) nos resultados`)
      : st('nao_encontrado', 'nenhum CNPJ válido nos resultados');
  }

  // 3) Minha Receita para cada candidato (máx. 5).
  aoMudarEtapa('receita');
  const consultados = await Promise.all(validos.slice(0, MAX_CANDIDATOS).map(async (cnpj, ordem) => {
    try {
      return { cnpj, ordem, dados: await consultarReceita(cnpj) };
    } catch (e) {
      return { cnpj, ordem, dados: null, erro: msgErro(e) };
    }
  }));

  const aceitos = [];
  for (const c of consultados) {
    if (c.erro) { ficha.candidatos_descartados.push(resumoCandidato(c, `erro na consulta: ${c.erro}`)); continue; }
    if (!c.dados) { ficha.candidatos_descartados.push(resumoCandidato(c, 'não encontrado na Receita')); continue; }
    const av = avaliarCandidato(c.dados, item);
    // Nome diferente na Receita (bandeira, franquia), mas mesmo telefone/endereço do Google Maps: é a empresa.
    const confirmacao = !av.aceito && av.motivo === 'nome diferente do digitado' ? confirmarPorLocal(c.dados, local) : null;
    if (av.aceito || confirmacao) aceitos.push({ ...c, score: av.aceito ? av.score : 0.5, confirmacao });
    else ficha.candidatos_descartados.push(resumoCandidato(c, av.motivo));
  }

  const ftid = await ftidPromise;

  if (!aceitos.length) {
    const todosErro = consultados.length > 0 && consultados.every((c) => c.erro);
    ficha.etapas.receita = !validos.length
      ? st('nao_encontrado', 'sem CNPJ para consultar')
      : todosErro ? st('erro', consultados[0].erro) : st('nao_encontrado', 'nenhum CNPJ confere com nome e cidade');
    if (todosErro) ficha.empresa = { status: 'erro', mensagem: 'falha ao consultar a Receita' };
    return ficha;
  }

  const [escolhido, ...outros] = escolherCandidato(aceitos);
  const empresa = resumirEmpresa(escolhido.dados);
  ficha.etapas.receita = st('ok', empresa.situacao);
  ficha.empresa = { status: 'ok', mensagem: '', ...empresa, confirmacao: escolhido.confirmacao ?? null };
  ficha.socio = extrairSocio(escolhido.dados);
  ficha.ambiguo = outros.length > 0;
  ficha.outros_candidatos = outros.map((c) => resumoCandidato(c, 'também confere com nome e cidade'));
  if (!linkCid) {
    ficha.maps = ftid
      ? { status: 'ok', url: linkMapsPorFtid(ftid), origem: 'ftid', mensagem: '' }
      : { status: 'ok', url: linkMapsPorEndereco(empresa), origem: 'endereço', mensagem: '' };
  }
  return ficha;
}

// Processa a lista com no máximo MAX_PARALELO empresas ao mesmo tempo.
// aoEvento recebe { tipo: 'etapa', indice, etapa } e { tipo: 'resultado', indice, ficha }.
export async function processarLista(itens, deps = {}, aoEvento = () => {}) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        resultados[i] = await gerarFicha(itens[i], deps, (etapa) => aoEvento({ tipo: 'etapa', indice: i, etapa }));
      } catch (e) {
        // Nunca derruba as outras empresas.
        resultados[i] = { ...fichaVazia(itens[i]), empresa: { status: 'erro', mensagem: msgErro(e) } };
      }
      aoEvento({ tipo: 'resultado', indice: i, ficha: resultados[i] });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALELO, itens.length) }, trabalhador));
  return resultados;
}
