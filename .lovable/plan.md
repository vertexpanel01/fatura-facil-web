# Ajuste de texto na home

## Problema
O subtítulo principal da página inicial não está agradando. O usuário quer uma mensagem que reforce pagamento em dia e descontos, com ortografia correta.

## Solução
Alterar o texto do subtítulo em `src/routes/index.tsx` (linha ~142) de:

```
Aproveite descontos imperdíveis. Consulta grátis e segura.
```

para:

```
Pague sua fatura em dia e garanta descontos imperdíveis.
```

## Escopo
- Apenas o subtítulo na hero section da página inicial.
- Nenhuma alteração de layout, banco de dados, rotas ou lógica de consulta.
