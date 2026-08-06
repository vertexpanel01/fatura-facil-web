Revisão de textos públicos: "telefone" e "descontos imperdíveis"

## Objetivo
Revisar e corrigir todos os textos da página inicial (`/`) e da página de fatura (`/fatura/$telefone`) para garantir que:
- a identificação do cliente seja sempre apresentada como "telefone" (não CPF);
- a frase "descontos imperdíveis" esteja grafada corretamente e usada nos pontos esperados;
- não haja referências quebradas deixadas pela mudança recente de CPF para telefone.

## Estado atual verificado
- Os textos de hero, benefícios, passos, FAQ, meta tags e página de fatura já estão com "telefone" e "descontos imperdíveis" corretos.
- Não restam ocorrências de "CPF" ou variações de "negociar" nos arquivos TypeScript/TSX de `src/`.
- Existe um defeito de foco no botão final da home: `document.getElementById("cpf")` aponta para um elemento que não existe mais. O campo atual tem `id="telefone"`, então o clique no CTA final não posiciona o cursor corretamente.

## Ações
1. Corrigir o seletor no botão "Consultar gratuitamente" da home, trocando `document.getElementById("cpf")` por `document.getElementById("telefone")`.
2. Revisar novamente as strings visíveis em `src/routes/index.tsx`, `src/routes/fatura.$telefone.tsx`, `src/components/fatura-card.tsx` e `src/routes/__root.tsx` para confirmar a consistência das mensagens.
3. Executar build para validar que não há erros de TypeScript ou referências inexistentes.

## Arquivos que serão alterados
- `src/routes/index.tsx` (linha ~293 — correção do id de foco)

## Critério de conclusão
- Build passa sem erros.
- Clique no botão "Consultar gratuitamente" no final da home move o scroll para o topo e foca o campo de telefone.
- Nenhuma ocorrência de "CPF"/"cpf" permanece nos textos públicos.