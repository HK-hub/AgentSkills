# API Development Patterns

## REST API Endpoints

```typescript
// routes/api/users/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = 20;

  try {
    const users = await db.users.findMany({
      skip: (page - 1) * limit,
      take: limit
    });

    return json({
      users,
      pagination: { page, limit, total: await db.users.count() }
    });
  } catch (err) {
    throw error(500, 'Failed to fetch users');
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) throw error(403, 'Unauthorized');

  const body = await request.json();
  if (!body.email || !body.name) throw error(400, 'Missing required fields');

  const user = await db.users.create({ data: body });
  return json(user, { status: 201 });
};
```

## Type-Safe API Client

```typescript
// lib/utils/api.ts
import { error } from '@sveltejs/kit';

export async function apiClient<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  });

  if (!response.ok) throw error(response.status, await response.text());
  return response.json();
}

// Usage: const users = await apiClient<User[]>('/api/users');
```
