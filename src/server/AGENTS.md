# Backend Server

**What this is:** Express-based HTTP + WebSocket server for the web UI. Provides REST APIs and real-time updates.

## Architecture

```text
src/server/
├── index.ts          # Entry point
├── server.ts         # Express app + middleware setup
├── apiSchemas.ts     # Request/response validation schemas
└── routes/           # API endpoint handlers
```

## Tech Stack

- **Express 5** - HTTP server
- **Socket.io** - WebSocket/real-time communication
- **Zod** - Request validation schemas
- **Better SQLite3** + **Drizzle ORM** - Database access

## Critical: Sanitize Logs

**Always sanitize when logging request/response data:**

```typescript
// Correct - Second param auto-sanitized
logger.debug('[API] Request received', {
  body: req.body, // API keys auto-redacted
  headers: req.headers, // Auth headers auto-redacted
});

// WRONG - Exposes secrets
logger.debug(`Body: ${JSON.stringify(req.body)}`);
```

## Standard Response Format

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Always wrap responses
res.json({ success: true, data: results });
res.status(400).json({ success: false, error: 'Invalid input' });
```

## Error Handling Pattern

```typescript
router.post('/api/eval', async (req, res) => {
  try {
    const validated = schema.parse(req.body);
    const result = await runEvaluation(validated);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[API] Evaluation failed', { error });
    const status = error instanceof ValidationError ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});
```

## WebSocket Setup

Socket.io for real-time eval updates:

```typescript
io.on('connection', (socket) => {
  socket.on('subscribe', ({ evalId }) => {
    socket.join(`eval:${evalId}`);
  });
});

// Emit updates
io.to(`eval:${evalId}`).emit('evalUpdate', { status: 'completed' });
```

## Database Access

Use Drizzle ORM (schema in `src/database/schema.ts`):

```typescript
import { db } from '../database';
import { evaluations } from '../database/schema';
import { eq } from 'drizzle-orm';

const results = await db.select().from(evaluations).where(eq(evaluations.id, id));
```

## Development

```bash
npm run dev:server   # From root - starts with nodemon
npm run dev          # Both server + frontend
```

Server runs on `http://localhost:3000`

## When Working Here

- Always validate request bodies with Zod schemas
- Use proper HTTP status codes (200, 201, 400, 404, 500)
- Sanitize all logged request/response data
- Wrap responses in `{ success, data/error }` format
- Handle errors with try-catch
