import { createServerFn } from "@tanstack/react-start";

export const testProPixServer = createServerFn({ method: "POST" })
  .handler(async () => {
    const clientId = process.env["PROPIX_CLIENT_ID"];
    const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
    
    try {
      // Tentativa minimalista
      const payload = {
        amount: 10, // R$ 10.00
        description: "Teste",
        payerName: "Teste",
        payerDocument: "34934162000"
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
      
      // Se 500 continuar, tenta GET para ver se a API está viva ou se o endpoint é diferente
      let check = null;
      if (res.status === 500) {
         const res2 = await fetch("https://api.propixbr.com/api/v1/check", {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             "x-client-id": clientId || "",
             "x-client-secret": clientSecret || ""
           },
           body: JSON.stringify({ transactionId: "123" })
         });
         check = await res2.text();
      }

      return { 
        status: res.status, 
        body,
        check
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });
