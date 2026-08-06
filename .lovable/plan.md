Adicionar importação em lote de clientes via planilha na área administrativa

## Objetivo
Permitir que o administrador faça upload de uma planilha (.xlsx ou .csv) com dados de clientes e importe vários registros de uma só vez no banco, validando colunas, telefones duplicados e atualizando a lista automaticamente.

## Tarefas

1. **Instalar dependência**
   - Adicionar `xlsx` (SheetJS) ao projeto para leitura de .xlsx e .csv.

2. **Criar server functions de importação**
   - Criar `src/lib/clientes.functions.ts` com `createServerFn` protegido por `requireSupabaseAuth`.
   - Receber um array de clientes validados (nome, telefone, e-mail, documento, observações).
   - Fazer `upsert` na tabela `clientes` usando `telefone` como chave de conflito para evitar duplicatas, preservando o ID existente.
   - Retornar resumo: quantidade inserida, atualizada e erros.

3. **Criar componente de upload**
   - Criar `src/components/importar-clientes.tsx`.
   - Aceitar arquivo `.xlsx` ou `.csv` via input ou drag-and-drop.
   - Ler a planilha com `xlsx`, converter para JSON.
   - Mapear colunas flexíveis (ex.: `Nome`, `Telefone`, `Email`, `CPF/CNPJ`, `Observações`), tolerando variações de nome e maiúsculas/minúsculas.
   - Validar telefone (mínimo 10 dígitos), nome obrigatório e normalizar telefone para somente dígitos.
   - Exibir preview dos primeiros registros antes de confirmar a importação.
   - Mostrar progresso e resumo ao final.

4. **Integrar na página de clientes**
   - Adicionar botão "Importar planilha" ao lado de "Novo cliente" em `src/routes/_authenticated/admin.clientes.tsx`.
   - Abrir o componente de upload em um Dialog.
   - Invalidar a query `["clientes"]` após importação bem-sucedida para recarregar a lista.

5. **Gerar planilha modelo**
   - Adicionar link/botão "Baixar modelo" que gera e faz download de um arquivo `.xlsx` com as colunas esperadas e uma linha de exemplo.

6. **Tratamento de erros e feedback**
   - Exibir toast de sucesso com resumo da importação.
   - Exibir alertas visuais para linhas inválidas (telefone mal formatado, nome vazio, etc.).
   - Garantir que o administrador nunca veja dados de outros usuários: a função usa `requireSupabaseAuth` e verifica o papel `admin` pelo `has_role` já existente.

## Arquivos envolvidos
- `src/lib/clientes.functions.ts` (novo)
- `src/components/importar-clientes.tsx` (novo)
- `src/routes/_authenticated/admin.clientes.tsx` (edição)
- `package.json` (adição da dependência `xlsx`)

## Critério de conclusão
O administrador consegue baixar a planilha modelo, preencher, fazer upload na página de clientes, visualizar o preview, confirmar a importação e ver os novos clientes aparecerem na lista automaticamente, sem duplicar telefones já existentes.