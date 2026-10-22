// Escolhe o perfil de Instagram entre os resultados de busca. Nunca chuta: sem certeza, null.
import { compactar, tokensSignificativos, normalizar, ehGenerica } from './texto.js';

const RESERVADOS = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'about', 'directory', 'developer',
  'legal', 'web', 'tags', 'locations', 'popular', 'privacy', 'session', 'emails', 'challenge',
]);

// Só perfis: instagram.com/<usuario>/ (aceita ?hl=pt etc.). Posts, reels e hashtags ficam de fora.
export function usuarioDoPerfil(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^(www\.|m\.)?instagram\.com$/i.test(u.hostname)) return null;
  const partes = u.pathname.split('/').filter(Boolean);
  if (partes.length !== 1) return null;
  const usuario = partes[0].toLowerCase();
  if (RESERVADOS.has(usuario) || !/^[a-z0-9._]{1,30}$/.test(usuario)) return null;
  return usuario;
}

// "Relação clara" com o nome (do mais forte para o mais fraco):
//  3: todas as palavras do nome estão no @ (sem pontos/underscores);
//  2: as palavras específicas (não genéricas como "farmácia") estão no @, e há confirmação:
//     2+ palavras específicas, a cidade no @/título/descrição, ou também uma palavra genérica do
//     nome no @ (ex.: @casa.brasilia para "Casa Brasília Materiais Para Construção");
//  1: o título do perfil traz o nome inteiro (com ou sem espaços entre as palavras).
// Abaixo disso, o perfil é descartado (nunca chuta um @).
function avaliar(nome, cidade, r, usuario) {
  const tokens = tokensSignificativos(nome);
  if (!tokens.length) return { nota: 0, motivo: 'nome vazio' };
  const especificos = tokens.filter((t) => !ehGenerica(t));
  const userCompacto = compactar(usuario);
  const tituloTokens = new Set(normalizar(r.titulo).split(' '));
  const cidadeCompacta = compactar(cidade);
  const textoPerfil = compactar(`${usuario} ${r.titulo} ${r.descricao ?? ''}`);
  const citaCidade = cidadeCompacta.length >= 4 && textoPerfil.includes(cidadeCompacta);

  if (tokens.every((t) => userCompacto.includes(t))) return { nota: 3, motivo: '' };
  const especificosNoUsuario = especificos.length > 0 && especificos.every((t) => userCompacto.includes(t));
  const genericaNoUsuario = tokens.some((t) => ehGenerica(t) && t.length >= 4 && userCompacto.includes(t));
  if (especificosNoUsuario && especificos.join('').length >= 5 && (especificos.length >= 2 || citaCidade || genericaNoUsuario)) {
    return { nota: 2, motivo: '' };
  }
  // Título com o nome inteiro, palavra a palavra ou junto ("Farmácia DuPovo Popular").
  if (tokens.every((t) => tituloTokens.has(t)) || compactar(r.titulo).includes(tokens.join(''))) {
    return { nota: 1, motivo: '' };
  }
  return { nota: 0, motivo: 'nome não confere com o perfil' };
}

const POSTAGEM = new Set(['p', 'reel', 'reels', 'tv']);

// Dono de um resultado do Instagram que não é a página do perfil (post, reel):
// instagram.com/<usuario>/p/..., título "Nome (@usuario) • ...", ou texto "usuario on December 28, 2024".
// Menções soltas a outros @ no texto são ignoradas (podem ser outra loja).
export function donoDoResultado(r) {
  let u;
  try {
    u = new URL(r.url);
  } catch {
    return null;
  }
  if (!/^(www\.|m\.)?instagram\.com$/i.test(u.hostname)) return null;
  const partes = u.pathname.split('/').filter(Boolean);
  const valido = (x) => x && /^[a-z0-9._]{3,30}$/.test(x) && !RESERVADOS.has(x);
  if (partes.length >= 2 && POSTAGEM.has(partes[1]) && valido(partes[0].toLowerCase())) return partes[0].toLowerCase();
  const doTitulo = String(r.titulo ?? '').match(/\(@([A-Za-z0-9._]{3,30})\)/);
  if (doTitulo && valido(doTitulo[1].toLowerCase())) return doTitulo[1].toLowerCase();
  const doTexto = `${r.titulo ?? ''} ${r.descricao ?? ''}`.match(/(?:^|\s)([a-z0-9._]{3,30}) (?:on|em) (?:[A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2} de [a-zç]+ de \d{4})/);
  if (doTexto && valido(doTexto[1])) return doTexto[1];
  return null;
}

// nomes: o nome digitado ou uma lista de nomes da mesma empresa (digitado, fantasia, Google Maps).
// Vale a melhor nota entre eles. Nomes extras só com palavras genéricas ("SUPERMERCADO") são ignorados.
export function encontrarInstagram(resultados, nomes, cidade = '') {
  const lista = (Array.isArray(nomes) ? nomes : [nomes])
    .filter((n, i) => i === 0 || tokensSignificativos(n).some((t) => !ehGenerica(t)));
  const vistos = new Map();
  // Páginas de perfil primeiro; depois os donos de posts/reels (em empate, o perfil direto vence).
  const candidatos = [
    ...(resultados ?? []).map((r) => [usuarioDoPerfil(r.url), r]),
    ...(resultados ?? []).filter((r) => !usuarioDoPerfil(r.url)).map((r) => [donoDoResultado(r), r]),
  ];
  for (const [usuario, r] of candidatos) {
    if (!usuario || vistos.has(usuario)) continue;
    const melhor = lista
      .map((n) => avaliar(n, cidade, r, usuario))
      .reduce((a, b) => (b.nota > a.nota ? b : a), { nota: 0, motivo: 'nome não confere com o perfil' });
    vistos.set(usuario, { ...melhor, titulo: r.titulo ?? '' });
  }
  // Prefere a nota mais alta; entre iguais, mantém a ordem da busca.
  const ordenados = [...vistos].filter(([, v]) => v.nota > 0).sort((a, b) => b[1].nota - a[1].nota);
  const descartados = [...vistos]
    .filter(([, v]) => v.nota === 0)
    .map(([usuario, v]) => ({ usuario: `@${usuario}`, titulo: v.titulo, motivo: v.motivo }));
  if (ordenados.length) {
    const [usuario] = ordenados[0];
    return { status: 'ok', url: `https://www.instagram.com/${usuario}/`, usuario: `@${usuario}`, mensagem: '', descartados };
  }
  return { status: 'nao_encontrado', url: null, usuario: null, mensagem: 'não encontrado', descartados };
}
