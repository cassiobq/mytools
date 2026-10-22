// Minha Receita (https://docs.minhareceita.org/): GET https://minhareceita.org/{cnpj}
import { fetchComTimeout } from './http.js';
import { somenteDigitos, formatarCnpj } from './cnpj.js';
import { normalizar } from './texto.js';

export async function consultarReceita(cnpj) {
  const d = somenteDigitos(cnpj);
  const resp = await fetchComTimeout(`https://minhareceita.org/${d}`, { headers: { Accept: 'application/json' } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Minha Receita respondeu HTTP ${resp.status}`);
  return resp.json();
}

export function estaBaixada(dados) {
  return Number(dados?.situacao_cadastral) === 8 || normalizar(dados?.descricao_situacao_cadastral).includes('baixada');
}

export function estaAtiva(dados) {
  return Number(dados?.situacao_cadastral) === 2;
}

// Nome exibido: nome fantasia (ou razão social se vazio) + " BAIXADA" quando for o caso.
export function nomeExibido(dados) {
  const base = String(dados?.nome_fantasia ?? '').trim() || String(dados?.razao_social ?? '').trim();
  return estaBaixada(dados) ? `${base} BAIXADA` : base;
}

// Sócio: nome_socio do PRIMEIRO item do qsa. Sem qsa (empresário individual/MEI),
// usa o nome da razão social sem o CPF que costuma vir no fim.
export function extrairSocio(dados) {
  const primeiro = Array.isArray(dados?.qsa) ? dados.qsa.find((s) => s?.nome_socio) : null;
  if (primeiro) return { status: 'ok', nome: primeiro.nome_socio.trim(), origem: 'qsa', mensagem: '' };
  const nome = String(dados?.razao_social ?? '').replace(/[\d.\-/\s]+$/, '').trim();
  if (nome) return { status: 'ok', nome, origem: 'razão social', mensagem: 'Sem quadro societário; nome tirado da razão social.' };
  return { status: 'nao_encontrado', nome: null, origem: null, mensagem: 'não encontrado' };
}

export function resumirEmpresa(dados) {
  const tipo = String(dados?.descricao_tipo_de_logradouro ?? '').trim();
  const logradouro = String(dados?.logradouro ?? '').trim();
  return {
    cnpj: somenteDigitos(dados?.cnpj),
    cnpj_formatado: formatarCnpj(dados?.cnpj),
    nome_fantasia: String(dados?.nome_fantasia ?? '').trim(),
    razao_social: String(dados?.razao_social ?? '').trim(),
    nome_exibido: nomeExibido(dados),
    baixada: estaBaixada(dados),
    situacao_cadastral: Number(dados?.situacao_cadastral) || null,
    situacao: String(dados?.descricao_situacao_cadastral ?? '').trim(),
    // Evita "AVENIDA AVENIDA X" quando o tipo já vem no logradouro.
    logradouro: tipo && !normalizar(logradouro).startsWith(normalizar(tipo)) ? `${tipo} ${logradouro}` : logradouro,
    numero: String(dados?.numero ?? '').trim(),
    bairro: String(dados?.bairro ?? '').trim(),
    cep: String(dados?.cep ?? '').trim(),
    municipio: String(dados?.municipio ?? '').trim(),
    uf: String(dados?.uf ?? '').trim(),
  };
}
