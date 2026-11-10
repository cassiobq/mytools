-- Micro CRM: leads (estado atual de cada empresa) e contatos (histórico de cada visita/retorno).
-- Regras: id gerado no app (reenvio da fila offline nunca duplica); nada é apagado (campo "arquivado");
-- RLS: cada usuário só enxerga e grava as próprias linhas; não existe policy de DELETE.

create table public.leads (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem text not null check (origem in ('abordagem', 'indicacao')),
  indicado_por text,
  empresa text not null check (length(trim(empresa)) > 0),
  cidade text,
  n_veiculos integer check (n_veiculos is null or n_veiculos >= 0),
  tipo text check (tipo in ('PF', 'frota')),
  estrategia text check (estrategia in ('visita_agenda', 'visita_fecha', 'ligacao')),
  falou_decisor boolean,
  resultado text check (resultado in ('sem_interesse', 'agendou', 'cotacao', 'venda')),
  faixa_cadencia text check (faixa_cadencia in ('1_dono_ausente', '2_ja_tem_seguro', '3_recusou', '4_interessado', 'indicacao')),
  vencimento_seguro date,
  proximo_passo text,
  data_proximo_passo date,
  motivo_nao text,
  observacao text,
  arquivado boolean not null default false
);

create table public.contatos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  lead_id uuid not null references public.leads (id),
  data timestamptz not null default now(),
  resultado text check (resultado in ('sem_interesse', 'agendou', 'cotacao', 'venda')),
  observacao text
);

create index leads_user_idx on public.leads (user_id);
create index leads_proximo_idx on public.leads (user_id, data_proximo_passo) where not arquivado;
create index contatos_lead_idx on public.contatos (lead_id);
create index contatos_user_data_idx on public.contatos (user_id, data);

-- atualizado_em automático
create function public.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
create trigger leads_atualizado_em before update on public.leads
  for each row execute function public.tocar_atualizado_em();

-- RLS: só o dono da linha
alter table public.leads enable row level security;
alter table public.contatos enable row level security;

create policy "leads: ler as minhas" on public.leads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "leads: criar as minhas" on public.leads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "leads: alterar as minhas" on public.leads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "contatos: ler os meus" on public.contatos for select to authenticated
  using (user_id = (select auth.uid()));
create policy "contatos: criar os meus" on public.contatos for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())));
create policy "contatos: alterar os meus" on public.contatos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ninguém anônimo acessa; sem DELETE para ninguém pela API.
revoke all on public.leads, public.contatos from anon;
revoke delete, truncate on public.leads, public.contatos from authenticated;
