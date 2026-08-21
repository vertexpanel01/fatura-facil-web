import { createServerFn } from "@tanstack/react-start";
import { criarCobrancaPix } from "./propix.server";

export const testarProPixDireto = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const res = await criarCobrancaPix({
        centavos: 100,
        nome: "Teste Automatizado",
        telefone: "11999999999",
        documento: "12345678909",
        descricao: "Teste de Integração",
        referencia: "TESTE-" + Date.now()
      });
      return { success: true, result: res };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
