import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const testProPixServer = createServerFn({ method: "POST" })
  .handler(async () => {
    const clientId = process.env["PROPIX_CLIENT_ID"];
    const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
    
    const logs = [];
    logs.push(`Config: ID=${!!clientId}, Secret=${!!clientSecret}`);
    
    try {
      const { criarCobrancaPix } = await import("./propix.server");
      const res = await criarCobrancaPix({
        centavos: 100,
        nome: "Teste ProPix",
        telefone: "11999999999",
        descricao: "Teste de Diagnóstico",
        referencia: "TEST-" + Date.now(),
      });
      return { success: !!res, data: res, logs };
    } catch (e: any) {
      return { success: false, error: e.message, logs };
    }
  });
