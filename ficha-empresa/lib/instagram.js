// Escolhe o perfil de Instagram entre os resultados de busca. Nunca chuta: sem certeza, null.
import { compactar, tokensSignificativos, normalizar } from './texto.js';

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

// "Relação clara": todos os tokens significativos do nome aparecem no @ (sem pontos/underscores)
// ou o título traz o nome inteiro junto com o mesmo @.
function avaliar(nome, usuario, titulo) {
  const tokens = tokensSignificativos(nome);
  if (!tokens.length) return 0;
  const userCompacto = compactar(usuario);
  if (tokens.every((t) => userCompacto.includes(t))) return 2;
  const tituloNorm = normalizar(titulo);
  const tituloTemUsuario = tituloNorm.includes(normalizar(usuario)) || compactar(titulo).includes(userCompacto);
  if (tituloTemUsuario && tokens.every((t) => tituloNorm.split(' ').includes(t))) return 1;
  return 0;
}

export function encontrarInstagram(resultados, nome) {
  const vistos = new Map();
  for (const r of resultados ?? []) {
    const usuario = usuarioDoPerfil(r.url);
    if (!usuario || vistos.has(usuario)) continue;
    vistos.set(usuario, avaliar(nome, usuario, r.titulo));
  }
  // Prefere match pelo @; entre iguais, mantém a ordem da busca.
  for (const nivel of [2, 1]) {
    const achado = [...vistos].find(([, nota]) => nota === nivel);
    if (achado) {
      return { status: 'ok', url: `https://www.instagram.com/${achado[0]}/`, usuario: `@${achado[0]}`, mensagem: '' };
    }
  }
  return { status: 'nao_encontrado', url: null, usuario: null, mensagem: 'não encontrado' };
}
