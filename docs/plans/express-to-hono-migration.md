# Express to Hono Migration Analysis

## Executive Summary

This document analyzes migrating the Promptfoo server from Express 5 to Hono. The server consists of ~17 TypeScript files, 10 route handlers, ~60+ API endpoints, and uses Socket.io for real-time updates.

**Verdict:** Migration is feasible but non-trivial. The main blockers are Socket.io integration and the volume of routes requiring syntax changes.

---

## Current Architecture

### Stack

- **Express 5.2.1** - HTTP server
- **Socket.io 4.8.3** - WebSocket/real-time events
- **compression** - Gzip middleware
- **cors** - CORS middleware
- **Zod** - Request validation
- **Better SQLite3 + Drizzle** - Database

### Server Structure

```
src/server/
├── index.ts           # Entry point
├── server.ts          # Express app setup (~400 lines)
├── apiSchemas.ts      # Zod validation schemas
└── routes/            # 10 route files
    ├── eval.ts        # 15 endpoints
    ├── redteam.ts     # 5 endpoints
    ├── providers.ts   # 8 endpoints
    ├── modelAudit.ts  # 3 endpoints
    ├── blobs.ts       # 1 endpoint
    ├── configs.ts     # 4 endpoints
    ├── media.ts       # 3 endpoints
    ├── user.ts        # 8 endpoints
    ├── version.ts     # 1 endpoint
    └── traces.ts      # 2 endpoints
```

### Key Patterns Used

1. **Router composition** - `express.Router()` mounted at paths
2. **Middleware chain** - cors → compression → json → routes → static
3. **Typed requests/responses** - `Request<Params, ResBody, ReqBody, Query>`
4. **Static file serving** - `express.static()` for React SPA
5. **SPA fallback** - `/*splat` route returns `index.html`
6. **Socket.io integration** - Real-time eval updates
7. **100MB body limit** - Large eval payloads

---

## Hono Overview

Hono is a lightweight, ultrafast web framework built on Web Standards (Request/Response). Key features:

- **Performance**: 2-4x faster than Express in benchmarks
- **Size**: ~14KB (vs Express ~200KB)
- **TypeScript-first**: Better type inference
- **Multi-runtime**: Works on Node, Deno, Bun, Cloudflare Workers
- **Web Standards**: Uses native Request/Response objects

---

## Pros of Migration

### 1. Performance

- Hono's router is significantly faster (RadixRouter)
- Lower memory footprint
- Better for high-concurrency scenarios

### 2. TypeScript Experience

```typescript
// Express - loose typing
app.get('/api/results/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string; // Manual casting
  res.json({ data: file.result });
});

// Hono - inferred typing
app.get('/api/results/:id', async (c) => {
  const id = c.req.param('id'); // Typed automatically
  return c.json({ data: file.result });
});
```

### 3. Middleware Simplicity

```typescript
// Express
app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.use(compression());

// Hono
app.use(bodyLimit({ maxSize: 100 * 1024 * 1024 }));
app.use(cors());
app.use(compress());
```

### 4. Modern API Design

- No callback-style `(req, res, next)` - uses async/await naturally
- No `res.send()` / `res.json()` - just return values
- Context object (`c`) provides clean API

### 5. Validation Integration

```typescript
// Hono + Zod validator
import { zValidator } from '@hono/zod-validator';

app.post('/api/user/email', zValidator('json', UpdateEmailSchema), async (c) => {
  const { email } = c.req.valid('json');
  return c.json({ success: true });
});
```

### 6. Already a Dependency

Hono is already in `package.json` (via MCP SDK), reducing bundle size impact.

### 7. Future-Proofing

- Web Standards alignment
- Could run on edge runtimes (Cloudflare Workers) if needed
- Active development and growing ecosystem

---

## Cons of Migration

### 1. Socket.io Integration (MAJOR)

**This is the biggest challenge.**

Express creates an HTTP server that Socket.io attaches to:

```typescript
const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer);
```

Hono's Node.js adapter works differently:

```typescript
import { serve } from '@hono/node-server';
const app = new Hono();
serve({ fetch: app.fetch, port: 3000 });
```

**Solutions:**

- Use `@hono/node-server` with `createServer` option to get HTTP server reference
- Consider switching to Hono's built-in WebSocket support (breaking change for clients)
- Run Socket.io on separate port (architectural complexity)

### 2. Static File Serving Differences

Express:

```typescript
app.use(express.static(staticDir, { dotfiles: 'allow' }));
app.get('/*splat', (req, res) => res.sendFile('index.html', { root: staticDir }));
```

Hono:

```typescript
import { serveStatic } from '@hono/node-server/serve-static';
app.use('/*', serveStatic({ root: staticDir }));
// SPA fallback requires custom middleware
```

The SPA fallback pattern is less elegant in Hono.

### 3. Volume of Route Changes

~60+ endpoints need syntax changes:

```typescript
// Express
router.get('/api/results/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!file) {
    res.status(404).send('Result not found');
    return;
  }
  res.json({ data: file.result });
});

// Hono
router.get('/api/results/:id', async (c) => {
  const id = c.req.param('id');
  if (!file) {
    return c.text('Result not found', 404);
  }
  return c.json({ data: file.result });
});
```

Every endpoint needs:

- `req.params.x` → `c.req.param('x')`
- `req.query.x` → `c.req.query('x')`
- `req.body` → `await c.req.json()`
- `res.json()` → `return c.json()`
- `res.status(x).json()` → `return c.json(data, x)`
- `res.sendFile()` → custom implementation

### 4. Middleware Compatibility

These Express middlewares need Hono equivalents:

| Express                | Hono Equivalent                  | Notes         |
| ---------------------- | -------------------------------- | ------------- |
| `cors`                 | `@hono/cors`                     | Built-in      |
| `compression`          | `@hono/compress`                 | Built-in      |
| `express.json()`       | Built-in                         | Automatic     |
| `express.urlencoded()` | Built-in                         | Automatic     |
| `express.static()`     | `@hono/node-server/serve-static` | Different API |

### 5. Testing & Validation Effort

- All server tests need updates
- Integration tests may break
- Need to verify all 60+ endpoints work correctly

### 6. Team Familiarity

- Express is ubiquitous; Hono is newer
- Documentation and Stack Overflow coverage is less
- Debugging may be harder initially

### 7. Error Handling Differences

Express has implicit error handling middleware:

```typescript
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

Hono uses `onError`:

```typescript
app.onError((err, c) => {
  return c.json({ error: err.message }, 500);
});
```

---

## Migration Effort Estimate

| Component             | Files | Effort         | Risk            |
| --------------------- | ----- | -------------- | --------------- |
| Main server setup     | 1     | Medium         | Low             |
| Route handlers        | 10    | High           | Medium          |
| Socket.io integration | 1     | High           | High            |
| Static file serving   | 1     | Medium         | Medium          |
| Middleware            | 2     | Low            | Low             |
| Tests                 | ~10   | High           | Medium          |
| **Total**             | ~25   | **~2-3 weeks** | **Medium-High** |

---

## Socket.io Integration Options

### Option A: Shared HTTP Server (Recommended)

```typescript
import { Hono } from 'hono';
import { createServer } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';

const app = new Hono();
// ... routes ...

const httpServer = createServer({ fetch: app.fetch });
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.emit('init', await Eval.latest());
});

httpServer.listen(3000);
```

### Option B: Native Hono WebSocket

Replace Socket.io with Hono's WebSocket support:

```typescript
import { upgradeWebSocket } from 'hono/cloudflare-workers'; // or node adapter

app.get(
  '/ws',
  upgradeWebSocket((c) => ({
    onOpen(event, ws) {
      ws.send(JSON.stringify({ type: 'init', data: latestEval }));
    },
    onMessage(event, ws) {
      // Handle messages
    },
  })),
);
```

**Downside**: Breaking change for frontend (different protocol).

### Option C: Separate Socket.io Server

Run Socket.io on a different port:

```typescript
// Hono on :3000
serve({ fetch: app.fetch, port: 3000 });

// Socket.io on :3001
const ioServer = http.createServer();
const io = new SocketIOServer(ioServer);
ioServer.listen(3001);
```

**Downside**: Adds complexity, CORS issues, two ports to manage.

---

## Recommended Migration Strategy

### Phase 1: Preparation

1. Create `src/server/hono/` directory for new implementation
2. Set up Hono with `@hono/node-server`
3. Implement Socket.io integration (Option A)
4. Add middleware (cors, compress, body limit)

### Phase 2: Route Migration

1. Start with simple routes (health, version)
2. Migrate route-by-route, keeping Express running
3. Create adapter layer for shared logic
4. Run both servers during transition (feature flag)

### Phase 3: Static Serving & SPA

1. Implement static file serving
2. Add SPA fallback middleware
3. Handle MIME type edge cases

### Phase 4: Testing & Validation

1. Port all server tests
2. Run integration tests
3. Manual testing of all endpoints
4. Performance benchmarking

### Phase 5: Cutover

1. Remove Express implementation
2. Update documentation
3. Remove Express dependencies

---

## Code Comparison Examples

### Route Handler

```typescript
// EXPRESS
evalRouter.get('/:id/table', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { limit, offset, format } = req.query;

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
  }

  if (format === 'csv') {
    setDownloadHeaders(res, 'eval.csv');
    res.send(generateEvalCsv(table));
    return;
  }

  res.json({ data: table });
});

// HONO
evalRouter.get('/:id/table', async (c) => {
  const id = c.req.param('id');
  const { limit, offset, format } = c.req.query();

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    return c.json({ error: 'Eval not found' }, 404);
  }

  if (format === 'csv') {
    return new Response(generateEvalCsv(table), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="eval.csv"',
      },
    });
  }

  return c.json({ data: table });
});
```

### Validation with Zod

```typescript
// EXPRESS
evalRouter.patch('/:id/author', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ApiSchemas.Eval.UpdateAuthor.Params.safeParse(req.params);
  const bodyResult = ApiSchemas.Eval.UpdateAuthor.Request.safeParse(req.body);

  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  // ...
});

// HONO (with @hono/zod-validator)
import { zValidator } from '@hono/zod-validator';

evalRouter.patch(
  '/:id/author',
  zValidator('param', ApiSchemas.Eval.UpdateAuthor.Params),
  zValidator('json', ApiSchemas.Eval.UpdateAuthor.Request),
  async (c) => {
    const { id } = c.req.valid('param');
    const { author } = c.req.valid('json');
    // ... cleaner!
  },
);
```

---

## Recommendation

**Proceed with migration if:**

- Performance is a priority
- You want better TypeScript ergonomics
- You're planning future edge deployment
- You have bandwidth for 2-3 weeks of migration work

**Defer migration if:**

- Stability is the top priority
- No performance issues exist
- Limited engineering bandwidth
- Socket.io integration is critical and can't be modified

**My recommendation:** Consider a **partial migration** - use Hono for new routes/services while keeping Express for existing functionality. This reduces risk while gaining Hono benefits incrementally.

---

## Files That Would Need Changes

```
src/server/server.ts              # Main app setup
src/server/index.ts               # Entry point
src/server/routes/eval.ts         # 15 endpoints
src/server/routes/redteam.ts      # 5 endpoints
src/server/routes/providers.ts    # 8 endpoints
src/server/routes/modelAudit.ts   # 3 endpoints
src/server/routes/blobs.ts        # 1 endpoint
src/server/routes/configs.ts      # 4 endpoints
src/server/routes/media.ts        # 3 endpoints
src/server/routes/user.ts         # 8 endpoints
src/server/routes/version.ts      # 1 endpoint
src/server/routes/traces.ts       # 2 endpoints
src/server/utils/downloadHelpers.ts  # Response helpers
src/commands/mcp/server.ts        # MCP server (also uses Express)
src/tracing/otlpReceiver.ts       # OTLP receiver (also uses Express)
test/server/*.test.ts             # All server tests
```

---

## Questions to Answer Before Proceeding

1. Is the Socket.io real-time functionality critical, or could it be replaced with polling/SSE?
2. Are there performance issues with the current Express implementation?
3. Is edge deployment (Cloudflare Workers, etc.) a future goal?
4. What's the acceptable risk level for the migration?
5. Is the 2-3 week effort justified by the benefits?
