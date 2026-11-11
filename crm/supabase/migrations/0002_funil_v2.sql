-- Micro CRM v2: pesquisa da abordagem (veículos, seguro, satisfação), etapas do funil
-- (Lead > MQL > SQL > Venda > Associado), follow-up com hora e tipo, bandeira, metas.
-- Nada é apagado: as colunas antigas (tipo, estrategia, resultado, faixa_cadencia) ficam, só deixam de ser usadas.

alter table public.leads
  add column decisor_nome text,
  add column decisor_whatsapp text,
  add column veiculos_mais boolean not null default false,         -- "4+" sem o número exato
  add column n_segurados integer check (n_segurados is null or n_segurados >= 0),
  add column seguradora text,
  add column nota_seguro smallint check (nota_seguro is null or nota_seguro between 0 and 5),
  add column motivo_sem_seguro text,
  add column bandeira boolean not null default false,               -- fora do perfil
  add column motivo_bandeira text,
  add column etapa text not null default 'lead' check (etapa in ('lead', 'mql', 'sql', 'venda', 'associado', 'perdido')),
  add column proximo_tipo text check (proximo_tipo in ('retorno', 'reuniao', 'vencimento', 'negociacao', 'contrato')),
  add column hora_proximo_passo time,
  add column lead_pai_id uuid references public.leads (id);         -- lead dos veículos segurados (retorno no vencimento)

alter table public.contatos
  add column evento text check (evento in ('abordagem', 'retorno', 'mql', 'no_show', 'sql', 'venda', 'associado', 'perda', 'reativacao')),
  add column etapa text check (etapa in ('lead', 'mql', 'sql', 'venda', 'associado', 'perdido')),  -- etapa do lead quando aconteceu
  add column veiculos integer check (veiculos is null or veiculos >= 0),
  add column decisor boolean,
  add column motivo text;

create index contatos_user_evento_idx on public.contatos (user_id, evento, data);
create index leads_pai_idx on public.leads (lead_pai_id);

-- Registros antigos: etapa a partir do resultado; evento a partir da ordem e do resultado de cada contato.
update public.leads set etapa = case resultado
  when 'agendou' then 'mql' when 'cotacao' then 'sql' when 'venda' then 'venda' when 'sem_interesse' then 'perdido' else 'lead' end;

with ordem as (
  select id, row_number() over (partition by lead_id order by data, id) as n from public.contatos
)
update public.contatos c set
  evento = case when o.n = 1 then 'abordagem' else case c.resultado
    when 'agendou' then 'mql' when 'cotacao' then 'sql' when 'venda' then 'venda' when 'sem_interesse' then 'perda' else 'retorno' end end,
  decisor = case when o.n = 1 then (select l.falou_decisor from public.leads l where l.id = c.lead_id) end
from ordem o where o.id = c.id;

-- Configurações (metas mensais etc.): uma linha por usuário, id = o próprio usuário.
create table public.config (
  id uuid primary key default auth.uid() references auth.users (id),
  user_id uuid not null default auth.uid() references auth.users (id),
  metas jsonb not null default '{}'::jsonb,   -- {leads, mql, sql, vendas, associados} por mês
  dias_esfriando integer not null default 7 check (dias_esfriando between 1 and 90),
  atualizado_em timestamptz not null default now(),
  check (id = user_id)
);
create trigger config_atualizado_em before update on public.config
  for each row execute function public.tocar_atualizado_em();

alter table public.config enable row level security;
create policy "config: ler a minha" on public.config for select to authenticated
  using (user_id = (select auth.uid()));
create policy "config: criar a minha" on public.config for insert to authenticated
  with check (user_id = (select auth.uid()) and id = (select auth.uid()));
create policy "config: alterar a minha" on public.config for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and id = (select auth.uid()));

revoke all on public.config from anon;
revoke delete, truncate on public.config from authenticated;

-- O lead "pai" precisa ser do mesmo usuário.
create or replace function public.conferir_lead_pai() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.lead_pai_id is not null and not exists (
    select 1 from public.leads p where p.id = new.lead_pai_id and p.user_id = new.user_id) then
    raise exception 'lead_pai_id de outro usuário';
  end if;
  return new;
end $$;
create trigger leads_conferir_pai before insert or update on public.leads
  for each row execute function public.conferir_lead_pai();
