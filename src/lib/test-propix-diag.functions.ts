import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const testProPixServer = createServerFn({ method: "POST" })
  .handler(async () => {
    const clientId = process.env["PROPIX_CLIENT_ID"];
    const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
    
    const logs: string[] = [];
    logs.push(`Config: ID=${!!clientId}, Secret=${!!clientSecret}`);
    
    try {
      const payload = {
        amount: 1.00,
        description: "Teste Diagnóstico",
        payerName: "Teste",
        payerDocument: "12345678909"
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
