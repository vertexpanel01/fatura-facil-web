import { createFileRoute } from '@tanstack/react-router'
import { getLogs } from '@/lib/get-logs.functions'

export const Route = createFileRoute('/api/public/get-logs')({
  server: {
    handlers: {
      GET: async () => {
        const result = await getLogs({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
