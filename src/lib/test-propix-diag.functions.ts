import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const testProPixServer = createServerFn({ method: "POST" })
  .handler(async () => {
    const clientId = process.env["PROPIX_CLIENT_ID"];
    const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
    
    const logs: string[] = [];
    logs.push(`Config: ID=${!!clientId}, Secret=${!!clientSecret}`);
    
    try {
      // Teste com um CPF válido e campos alternativos (nome do pagador conforme documentação)
      const payload = {
        amount: 1.00,
        description: "Diagnóstico",
        payerName: "Cliente Teste",
        payerDocument: "34934162000" // CPF de teste válido
      };

      const res = await fetch("https://api.propixbr.com/api/v1/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId || "",
          "x-client-secret": clientSecret || ""
        },
        body: JSON.stringify(payload)
      });

      const body = await res.text();
      return { 
        success: res.ok, 
        status: res.status, 
        body,
        logs 
      };
    } catch (e: any) {
      return { success: false, error: e.message, logs };
    }
  });
