import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLogs = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("pagamentos_log")
      .select("created_at, mensagem, http_status")
      .eq("gateway_slug", "propix")
      .order("created_at", { ascending: false })
      .limit(10);
    return data;
  });
