# Deployment, Common Patterns & Troubleshooting

## 10. Deployment

### Bun Build & Deploy

```bash
# Build for production
bun run build

# Preview production build
bun run preview

# Deploy with adapter (example: Node)
# svelte.config.js should have: adapter: adapter-node()
node build/index.js
```

### Environment Variables

```typescript
// lib/config/env.ts
import { PUBLIC_API_URL } from '$env/static/public';
import { PRIVATE_API_KEY } from '$env/static/private';

export const config = {
  apiUrl: PUBLIC_API_URL,
  apiKey: PRIVATE_API_KEY // Only available server-side
};
```

---

## Common Patterns & Solutions

### 1. Dark Mode with shadcn-svelte

```typescript
// stores/theme.ts
import { persistedStore } from '$lib/utils/stores';

export const theme = persistedStore<'light' | 'dark'>('theme', 'light');

export function toggleTheme() {
  theme.update(t => t === 'light' ? 'dark' : 'light');
}

// Apply theme
if (browser) {
  theme.subscribe(value => {
    document.documentElement.classList.toggle('dark', value === 'dark');
  });
}
```

### 2. Toast Notifications

```typescript
// lib/components/ui/sonner.ts
import { toast as sonnerToast } from 'svelte-sonner';

export const toast = {
  success: (message: string, options?) =>
    sonnerToast.success(message, options),
  error: (message: string, options?) =>
    sonnerToast.error(message, options),
  info: (message: string, options?) =>
    sonnerToast.info(message, options),
};
```

### 3. Authentication Flow

```typescript
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const authHandler: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('auth_token');

  if (token) {
    try {
      const user = await verifyToken(token);
      event.locals.user = user;
    } catch {
      event.cookies.delete('auth_token');
    }
  }

  return resolve(event);
};

export const handle = sequence(authHandler);
```

### 4. Real-time Updates with SSE

```typescript
// routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        const data = `data: ${JSON.stringify({ time: Date.now() })}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      }, 1000);

      return () => clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## Troubleshooting

### Common Issues

1. **Bun compatibility issues**: Some packages may not work with Bun. Use npm/pnpm as fallback
2. **Hydration mismatches**: Ensure SSR and client render the same content
3. **Memory leaks**: Always cleanup in `onDestroy` or return cleanup functions from `onMount`
4. **Type errors with shadcn-svelte**: Ensure `@melt-ui/svelte` types are installed

### Debug Tools

```svelte
<script lang="ts">
  import { dev } from '$app/environment';

  // Only in development
  $: if (dev) {
    console.log('Component state:', { /* ... */ });
  }
</script>
```

---

## Resources

- **Svelte**: https://svelte.dev/docs
- **SvelteKit**: https://kit.svelte.dev/docs
- **shadcn-svelte**: https://www.shadcn-svelte.com/docs
- **Bun**: https://bun.sh/docs
- **Melt UI**: https://melt-ui.com/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
