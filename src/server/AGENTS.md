# Backend Server

Express-based HTTP + WebSocket server for the web UI.

## Tech Stack

- Express 5 + Socket.io
- Zod for request validation
- Better SQLite3 + Drizzle ORM

## Directory Structure

```
src/server/
├── index.ts       # Entry point
├── server.ts      # Express app setup
├── apiSchemas.ts  # Zod validation schemas
└── routes/        # API endpoints
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
