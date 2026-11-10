# Micro CRM

PWA de prospecção (pt-BR, celular primeiro): Next.js (export estático) + Supabase + Vercel.
Produção: https://micro-crm-virid.vercel.app — projeto Vercel `micro-crm` (pasta `crm/` deste repositório).
Supabase: projeto `micro-crm` (`oqxzggcmjqgrdfddgjwd`, São Paulo).

## Telas
- **Registrar**: visita em poucos toques; lembra cidade, tipo e estratégia; sugere o próximo passo pela cadência.
- **Hoje**: retornos de hoje e atrasados; registrar contato; arquivar.
- **Funil**: semana a semana, por estratégia, com a linha de base N/50 abordagens de frota.
- **Lista**: busca, edição, histórico, **Exportar XLSX** e **Gerar relatório** (.docx no layout do relatório de viagem).

## Regra nº 1 (persistência)
Nada aparece como "salvo" antes do banco confirmar. Sem sinal, o registro vai para uma fila no IndexedDB
("pendente") e é enviado sozinho quando o sinal volta, com id gerado no app (reenviar não duplica).
Nada é apagado: existe o campo `arquivado`. RLS em todas as tabelas, só o dono vê e altera; sem DELETE pela API.

## Relatório
Edge Function `supabase/functions/relatorio`: lê os dados com o login de quem pediu (sob RLS), calcula os números
em `fatos.js` (sem IA) e pede o texto corrido à Claude. O .docx é montado no aparelho (`lib/relatorio.js`).
- Precisa do segredo **ANTHROPIC_API_KEY** em Supabase > Edge Functions > Secrets.
- Sem a chave (ou se a IA falhar), o app oferece **Gerar sem IA**: mesmo layout, só com os registros.
- Publicar de novo: `supabase functions deploy relatorio` (ou pelo MCP do Supabase).

## Desenvolvimento
```bash
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_KEY
npm install
npm run dev                  # http://localhost:3000
npm test                     # testes de lógica (cadência, funil, fatos, relatório)
npm run build                # gera out/
```
Testes de ponta a ponta (navegador + Supabase real; precisam de um usuário de teste com senha):
```bash
python3 -m http.server 4400 -d out &
export CRM_URL=http://localhost:4400 SUPABASE_URL=... SUPABASE_KEY=... TESTE_EMAIL=... TESTE2_EMAIL=... TESTE_SENHA=...
node e2e/persistencia.cjs && node e2e/telas.cjs && node e2e/relatorio.cjs   # COM_IA=1 testa o texto da IA
```

## Login
Link ou código de 6 dígitos por e-mail; a sessão fica salva no aparelho (não pede de novo).
No Supabase (Authentication > URL Configuration): Site URL = URL de produção; Redirect URLs inclui ela.
No modelo do e-mail "Magic Link", incluir `{{ .Token }}` para o código. Depois do primeiro login,
dá para desligar novos cadastros (Authentication > Sign In / Providers > Allow new users to sign up).

## Backup
`.github/workflows/backup-crm.yml`: todo dia 03:17 (Brasília), `pg_dump` cifrado com AES-256, guardado 90 dias
como artifact. Segredos do repositório: `CRM_DB_URL` (Session pooler) e `CRM_BACKUP_SENHA`.
Restaurar: `gpg -d crm-backup-AAAA-MM-DD.sql.gz.gpg | gunzip | psql "$URL"`.

## Dados de teste
Empresas cujo nome começa com `_` são fictícias. Para remover: rode `supabase/mock/remover_mock.sql` no SQL Editor.
