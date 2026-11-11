-- Remove SÓ os dados fictícios (empresa começando com "_"), o histórico deles e as ações que só tinham fictícios.
-- Dados reais (sem "_" no início do nome) não são tocados. Rodar no SQL Editor do Supabase.
create temp table _acoes_mock on commit drop as
  select distinct acao_id as id from public.leads where empresa like '\_%' and acao_id is not null;
delete from public.contatos where lead_id in (select id from public.leads where empresa like '\_%');
delete from public.leads where empresa like '\_%' and lead_pai_id is not null; -- primeiro os leads "segurados"
delete from public.leads where empresa like '\_%';
delete from public.acoes a where a.id in (select id from _acoes_mock)
  and not exists (select 1 from public.leads l where l.acao_id = a.id);
