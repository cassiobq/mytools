// Lugar do Google Maps (painel da empresa): escolha e confirmação de CNPJ por telefone/endereço.
import { compararNomes, normalizar } from './texto.js';

// Cidade citada no endereço do Google ("Rua X, 10 - Centro, Jataí - GO, 75800-000" -> "Jataí"), se houver.
export function cidadeDoEndereco(endereco) {
  const m = String(endereco ?? '').match(/(?:^|[,-])\s*([^,-]+?)\s*-\s*[A-Z]{2}\b(?!.*\s-\s*[A-Z]{2}\b)/);
  return m ? m[1].trim() : null;
}

// O lugar precisa ter nome parecido com o digitado e não estar em outra cidade.
// O Google às vezes devolve só "Rua X, 177", sem a cidade: aceita, porque a busca já foi feita com a cidade.
export function escolherLocal(locais, nome, cidade) {
  const cidadeNorm = normalizar(cidade);
  return (locais ?? []).find((l) => {
    if (!compararNomes(nome, l.titulo).parecido) return false;
    const citada = cidadeDoEndereco(l.endereco);
    return !citada || normalizar(citada) === cidadeNorm;
  }) ?? null;
}

export function linkMapsPorCid(cid) {
  return /^\d{5,25}$/.test(String(cid)) ? `https://maps.google.com/?cid=${cid}` : null;
}

const digitos = (s) => String(s ?? '').replace(/\D/g, '');
const PALAVRAS_DE_LOGRADOURO = new Set(['rua', 'avenida', 'av', 'r', 'alameda', 'travessa', 'rodovia', 'praca', 'quadra', 'lote', 'setor', 'centro']);

// Confirma que um CNPJ (dados da Receita) é o mesmo estabelecimento do Google Maps.
// Telefone: últimos 8 dígitos iguais. Endereço: mesmo número e pelo menos duas palavras do logradouro.
export function confirmarPorLocal(dados, local) {
  if (!local) return null;
  const telLocal = digitos(local.telefone);
  if (telLocal.length >= 8) {
    for (const t of [dados?.ddd_telefone_1, dados?.ddd_telefone_2]) {
      const d = digitos(t);
      if (d.length >= 8 && telLocal.endsWith(d.slice(-8))) return 'telefone';
    }
  }
  const numero = digitos(dados?.numero).replace(/^0+/, '');
  const endLocal = normalizar(local.endereco);
  if (numero && new RegExp(`(^|\\D)${numero}(\\D|$)`).test(endLocal)) {
    const palavrasEnd = new Set(endLocal.split(' '));
    const palavrasRua = normalizar(dados?.logradouro).split(' ').filter((p) => p.length >= 4 && !PALAVRAS_DE_LOGRADOURO.has(p));
    if (palavrasRua.filter((p) => palavrasEnd.has(p)).length >= Math.min(2, palavrasRua.length) && palavrasRua.length) return 'endereço';
  }
  return null;
}
