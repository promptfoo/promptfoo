# Backend Server

Hono-based HTTP + WebSocket server for the web UI.

## Tech Stack

- Hono (web framework) + Socket.io
- Zod for request validation
- Better SQLite3 + Drizzle ORM

## Directory Structure

```plaintext
src/server/
├── index.ts           # Entry point
├── server.ts          # Re-exports from hono/ (backwards compatibility)
├── apiSchemas.ts      # Zod validation schemas
└── hono/
    ├── app.ts         # Hono app setup and route mounting
    ├── server.ts      # HTTP server with Socket.io integration
    ├── types.ts       # Response helpers and handler types
    ├── api-types.ts   # Shareable API types for client/server
    ├── index.ts       # Module exports
    ├── middleware/    # Custom middleware (MIME types, SPA fallback)
    └── routes/        # API route handlers
```

## Logging

See `docs/logging.md` - use logger with object context (auto-sanitized).

## Response Format

```typescript
import { errorResponse, successResponse, notFoundResponse } from './hono';

// Success response - wraps data in { data: T }
return successResponse(c, results);

// Error responses
return errorResponse(c, 'Invalid input', 400);
return notFoundResponse(c, 'Eval not found');

// Raw JSON (no wrapper)
return c.json({ version: '1.0.0' });
```

## Route Handler Pattern

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { errorResponse } from '../types';

export const myRouter = new Hono();

myRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const { limit } = c.req.query();

  // Validate with Zod
  const result = MySchema.safeParse({ id, limit });
  if (!result.success) {
    return errorResponse(c, 'Invalid parameters', 400);
  }

  return c.json({ data: result.data });
});

myRouter.post('/', async (c) => {
  const body = await c.req.json();
  // ... handle POST
  return c.json({ success: true }, 201);
});
```

## Database Access

```typescript
import { db } from '../database';
import { evaluations } from '../database/schema';
const results = await db.select().from(evaluations).where(eq(evaluations.id, id));
```

## Development

```bash
npm run dev:server   # Runs on localhost:3000
npm run dev          # Both server + frontend
```

## Guidelines

- Validate requests with Zod schemas from `apiSchemas.ts`
- Use proper HTTP status codes
- Use response helpers (`successResponse`, `errorResponse`, `notFoundResponse`)
- Handle errors with try-catch
- Use `c.req.param()`, `c.req.query()`, `c.req.json()` for request data
