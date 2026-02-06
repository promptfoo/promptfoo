# Backend Server

Express-based HTTP + WebSocket server for the web UI.

## Tech Stack

- Express 5 + Socket.io
- Zod for request validation
- Better SQLite3 + Drizzle ORM

## Directory Structure

```plaintext
src/server/
├── index.ts       # Entry point
├── server.ts      # Express app setup
└── routes/        # API endpoints

src/types/api/     # Shared Zod validation schemas
├── common.ts      # Shared primitives (EmailSchema, etc.)
├── eval.ts        # Eval endpoint schemas
├── providers.ts   # Provider endpoint schemas
└── user.ts        # User endpoint schemas
```

## Logging

See `docs/logging.md` - use logger with object context (auto-sanitized).

## Response Format

```typescript
res.json({ success: true, data: results });
res.status(400).json({ success: false, error: 'Invalid input' });
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

## Zod Validation Patterns

Route schemas are defined in `src/types/api/`. Follow these patterns:

```typescript
// Request validation - use .safeParse() and return validated data
const bodyResult = EvalSchemas.Update.Request.safeParse(req.body);
if (!bodyResult.success) {
  res.status(400).json({ error: z.prettifyError(bodyResult.error) });
  return;
}
const { field } = bodyResult.data; // Use validated data, not req.body

// Response validation - use .parse() (throws on invalid)
res.json(EvalSchemas.Update.Response.parse({ message: 'Success' }));
```

**Key patterns:**

- Use `.passthrough()` on schemas that need to preserve extra fields
- When `.passthrough()` causes TypeScript errors (index signature mismatch), use double-cast: `bodyResult.data as unknown as ExpectedType`
- For backward compatibility, use `.nullable().optional().transform((v) => v ?? defaultValue)`
- Response schemas should be permissive for variable outputs (e.g., `z.unknown()` for provider outputs)

## Guidelines

- Validate requests with Zod schemas
- Use proper HTTP status codes
- Wrap responses in `{ success, data/error }`
- Handle errors with try-catch
