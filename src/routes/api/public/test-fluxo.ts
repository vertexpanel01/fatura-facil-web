import { createFileRoute } from '@tanstack/react-router'
import { testarFluxoCompleto } from '@/lib/test-fluxo.functions'

export const Route = createFileRoute('/api/public/test-fluxo')({
  server: {
    handlers: {
      GET: async () => {
        const result = await testarFluxoCompleto({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
