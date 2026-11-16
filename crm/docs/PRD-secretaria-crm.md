# PRD — Secretária CRM (Claude como interface do micro CRM)

Status: aprovado pelo usuário em 16/11/2026. Plano legível (para o usuário): Claude Docs
"Secretária CRM — plano" — https://claude.ai/artifact/7fXoddnusp1nwjsRqnhkTi
Este arquivo é a especificação para quem vai construir (uma nova sessão do Claude Code).
Idioma de tudo o que o usuário vê: português do Brasil.

## 1. Objetivo

O usuário (vendedor de campo, prospecção PAP de empresas, Android, plano Claude Pro) passa a usar o
**app do Claude no celular** como secretária: dita o que aconteceu, a secretária confirma, grava no CRM,
marca na agenda do Google e responde quem procurar e como está cada lead. Ela **não diz o que fazer**:
organiza **quem** e **quando**, com a situação de cada lead.

O app atual (PWA) continua como **backup** (sem sinal, Painel, filtros), lendo e gravando o mesmo banco.

## 2. Estado atual (o que já existe — leia antes de mexer)

- Repositório `cassiobq/mytools`, pasta `crm/`, branch de trabalho `claude/youthful-thompson-048mjl`
  (o `main` não tem o CRM; não há PR). Produção: https://micro-crm-virid.vercel.app
  (Vercel: projeto `micro-crm` prj_8izvE3mETDxr7yWbHrVeyFgDnc72, time team_YKrCqziCmlH5jPNTIhUnR9lQ,
  root `crm`; deploy feito por `create_deployment` com `gitSource.ref` = a branch acima).
- Supabase: projeto `micro-crm` id `oqxzggcmjqgrdfddgjwd` (sa-east-1). Usuário real:
  c7d2c712-7d3f-436b-b1c2-f50b0a26dd1e. Contas de teste (e2e): teste1/teste2.crm@exemplo.invalid,
  com senha (para os e2e); a senha não fica no repositório — peça ao usuário ou redefina pelo Supabase.
- Next.js 16 export estático + React 19; `crm/README.md` descreve telas, funil, testes e backup.
- Migrações: `0001_schema`, `0002_funil_v2`, `0003_acoes_agenda` (as duas últimas foram rodadas pelo
  usuário no SQL Editor; só a 0001 aparece em `schema_migrations`).
  **Importante:** `apply_migration`/`execute_sql` que mudam dados pedem aprovação do usuário e
  costumam expirar. Para DDL e deletes, gere o SQL em `crm/supabase/manual/` e peça ao usuário para
  rodar no SQL Editor; depois confira com uma consulta de leitura.
- Tabelas: `leads` (pesquisa: decisor, WhatsApp, n_veiculos/veiculos_mais, n_segurados, seguradora,
  vencimento_seguro, nota_seguro, motivo_sem_seguro, bandeira/motivo_bandeira, etapa, proximo_tipo,
  data/hora_proximo_passo, lead_pai_id, acao_id, arquivado), `contatos` (evento, etapa, veiculos,
  decisor, motivo, observacao), `acoes` (cidade, endereco, finalizada_em), `config` (metas jsonb com
  `cadencia`, dias_esfriando, ical_url, agenda jsonb). RLS em tudo, sem DELETE pela API.
- Lógica pura reaproveitável (testada, `crm/test/*.mjs`, 23 testes): `lib/pesquisa.js` (caminho da
  pesquisa, bandeira, lead dos segurados), `lib/etapas.js` (follow-up MQL/SQL/Venda/Associado, perda,
  reativar, agenda, esfriando), `lib/acoes.js`, `lib/painel.js` (funil por eventos, metas, simulador,
  mercado), `lib/agenda.js` (horários livres), `supabase/functions/agenda/ical.js`.
- Edge Functions: `relatorio` (fatos + texto da Claude; falta ANTHROPIC_API_KEY) e `agenda` (iCal).
- Ficha Empresa: `ficha-empresa/` (Vercel, https://ficha-empresa.vercel.app, `POST /api/ficha`
  `{empresas:[...], cidade}`): Serper (Google) + Minha Receita + Google Maps. `lib/ficha.js`
  (`gerarFicha`), `lib/receita.js`, `lib/busca.js`, `lib/maps.js`. Chave `SERPER_API_KEY` no Vercel.
- Regras que não mudam: **Regra nº 1** (só diz "salvo" depois que o banco confirmou), **nada é
  apagado** (arquivar), **id gerado no cliente** (reenvio não duplica), RLS por usuário.

## 3. Decisões do usuário (fechadas)

| Tema | Decisão |
| --- | --- |
| Interface | App do Claude (chat) no celular, num Projeto "Secretária CRM". Claude Code só para construir. Cowork não. |
| Agenda | Google Agenda pessoal (Gmail) pelo conector do Google do Claude. |
| App atual | Fica como backup. |
| Sem sinal | Raro no PJ. Usuário dita offline no Gboard e cola no Claude depois. Claude não transcreve arquivo de áudio. |
| Leads sem data | Voltam sozinhos à agenda por intervalo de relacionamento editável: sem seguro 15 d, insatisfeito (nota 0–3) 30 d, satisfeito (🚩 nota 4–5) só no vencimento, perdido 90 d, associado 90 d. Data marcada pelo usuário sempre vale mais. |
| Contato de relacionamento | Curto: anotação + próxima data; pesquisa completa opcional. |
| Vencimento do seguro | Lembrete de dia inteiro no dia 1 do mês do vencimento. |
| Duração | Blocos de 30 min por padrão para todos os compromissos (Claude e app). |
| Enriquecimento | Automático em toda empresa nova (motor do Ficha Empresa); rodar uma vez em lote nas já cadastradas; ficha enriquecida aparece também no app. |
| Conector no Pro | Confirmar com o usuário na etapa de configuração (se não der, rever o plano). |
| Postura | Confirma antes de gravar; nunca inventa; nunca diz o que fazer. |

Horário de trabalho para horários livres: seg–sex, 09:00–12:00 e 14:00–17:00.

## 4. Arquitetura

```
App do Claude (Projeto "Secretária CRM")
   ├── Conector "Micro CRM" (MCP remoto, HTTPS)  ──>  Supabase (mesmo banco do app)
   │        └── enriquecimento  ──>  Ficha Empresa (Serper + Minha Receita + Maps)
   └── Conector Google Agenda (do próprio Claude)  ──>  agenda do usuário
App atual (PWA, backup)  ──>  Supabase
```

- **Servidor MCP**: Edge Function `mcp` no Supabase (Deno) ou função no Vercel; transporte MCP
  "Streamable HTTP". Reutiliza `lib/*.js` (são ES modules puros; copie/importe para o bundle).
- **Autenticação**: só o usuário. **A pesquisar no início (etapa 0)**: o que o app do Claude exige
  hoje de um conector personalizado (OAuth 2.1 com descoberta, DCR, ou URL sem login) e se o plano Pro
  permite. Opções: Supabase Auth como servidor OAuth (se disponível), ou um OAuth mínimo próprio com
  login por código de e-mail (o mesmo do app). Nunca usar a service role sem escopo de usuário: toda
  leitura/escrita é do `user_id` autenticado (ou RLS com o JWT do usuário).
- **Google Agenda**: quem cria/move/cancela é o Claude, pelo conector do Google. O MCP guarda o
  `google_event_id` de cada lead (o Claude passa o id depois de criar o evento) e devolve os
  compromissos que o CRM já tem num dia, para o Claude cruzar com a agenda do Google.

## 5. Ações do conector (tools MCP)

Todas em português, com descrições claras para o modelo. As que gravam: o Projeto instrui o Claude a
confirmar com o usuário antes de chamar. Toda gravação responde o que ficou salvo (Regra nº 1) ou o erro.

| Tool | Entrada (resumo) | Faz | Regras |
| --- | --- | --- | --- |
| `registrar_visita` | empresa, origem/indicado_por, falou_decisor, decisor_nome, decisor_whatsapp, veiculos (+qtd), segurados (+qtd), motivo_sem_seguro, agendou_reuniao, data/hora, seguradora, vencimento (AAAA-MM), nota, observacao, criar_lead_segurados | Cria lead na ação ativa + eventos (`opsPesquisa`) | Valida com `analisar()`; se faltar algo, devolve `falta: [...]` sem gravar. Dispara enriquecimento depois. |
| `registrar_contato` | lead_id; tipo: `relacionamento` (anotação + próxima data) \| `retorno_pesquisa` (refaz pesquisa) \| ação de etapa (`sql`, `no_show`, `retorno`, `venda`, `associado`, `perda` + veículos/motivo/data/hora) | `opsFollowup` / `opsPesquisa(modo retorno)` / novo contato curto | Novo evento `relacionamento` (migração). Devolve o compromisso a criar/mover/cancelar. |
| `agenda` | dia ou intervalo | Lista quem procurar: atrasados, compromissos (com hora), retornos por intervalo de relacionamento, esfriando; cada um com a situação (ver §6) | Só leitura. Inclui os horários já ocupados pelo CRM no período. |
| `ficha_lead` | lead_id ou nome | Tudo sobre o lead: pesquisa, enriquecimento, etapa, histórico, próximo passo, google_event_id | Só leitura |
| `buscar_leads` | texto, cidade, etapa, bandeira, nº de veículos | Lista resumida | Só leitura; aviso de nomes parecidos (para não duplicar) |
| `acao_de_vendas` | criar {cidade, rua?} \| consultar | Cria ação (finaliza abertas) ou mostra a ativa + resumo | `opsNovaAcao`, `resumoAcao` |
| `corrigir_lead` | lead_id + campos | Corrige dados sem evento de funil (`opsEditarLead`) | Só se mudar data/hora devolve compromisso a mover |
| `numeros` | semana \| mês, ação?, cidade? | Funil, metas e ritmo, gargalo, mercado | `lib/painel.js` |
| `dados_para_arquivo` | período, filtros | Linhas de leads e contatos para o Claude gerar XLSX/DOCX na conversa | Só leitura |
| `enriquecer_empresa` | lead_id (ou lote: todos sem enriquecimento) | Busca dados públicos e grava nos campos de enriquecimento | §7 |
| `vincular_evento` | lead_id, google_event_id \| null | Guarda/limpa o id do evento do Google | — |

## 6. Situação do lead (o que a agenda/ficha devolve)

Uma linha para o Claude falar e o cartão do app mostrar, sem sugerir ação:
`Empresa · cidade · etapa · decisor (WhatsApp) · N veículos, S segurados (seguradora, nota, vence MM/AAAA) ·
motivo sem seguro · último contato há X dias: "observação" · nº de contatos · abordado em DD/MM ·
dados públicos: CNPJ situação, sócio(s)`. Alertas: empresa baixada/inapta, 3ª tentativa sem decisor,
esfriando, 🚩.

## 7. Enriquecimento

- Mesmo motor do Ficha Empresa: busca Google (Serper) por nome + cidade da ação → candidatos a CNPJ
  validados → Minha Receita (aceita só cidade igual e nome parecido) → Google Maps (link, telefone,
  confirmação por telefone/endereço). Reaproveitar `ficha-empresa/lib` (preferível a chamar a API
  pública do Ficha Empresa, que não tem autenticação). `SERPER_API_KEY` como segredo do servidor MCP.
- Campos (migração): `cnpj`, `razao_social`, `nome_fantasia`, `situacao_cadastral`, `data_abertura`,
  `socios` (jsonb), `cnae` (código+descrição), `porte`, `endereco`, `telefones` (jsonb), `instagram`,
  `maps_url`, `enriquecido_em`, `enriquecimento` (status: ok | ambiguo | nao_encontrado | erro).
- **Nunca sobrescreve** o que o usuário disse (decisor, WhatsApp, nome): divergência vira aviso.
  Nada inventado: não achou com segurança → vazio/`nao_encontrado`; dois CNPJs → `ambiguo`.
- Roda depois de salvar a visita (não bloqueia a confirmação). Lote único para as empresas existentes.
  ~3 créditos Serper por empresa.

## 8. Agenda e relacionamento

- Compromissos com hora (reunião, retorno com decisor, retorno da cotação, assinatura): 30 min.
  Título `"<Tipo> – <Empresa>"`; descrição: decisor, WhatsApp, veículos, última observação, link do app.
- Vencimento: evento de dia inteiro no dia 1 do mês do vencimento.
- Horários livres: seg–sex 09–12/14–17, blocos de 30 min, menos agenda do Google, menos CRM.
- Remarcar/no-show → mover o evento; perda/arquivar → cancelar; o MCP diz ao Claude qual evento mexer.
- **Intervalo de relacionamento** (novo, `config.relacionamento` jsonb, editável em Configurações):
  lead sem data marcada volta à agenda quando `último contato + intervalo(perfil) <= hoje`.
  Perfil: sem seguro (algum veículo sem seguro), insatisfeito (nota 0–3), satisfeito (🚩 nota 4–5: só
  vencimento), perdido, associado. Função pura nova em `lib/` usada pelo app e pelo MCP; atualizar
  `estaNaAgenda` e testes.
- Mudar `AGENDA_PADRAO.duracao` para 30 (app) e o default de `config.agenda`.

## 9. Mudanças no app (backup)

- Cartão do lead com a situação completa (§6) + dados do enriquecimento.
- Contato curto ("Anotação + próxima data") ao lado do registro completo.
- Configurações: intervalos de relacionamento; duração 30 min.
- Agenda (Hoje) inclui os retornos por intervalo.

## 10. Projeto no Claude (instruções)

Escrever `crm/docs/projeto-secretaria.md` com o texto que o usuário cola no Projeto: papel (secretária,
não consultora), fluxo de visita (perguntar só o que faltar, uma coisa por vez; ler de volta; gravar só
com "ok"), regras do funil e da pesquisa, uso do Google Agenda (horários livres, 30 min, títulos),
o que nunca fazer (inventar, apagar, sugerir abordagem), formato curto das respostas, dados fictícios
começam com "_".

## 11. Etapas (cada uma termina testada)

0. Pesquisar requisitos atuais de conector personalizado no app do Claude (plano Pro, auth, transporte).
1. Migração 0004 (enriquecimento, google_event_id, evento `relacionamento`, config.relacionamento,
   agenda 30 min) — SQL manual para o usuário rodar.
2. Lógica pura nova (relacionamento, situação do lead, contato curto) + testes.
3. Servidor MCP com as tools + testes contra o banco (contas de teste).
4. Enriquecimento (reuso do Ficha Empresa) + lote nas empresas existentes.
5. Ajustes no app (§9) + e2e (`crm/e2e/*.cjs`) + deploy.
6. Instruções do Projeto + configuração com o usuário no celular.
7. Teste real de um dia; ajustes.

## 12. Critérios de aceite

- Ditar uma visita completa → Claude confirma → lead, eventos e compromisso criados; enriquecimento
  em até ~1 min; aparece igual no app.
- "Quem eu procuro hoje?" devolve atrasados, compromissos com hora, retornos por intervalo e esfriando,
  com a situação de cada um, sem sugestões.
- Remarcar move o evento; perda cancela; nada é apagado no banco.
- Horários oferecidos nunca conflitam com a agenda do Google nem com o CRM.
- Outro usuário não acessa nada (RLS / auth do conector).
- Testes: `npm test` e os e2e passam; nenhuma regressão no app.
