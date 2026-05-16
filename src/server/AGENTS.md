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
├── blobs.ts       # Blob endpoint schemas
├── common.ts      # Shared primitives (EmailSchema, etc.)
├── configs.ts     # Config endpoint schemas
├── eval.ts        # Eval endpoint schemas
├── media.ts       # Media endpoint schemas
├── modelAudit.ts  # Model audit endpoint schemas
├── providers.ts   # Provider endpoint schemas
├── redteam.ts     # Redteam endpoint schemas
├── traces.ts      # Traces endpoint schemas
├── user.ts        # User endpoint schemas
└── version.ts     # Version endpoint schemas
```

## Logging

See `docs/logging.md` - use logger with object context (auto-sanitized).

## Error Handling

Use the helpers in `src/server/utils/errors.ts` for error responses:

```typescript
import { replyValidationError, sendError } from '../utils/errors';

// Logs the internal error, returns generic message to client
sendError(res, 500, 'Failed to process request', error);

// For 400 validation errors, prefer the helper — it formats via z.prettifyError
// and parses through ErrorResponseSchema so the wire shape is enforced.
replyValidationError(res, bodyResult.error);
```

**Never expose internal error details** (`String(error)`, `error.message`) to clients.

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
  replyValidationError(res, bodyResult.error);
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

- Validate requests with Zod `.safeParse()` before the try block
- Use proper HTTP status codes
- Error responses use `{ error: string }` shape
- Use `sendError()` for 500 errors — never expose internal details
- Handle errors with try-catch
- Never add rate limiters or request throttling middleware to local server routes. If code scanning flags `js/missing-rate-limiting`, keep the route unthrottled, document the route-specific rationale in code, and resolve the alert as an intentional local-server exception.
