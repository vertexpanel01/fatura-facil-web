import { createFileRoute } from '@tanstack/react-router'
import { testProPixServer } from '@/lib/test-propix.functions'

export const Route = createFileRoute('/api/public/test-propix-v3')({
  server: {
    handlers: {
      GET: async () => {
        const result = await testProPixServer({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
