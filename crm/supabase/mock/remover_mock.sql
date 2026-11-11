-- Remove SÓ os dados fictícios (empresa começando com "_") e o histórico deles. Rodar no SQL Editor do Supabase.
-- Dados reais (sem "_" no início do nome) não são tocados.
delete from public.contatos where lead_id in (select id from public.leads where empresa like '\_%');
delete from public.leads where empresa like '\_%' and lead_pai_id is not null; -- primeiro os leads "segurados"
delete from public.leads where empresa like '\_%';
