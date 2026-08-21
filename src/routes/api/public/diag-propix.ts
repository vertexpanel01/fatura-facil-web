import { createFileRoute } from '@tanstack/react-router'
import { testProPixServer } from '@/lib/test-propix-diag.functions'

export const Route = createFileRoute('/api/public/diag-propix')({
  server: {
    handlers: {
      GET: async () => {
        const result = await testProPixServer({ data: undefined });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})

