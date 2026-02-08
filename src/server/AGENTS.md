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

## Guidelines

- Validate requests with Zod schemas
- Use proper HTTP status codes
- Wrap responses in `{ success, data/error }`
- Handle errors with try-catch
