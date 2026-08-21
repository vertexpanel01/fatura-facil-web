import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Endpoint de diagnóstico forçado para ProPix.
 * Ignora verificações de ambiente e tenta a chamada direta com logs manuais no banco.
 */
export const testProPixForcado = createServerFn({ method: "POST" })
  .handler(async () => {
    const clientId = process.env["PROPIX_CLIENT_ID"];
    const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
    
    const logs: string[] = [];
    const ref = "DIAG-" + Math.random().toString(36).substring(7);
    
    const dbLog = async (msg: string, status: number | null = null) => {
      logs.push(msg);
      await supabaseAdmin.from("pagamentos_log").insert({
        gateway_slug: "propix",
        fatura_id: ref,
        nivel: status && status >= 400 ? "erro" : "info",
        http_status: status,
        mensagem: msg.slice(0, 500)
      }).catch(e => console.error("Erro ao gravar log no banco:", e));
    };

    await dbLog(`INICIANDO DIAGNÓSTICO FORÇADO. ID=${!!clientId}, Secret=${!!clientSecret}`);

    if (!clientId || !clientSecret) {
      await dbLog("FALHA: Credenciais ausentes no process.env", 500);
      return { success: false, logs };
    }

    try {
      const payload = {
        amount: 1.00,
        description: "Teste Diagnóstico",
        payerName: "Teste",
        payerDocument: "12345678909"
      };

      await dbLog(`Chamando API ProPix... Payload: ${JSON.stringify(payload)}`);
      
      const res = await fetch("https://api.propixbr.com/api/v1/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
          "x-client-secret": clientSecret
        },
        body: JSON.stringify(payload)
      });

      const texto = await res.text();
      await dbLog(`Resposta API - Status: ${res.status}, Body: ${texto}`, res.status);

      return { 
        success: res.ok, 
        status: res.status, 
        body: texto,
        logs 
      };
    } catch (e: any) {
      await dbLog(`ERRO DE REDE: ${e.message}`, 500);
      return { success: false, error: e.message, logs };
    }
  });
