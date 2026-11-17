# Instruções para o Claude neste repositório (cassiobq/mytools)

Projetos: `crm/` (micro CRM de prospecção — PWA Next.js + Supabase + Vercel), `ficha-empresa/`
(ficha de empresa por busca web + Receita), `finan/` (não mexer sem pedido).

## Branch

O CRM vive na branch **`claude/youthful-thompson-048mjl`** (o `main` não tem o CRM; não há PR, o
usuário não quer PR/merge por enquanto). Se a sessão recebeu outra branch de trabalho, **comece dela a
partir desta**: `git fetch origin claude/youthful-thompson-048mjl && git checkout -B <sua-branch>
origin/claude/youthful-thompson-048mjl`, e trabalhe/empurre na sua branch. Faça deploy a partir da
branch onde está o código (ver Deploy).

## Como trabalhar com o usuário (Cássio)

- Fale **português do Brasil**, simples e direto; nada de jargão técnico sem explicar. Ele usa pelo
  **celular** (Android), na maior parte do tempo.
- **Plano antes de construir:** para qualquer mudança de comportamento, mostre o plano e espere o "ok".
  Quando ele pedir só para planejar, **não modifique nada**.
- **Uma pergunta por vez** quando precisar de decisão; sempre com a sua recomendação.
- **Pare ao fim de cada etapa** do PRD e mostre o que foi feito e testado antes de seguir.
- Pense no **uso real em campo**: poucos toques, letras grandes, nada que atrase uma visita.
- Ao terminar: diga o que rodou e passou, o que **não** foi testado e o que falta ele fazer.
- O CRM é um **termômetro do processo de vendas e do mercado** e organiza a agenda. Ele **não diz ao
  vendedor o que fazer** (sem scripts, sem trilhas de mensagens). Cotações em si ficam no CRM da Valle.

## Regras do CRM que não mudam

- **Regra nº 1:** só mostrar "salvo" depois que o banco confirmou; sem sinal fica "pendente" na fila do
  aparelho e é reenviado sozinho; o id é gerado no cliente (reenvio nunca duplica).
- **Nada é apagado** pela aplicação: arquivar/bandeira/perdido. RLS em todas as tabelas, só o dono.
- Funil: Lead (empresa abordada) → MQL (2ª reunião agendada) → SQL (em cotação) → Venda → Associado.
  Lead e MQL em **empresas**; SQL, Venda e Associado em **veículos**. Tudo por eventos em `contatos`.
- Só PAP empresas. A cidade vem da **ação de vendas** ativa (a última criada).
- Dados fictícios de teste têm empresa começando com `_` e são removíveis por `crm/supabase/mock/`.

## Infra e lições aprendidas

- Supabase `oqxzggcmjqgrdfddgjwd` (projeto micro-crm). Ferramentas MCP do Supabase que mudam dados
  (`apply_migration`, `execute_sql` com insert/update/delete) **pedem aprovação do usuário e quase
  sempre expiram**. Para DDL ou deletes: escreva o SQL em `crm/supabase/manual/` (ou `migrations/`),
  mande o link "raw" do GitHub para ele rodar no **SQL Editor**, e depois **confira com uma consulta de
  leitura**. Consultas só de leitura funcionam normalmente.
- Antes de apagar qualquer coisa, consulte e mostre o que será apagado, separando dados reais de teste.
- Deploy do CRM: Vercel projeto `micro-crm` (prj_8izvE3mETDxr7yWbHrVeyFgDnc72, time
  team_YKrCqziCmlH5jPNTIhUnR9lQ), via `create_deployment` com `gitSource` `{type:"github", org:"cassiobq",
  repo:"mytools", ref:<branch>, sha:<commit>}` e `target:"production"`. URL: https://micro-crm-virid.vercel.app
- Edge Functions no Supabase: `relatorio`, `agenda` (deploy com `deploy_edge_function`, arquivos inteiros).
- Edge Function `mcp` (conector do Claude, OAuth do Supabase Auth): deploy com `verify_jwt: false` e TODOS os arquivos de
  `crm/supabase/functions/mcp/` (inclusive `lib/`). A pasta `mcp/lib/` é cópia de `crm/lib/`: depois de mudar a lógica, rode
  `node crm/scripts/copiar-lib-mcp.mjs` (o teste acusa cópia velha). Depois do deploy, baixe com `get_edge_function` e compare.
  Cabeçalhos HTTP (ex.: WWW-Authenticate) só com ASCII: acento faz o cabeçalho sumir.
- Segredos (chave Serper, ANTHROPIC_API_KEY, senha das contas de teste) **nunca** no repositório nem no
  chat: peça pelo formulário seguro (`request_credential`) ou para ele salvar no painel do serviço.
- O service worker (`crm/public/sw.js`) precisa de `VERSAO` nova e da lista `PAGINAS` atualizada quando
  uma tela nova é criada.

## Testes (rode antes de dizer que está pronto)

- `cd crm && npm test` (lógica pura, `TZ=America/Sao_Paulo`).
- Ponta a ponta com Playwright contra o Supabase real (contas teste1/teste2), em `crm/e2e/`:
  `persistencia.cjs`, `telas.cjs`, `relatorio.cjs`. Servir o build com
  `cd crm/out && python3 -m http.server 4400` e passar `CRM_URL`, `SUPABASE_URL`, `SUPABASE_KEY`,
  `TESTE_EMAIL`, `TESTE2_EMAIL`, `TESTE_SENHA`, `PLAYWRIGHT_PATH=/opt/node-tools/node_modules/playwright`.
  Depois do deploy, rode de novo com `CRM_URL=https://micro-crm-virid.vercel.app`.

## Trabalho em andamento

**Secretária CRM** (Claude no celular como interface do CRM): especificação em
`crm/docs/PRD-secretaria-crm.md` (decisões do usuário já fechadas — não reabrir sem motivo).
Comece pela etapa 0 e pare para aprovação ao fim de cada etapa.
