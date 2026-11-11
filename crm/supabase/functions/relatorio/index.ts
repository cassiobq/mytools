// Edge Function "relatorio": monta os fatos do período (com o login de quem chamou, sob RLS) e pede à
// Claude o texto do relatório de prospecção. Os números vêm de fatos.js; a IA só escreve.
// Segredo necessário: ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets).
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { montarFatos } from './fatos.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const SISTEMA = `Você redige relatórios de prospecção comercial do Departamento de Expansão e Frotas, em português do Brasil.
O leitor é a gestão comercial: quer entender, em poucos minutos, o que foi feito no campo, o que deu certo, o que travou e o que vem a seguir.

Como ler os dados:
- Funil: Lead (empresa abordada) > MQL (2ª reunião agendada) > SQL (em cotação) > Venda > Associado (contrato assinado).
  Lead e MQL contam empresas (esforço do vendedor); SQL, Venda e Associado contam veículos (necessidade do cliente).
- "mercado" é a pesquisa feita nas abordagens: veículos, quantos segurados, seguradora, nota de 0 a 5 e por que não protegeram.
  Use-o no "panorama" para a leitura do mercado (concorrência, satisfação, objeções).
- "fora_do_perfil" marca empresas sem veículos ou satisfeitas com o seguro atual (voltam no vencimento).

Estilo (siga o modelo da empresa):
- Frases curtas e objetivas, em tom profissional e direto, contando a história do trabalho de prospecção.
- Em cada visita: quem atendeu (se a observação disser), o que aconteceu, um "status" claro e, quando houver, a oportunidade.
- Exemplo de tom para uma visita: pontos "Possui frota de 6 carros, todos protegidos pela concorrência."; status "parceiro da concorrência. Oportunidade de oferecer condição competitiva para a frota."

Regras que não podem ser quebradas:
- Use somente os fatos fornecidos. Não invente nomes, números, valores, empresas, cidades, datas ou acontecimentos.
- Os números do período já estão calculados em "numeros": cite-os exatamente como estão; não recalcule nem estime.
- Nomes de empresas que começam com "_" são dados de teste: escreva-os exatamente como vieram.
- Se um fato não estiver nos dados (por exemplo, o nome de quem atendeu), deixe o campo vazio em vez de supor.
- Oportunidades e próximos passos devem sair dos dados (resultado, situação, próximo passo, observações), sem promessas.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo_executivo', 'panorama', 'visitas', 'oportunidades', 'proximos_passos', 'conclusao'],
  properties: {
    resumo_executivo: { type: 'array', items: { type: 'string' }, description: '1 a 3 parágrafos' },
    panorama: { type: 'array', items: { type: 'string' }, description: 'Tópicos sobre o que se viu no campo no período (padrões nas observações, cidades, objeções)' },
    visitas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lead_id', 'contato', 'pontos', 'status', 'oportunidade'],
        properties: {
          lead_id: { type: 'string' },
          contato: { type: 'string', description: 'Quem atendeu, se as observações disserem; senão vazio' },
          pontos: { type: 'array', items: { type: 'string' } },
          status: { type: 'string' },
          oportunidade: { type: 'string', description: 'Vazio se não houver' },
        },
      },
    },
    oportunidades: { type: 'array', items: { type: 'string' } },
    proximos_passos: { type: 'array', items: { type: 'string' } },
    conclusao: { type: 'array', items: { type: 'string' }, description: '1 ou 2 parágrafos' },
  },
};

async function buscarTudo(sb: ReturnType<typeof createClient>, tabela: string) {
  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('*').range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);

  let corpo: { inicio?: string; fim?: string; simular?: boolean };
  try { corpo = await req.json(); } catch { return json({ erro: 'Corpo inválido.' }, 400); }
  const { inicio, fim, simular } = corpo;
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (!inicio || !fim || !data.test(inicio) || !data.test(fim) || inicio > fim) {
    return json({ erro: 'Informe início e fim (AAAA-MM-DD), com início antes do fim.' }, 400);
  }

  // Cliente com o login de quem chamou: o RLS garante que só os dados dele entram no relatório.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: usuario, error: erroUsuario } = await sb.auth.getUser();
  if (erroUsuario || !usuario?.user) return json({ erro: 'Faça login de novo.' }, 401);

  let fatos;
  try {
    const [leads, contatos] = await Promise.all([buscarTudo(sb, 'leads'), buscarTudo(sb, 'contatos')]);
    fatos = montarFatos(leads, contatos, inicio, fim);
  } catch (e) {
    return json({ erro: `Falha ao ler os dados: ${(e as Error).message}` }, 500);
  }
  if (!fatos.empresas.length) return json({ erro: 'Nenhum contato registrado nesse período.' }, 404);
  if (simular) return json({ fatos, texto: null });

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return json({ erro: 'Falta configurar a chave da IA (ANTHROPIC_API_KEY) no Supabase.', fatos }, 503);

  const client = new Anthropic({ apiKey: chave, timeout: 120_000, maxRetries: 1 });
  try {
    const resposta = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // se a Claude Opus 5.5 recusar, o próprio servidor tenta o modelo recomendado
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{
        role: 'user',
        content: `Escreva o relatório de prospecção do período ${fatos.periodo.inicio} a ${fatos.periodo.fim}.\n` +
          `Em "visitas", inclua uma entrada para cada empresa de "empresas", na mesma ordem, com o mesmo lead_id.\n\n` +
          `Dados (JSON):\n${JSON.stringify(fatos)}`,
      }],
    } as never) as Anthropic.Message;

    if (resposta.stop_reason === 'refusal') {
      return json({ erro: 'A IA recusou escrever este relatório. Tente outro período.', fatos }, 502);
    }
    if (resposta.stop_reason === 'max_tokens') {
      return json({ erro: 'Período grande demais para um relatório só. Escolha um intervalo menor.', fatos }, 413);
    }
    const texto = resposta.content.find((b) => b.type === 'text');
    if (!texto || texto.type !== 'text') return json({ erro: 'A IA não devolveu texto.', fatos }, 502);
    return json({ fatos, texto: JSON.parse(texto.text), modelo: resposta.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: 'Chave da IA inválida. Confira ANTHROPIC_API_KEY no Supabase.', fatos }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ erro: 'Limite de uso da IA atingido. Tente em alguns minutos.', fatos }, 429);
    if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status}): ${e.message}`, fatos }, 502);
    return json({ erro: `Falha ao gerar o texto: ${(e as Error).message}`, fatos }, 502);
  }
});
