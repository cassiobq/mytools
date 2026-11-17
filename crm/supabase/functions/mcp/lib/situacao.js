// Situação do lead numa linha (para a secretária falar e o cartão do app mostrar) + alertas.
// Só descreve: nunca sugere o que fazer.
import { rotuloEtapa, esfriando, tentativasSemDecisor } from './etapas.js';
import { hojeISO, deISO, paraISO } from './datas.js';
import { ultimoContato } from './relacionamento.js';

const ddmm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const mmaaaa = (iso) => { const [a, m] = String(iso).slice(0, 7).split('-'); return `${m}/${a}`; };
const diasEntre = (de, ate) => Math.round((deISO(ate) - deISO(de)) / 86400000);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function veiculos(l) {
  if (l.n_veiculos == null) return null;
  const n = l.veiculos_mais ? `${l.n_veiculos}+ veículos` : plural(l.n_veiculos, 'veículo', 'veículos');
  if (l.n_veiculos === 0 || l.n_segurados == null) return n;
  const seg = [l.seguradora, l.nota_seguro != null ? `nota ${l.nota_seguro}` : null, l.vencimento_seguro ? `vence ${mmaaaa(l.vencimento_seguro)}` : null].filter(Boolean);
  return `${n}, ${l.n_segurados} ${l.n_segurados === 1 ? 'segurado' : 'segurados'}${seg.length ? ` (${seg.join(', ')})` : ''}`;
}

function dadosPublicos(l) {
  const p = [];
  if (l.cnpj) p.push(`CNPJ ${l.cnpj}${l.situacao_cadastral ? ` ${l.situacao_cadastral.toLowerCase()}` : ''}`);
  const socios = Array.isArray(l.socios) ? l.socios.map((s) => (typeof s === 'string' ? s : s?.nome)).filter(Boolean) : [];
  if (socios.length) p.push(`${socios.length === 1 ? 'sócio' : 'sócios'}: ${socios.join(', ')}`);
  return p.length ? `dados públicos: ${p.join(', ')}` : null;
}

// contatosDoLead: os contatos deste lead. opcoes: { hoje, diasEsfriando }.
export function situacaoLead(l, contatosDoLead = [], { hoje = hojeISO(), diasEsfriando = 7 } = {}) {
  const cs = [...contatosDoLead].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const ultimo = cs.length ? ultimoContato(l, cs) : null;
  const obs = [...cs].reverse().find((c) => c.observacao?.trim())?.observacao.trim();
  const abordagem = cs.find((c) => c.evento === 'abordagem')?.data || l.criado_em;
  const decisor = l.decisor_nome ? `decisor ${l.decisor_nome}${l.decisor_whatsapp ? ` (${l.decisor_whatsapp})` : ''}` : null;

  let contato = null;
  if (ultimo) {
    const d = diasEntre(ultimo, hoje);
    contato = `último contato ${d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`}${obs ? `: "${obs}"` : ''}`;
  }

  const partes = [
    l.empresa, l.cidade, rotuloEtapa(l.etapa), decisor, veiculos(l),
    l.motivo_sem_seguro ? `sem seguro: ${l.motivo_sem_seguro}` : null,
    contato, cs.length ? plural(cs.length, 'contato', 'contatos') : null,
    abordagem ? `abordado em ${ddmm(paraISO(new Date(abordagem)))}` : null,
    dadosPublicos(l),
  ];

  const alertas = [];
  if (l.situacao_cadastral && !/^ativa$/i.test(l.situacao_cadastral.trim())) alertas.push(`Empresa ${l.situacao_cadastral.toLowerCase()} na Receita`);
  const tent = tentativasSemDecisor(cs);
  if (tent >= 3) alertas.push(`${tent} tentativas sem decisor`);
  const frio = esfriando(l, cs, diasEsfriando, hoje);
  if (frio) alertas.push(`Esfriando: ${frio} dias sem contato`);
  if (l.bandeira) alertas.push(`🚩 ${l.motivo_bandeira || 'Fora do perfil'}`);

  return { linha: partes.filter(Boolean).join(' · '), alertas };
}
