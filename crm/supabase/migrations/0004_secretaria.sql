-- Micro CRM v4 (Secretária CRM): enriquecimento da empresa, id do evento no Google Agenda,
-- contato de relacionamento, intervalos de relacionamento e agenda em blocos de 30 min.
-- Nada é apagado; só acrescenta. Pode rodar de novo sem efeito.

-- Enriquecimento (dados públicos: Receita, Google, Maps) e evento do Google Agenda.
alter table public.leads
  add column if not exists cnpj text,
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists situacao_cadastral text,
  add column if not exists data_abertura date,
  add column if not exists socios jsonb,             -- [{nome, qualificacao}]
  add column if not exists cnae jsonb,               -- {codigo, descricao}
  add column if not exists porte text,
  add column if not exists endereco text,
  add column if not exists telefones jsonb,          -- ["(64) 3...", ...]
  add column if not exists instagram text,
  add column if not exists maps_url text,
  add column if not exists enriquecido_em timestamptz,
  add column if not exists enriquecimento text
    check (enriquecimento is null or enriquecimento in ('ok', 'ambiguo', 'nao_encontrado', 'erro')),
  add column if not exists google_event_id text;     -- evento do Google criado pelo Claude

create index if not exists leads_user_cnpj_idx on public.leads (user_id, cnpj);

-- Contato curto de relacionamento (anotação + próxima data).
alter table public.contatos drop constraint if exists contatos_evento_check;
alter table public.contatos add constraint contatos_evento_check check (evento in (
  'abordagem', 'retorno', 'mql', 'no_show', 'sql', 'venda', 'associado', 'perda', 'reativacao',
  'relacionamento'));

-- Intervalo de relacionamento (dias): lead sem data marcada volta à agenda quando
-- último contato + intervalo <= hoje. Satisfeito (nota 4–5) volta só no vencimento (null).
alter table public.config
  add column if not exists relacionamento jsonb not null default
    '{"sem_seguro": 15, "insatisfeito": 30, "satisfeito": null, "perdido": 90, "associado": 90}'::jsonb;

-- Agenda em blocos de 30 min: padrão novo e quem ainda está no padrão antigo (60).
alter table public.config alter column agenda set default
  '{"dias": [1, 2, 3, 4, 5], "faixas": [["09:00", "12:00"], ["14:00", "17:00"]], "duracao": 30}'::jsonb;
update public.config set agenda = jsonb_set(agenda, '{duracao}', '30')
  where (agenda->>'duracao')::int = 60;
