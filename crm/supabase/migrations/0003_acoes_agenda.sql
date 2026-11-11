-- Micro CRM v3: ações de vendas (local da prospecção; a cidade é da ação) e agenda (iCal + horários de trabalho).
-- Nada é apagado; só acrescenta.

create table public.acoes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  criado_em timestamptz not null default now(),
  cidade text not null check (length(trim(cidade)) > 0),
  endereco text,
  finalizada_em timestamptz            -- preenchida quando uma ação nova é criada
);
create index acoes_user_idx on public.acoes (user_id, criado_em);

alter table public.leads add column acao_id uuid references public.acoes (id);
create index leads_acao_idx on public.leads (acao_id);

-- Agenda: endereço secreto iCal do Google Agenda e horários de trabalho para os horários livres.
alter table public.config
  add column ical_url text check (ical_url is null or ical_url ~ '^https://'),
  add column agenda jsonb not null default '{"dias": [1, 2, 3, 4, 5], "faixas": [["09:00", "12:00"], ["14:00", "17:00"]], "duracao": 60}'::jsonb;

alter table public.acoes enable row level security;
create policy "acoes: ler as minhas" on public.acoes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "acoes: criar as minhas" on public.acoes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "acoes: alterar as minhas" on public.acoes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.acoes from anon;
revoke delete, truncate on public.acoes from authenticated;

-- A ação do lead precisa ser do mesmo usuário.
create or replace function public.conferir_acao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.acao_id is not null and not exists (
    select 1 from public.acoes a where a.id = new.acao_id and a.user_id = new.user_id) then
    raise exception 'acao_id de outro usuário';
  end if;
  return new;
end $$;
create trigger leads_conferir_acao before insert or update on public.leads
  for each row execute function public.conferir_acao();
