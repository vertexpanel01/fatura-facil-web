# Contagem de acessos ao site

Registrar cada visita à página pública e cada consulta por telefone, exibindo os números apenas no painel administrativo.

## O que será feito

1. **Nova tabela `acessos`** no banco: identificador, telefone consultado (opcional), data/hora do acesso e página acessada.
2. **Registro automático**:
   - ao abrir a página inicial pública, grava um acesso (sem telefone);
   - ao consultar um telefone, grava um acesso com o telefone digitado e a página de resultado.
   O registro é silencioso: se falhar, a página do cliente continua funcionando normalmente.
3. **Card no painel administrativo** (Dashboard) com:
   - acessos de hoje;
   - acessos no mês atual;
   - total de consultas com telefone;
   - lista dos últimos 20 acessos com data/hora, página e telefone (quando houver).
4. **Visibilidade**: nada aparece na página pública; os números só são lidos por administradores autenticados.

## Detalhes técnicos

- Migração: `public.acessos` (`id uuid pk`, `telefone_consultado text null`, `data_hora timestamptz not null default now()`, `pagina text not null`, `created_at`), índice em `data_hora`. GRANT para `service_role` e `SELECT` para `authenticated`; RLS habilitada com política de leitura restrita a admin (`private.has_role(auth.uid(), 'admin')`). Sem grant/política para `anon` — a gravação é feita pelo servidor.
- Gravação: nova função de servidor `registrarAcesso` em `src/lib/acessos.functions.ts` usando `supabaseAdmin` dentro do handler, validando entrada com Zod (`pagina`, `telefone_consultado` opcional normalizado). Chamada em `useEffect` na home (`src/routes/index.tsx`) e no fluxo de consulta (`consultarFaturas` / rota `fatura.$telefone.tsx`), sempre com `catch` silencioso.
- Painel: `src/routes/_authenticated/admin.index.tsx` ganha uma seção "Acessos" com os três totais e a tabela dos últimos registros, consultando `acessos` pelo cliente autenticado via TanStack Query.
