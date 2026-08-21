import { createFileRoute } from '@tanstack/react-router'
import { testarProPixDireto } from '@/lib/test-propix-direto.functions'

export const Route = createFileRoute('/api/public/test-propix-direto')({
  server: {
    handlers: {
      GET: async () => {
        const result = await testarProPixDireto({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
