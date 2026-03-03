# Express to Hono Migration - Detailed Implementation Plan

## Overview

This document provides a file-by-file migration plan from Express 5 to Hono, including Socket.io integration, tests, and all auxiliary Express usages.

---

## Scope Summary

### Express Usage Locations

| Location                      | Purpose                       | Complexity |
| ----------------------------- | ----------------------------- | ---------- |
| `src/server/`                 | Main web UI server (17 files) | High       |
| `src/commands/mcp/server.ts`  | MCP HTTP transport            | Low        |
| `src/tracing/otlpReceiver.ts` | OTLP trace receiver           | Medium     |

### Test Files to Update

| File                                              | Impact |
| ------------------------------------------------- | ------ |
| `test/server/server.test.ts`                      | Minor  |
| `test/server/eval.test.ts`                        | Minor  |
| `test/server/routes/eval.export.test.ts`          | Medium |
| `test/server/routes/providers.test.ts`            | Medium |
| `test/server/routes/redteam.test.ts`              | Medium |
| `test/server/routes/modelAudit.test.ts`           | Medium |
| `test/server/routes/eval.filteredMetrics.test.ts` | Minor  |
| `test/server/routes-eval.test.ts`                 | Low    |
| `test/server/utils/downloadHelpers.test.ts`       | Medium |
| `test/server/utils/evalTableUtils.test.ts`        | None   |
| `test/server/findStaticDir.test.ts`               | None   |
| `test/server/routes/version.test.ts`              | None   |

---

## Phase 1: Foundation Setup

### 1.1 Install Dependencies

```bash
npm install @hono/node-server @hono/zod-validator
# hono is already installed via MCP SDK
```

**Files to create:**

- `src/server/hono/app.ts` - New Hono app factory
- `src/server/hono/middleware/` - Middleware adapters

### 1.2 Create Hono App Factory

**File: `src/server/hono/app.ts`**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { serveStatic } from '@hono/node-server/serve-static';

export function createHonoApp() {
  const app = new Hono();

  // Middleware
  app.use('*', cors());
  app.use('*', compress());

  // Routes will be added here

  return app;
}
```

### 1.3 Socket.io Integration Pattern

**File: `src/server/hono/server.ts`**

```typescript
import { createServer } from 'node:http';
import { Hono } from 'hono';
import { Server as SocketIOServer } from 'socket.io';

export async function startHonoServer(port: number) {
  const app = new Hono();

  // Create HTTP server that Hono will handle
  const httpServer = createServer(async (req, res) => {
    // Use Hono's fetch handler
    const response = await app.fetch(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: ['GET', 'HEAD'].includes(req.method!) ? undefined : req,
      }),
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  });

  // Attach Socket.io to the same HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', async (socket) => {
    socket.emit('init', await Eval.latest());
  });

  httpServer.listen(port);
  return { app, httpServer, io };
}
```

---

## Phase 2: Utility & Helper Migration

### 2.1 Download Helpers

**File: `src/server/utils/downloadHelpers.ts`**

Current (Express):

```typescript
export function setDownloadHeaders(res: Response, filename: string) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}
```

New (Hono-compatible):

```typescript
export function getDownloadHeaders(filename: string): Record<string, string> {
  return {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${filename}"`,
  };
}

// Usage in Hono route:
// return new Response(csvData, { headers: getDownloadHeaders('eval.csv') });
```

### 2.2 MIME Type Middleware

**File: `src/server/hono/middleware/mimeType.ts`**

```typescript
import { MiddlewareHandler } from 'hono';
import path from 'node:path';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

export const setJavaScriptMimeType: MiddlewareHandler = async (c, next) => {
  await next();
  const ext = path.extname(c.req.path);
  if (JS_EXTENSIONS.has(ext)) {
    c.header('Content-Type', 'application/javascript');
  }
};
```

---

## Phase 3: Route Migration (File by File)

### Migration Pattern

Each route file follows this transformation:

**Express:**

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';

export const myRouter = Router();

myRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { filter } = req.query;
  const body = req.body;

  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: result });
});
```

**Hono:**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

export const myRouter = new Hono();

myRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const filter = c.req.query('filter');
  const body = await c.req.json();

  if (!found) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json({ data: result });
});
```

---

### 3.1 `src/server/routes/version.ts` (Easiest - Start Here)

**Endpoints:** 1
**Complexity:** Low

| Express       | Hono               |
| ------------- | ------------------ |
| `Router()`    | `new Hono()`       |
| `req.query.x` | `c.req.query('x')` |
| `res.json()`  | `return c.json()`  |

**Changes:**

- Replace Router import
- Update handler signature
- Change response pattern

---

### 3.2 `src/server/routes/traces.ts`

**Endpoints:** 2
**Complexity:** Low

| Endpoint                    | Method |
| --------------------------- | ------ |
| `/evaluation/:evaluationId` | GET    |
| `/:traceId`                 | GET    |

---

### 3.3 `src/server/routes/configs.ts`

**Endpoints:** 4
**Complexity:** Low

| Endpoint     | Method    |
| ------------ | --------- |
| `/`          | GET, POST |
| `/:type`     | GET       |
| `/:type/:id` | GET       |

---

### 3.4 `src/server/routes/blobs.ts`

**Endpoints:** 1
**Complexity:** Medium (redirect handling, binary response)

**Special considerations:**

- `res.redirect()` → `return c.redirect()`
- Binary blob serving needs `new Response(buffer, { headers })`
- Cache headers

---

### 3.5 `src/server/routes/media.ts`

**Endpoints:** 3
**Complexity:** Medium (file serving, MIME types)

| Endpoint                | Method | Notes          |
| ----------------------- | ------ | -------------- |
| `/stats`                | GET    | Simple         |
| `/info/:type/:filename` | GET    | Simple         |
| `/:type/:filename`      | GET    | Binary serving |

---

### 3.6 `src/server/routes/user.ts`

**Endpoints:** 8
**Complexity:** Medium

| Endpoint        | Method    |
| --------------- | --------- |
| `/email`        | GET, POST |
| `/email/clear`  | PUT       |
| `/email/status` | GET       |
| `/id`           | GET       |
| `/login`        | POST      |
| `/logout`       | POST      |
| `/cloud-config` | GET       |

---

### 3.7 `src/server/routes/modelAudit.ts`

**Endpoints:** 3
**Complexity:** Medium (child process spawning)

| Endpoint           | Method |
| ------------------ | ------ |
| `/check-installed` | GET    |
| `/check-path`      | POST   |
| `/scan`            | POST   |

---

### 3.8 `src/server/routes/providers.ts`

**Endpoints:** 8
**Complexity:** Medium-High

| Endpoint                   | Method | Notes            |
| -------------------------- | ------ | ---------------- |
| `/`                        | GET    | Provider listing |
| `/config-status`           | GET    |                  |
| `/test`                    | POST   | Zod validation   |
| `/discover`                | POST   |                  |
| `/http-generator`          | POST   |                  |
| `/test-request-transform`  | POST   |                  |
| `/test-response-transform` | POST   |                  |
| `/test-session`            | POST   |                  |

**Zod validation migration:**

```typescript
// Express
const result = ProviderSchema.safeParse(req.body);
if (!result.success) {
  res.status(400).json({ error: z.prettifyError(result.error) });
  return;
}

// Hono with @hono/zod-validator
import { zValidator } from '@hono/zod-validator';

router.post('/test', zValidator('json', ProviderSchema), async (c) => {
  const data = c.req.valid('json');
  // ...
});
```

---

### 3.9 `src/server/routes/redteam.ts`

**Endpoints:** 5
**Complexity:** High (job management, AbortController)

| Endpoint         | Method | Notes              |
| ---------------- | ------ | ------------------ |
| `/generate-test` | POST   | Complex validation |
| `/run`           | POST   | Background job     |
| `/status`        | GET    | Job status         |
| `/cancel`        | POST   | AbortController    |
| `/:taskId`       | POST   | Proxy to cloud     |

---

### 3.10 `src/server/routes/eval.ts`

**Endpoints:** 15
**Complexity:** High (largest file, many patterns)

| Endpoint                  | Method | Notes                         |
| ------------------------- | ------ | ----------------------------- |
| `/job`                    | POST   | Create async job              |
| `/job/:id`                | GET    | Poll job status               |
| `/`                       | POST   | Save eval                     |
| `/:id`                    | PATCH  | Update eval                   |
| `/:id/author`             | PATCH  | Update author                 |
| `/:id`                    | DELETE | Delete eval                   |
| `/`                       | DELETE | Bulk delete                   |
| `/:id/copy`               | POST   | Deep copy                     |
| `/:id/table`              | GET    | Paginated results, CSV export |
| `/:id/results`            | POST   | Add results                   |
| `/:id/results/:id/rating` | POST   | Update rating                 |
| `/:id/metadata-keys`      | GET    |                               |
| `/:id/metadata-values`    | GET    |                               |
| `/replay`                 | POST   | Replay test                   |

**CSV export pattern:**

```typescript
// Express
if (format === 'csv') {
  setDownloadHeaders(res, 'eval.csv');
  res.send(generateEvalCsv(table));
  return;
}

// Hono
if (format === 'csv') {
  return new Response(generateEvalCsv(table), {
    headers: getDownloadHeaders('eval.csv'),
  });
}
```

---

### 3.11 `src/server/server.ts` (Main App)

**Complexity:** High

**Changes required:**

1. Replace `express()` with `new Hono()`
2. Mount all route handlers with `app.route()`
3. Update middleware registration
4. Static file serving with `serveStatic()`
5. SPA fallback middleware
6. Socket.io integration

**SPA Fallback Pattern:**

```typescript
// Hono SPA fallback
app.use('*', async (c, next) => {
  await next();
  if (c.res.status === 404 && !c.req.path.startsWith('/api/')) {
    return c.html(await Bun.file(`${staticDir}/index.html`).text());
    // Or for Node.js:
    // return new Response(fs.readFileSync(`${staticDir}/index.html`), {
    //   headers: { 'Content-Type': 'text/html' }
    // });
  }
});
```

---

## Phase 4: Auxiliary Express Usages

### 4.1 `src/commands/mcp/server.ts`

**Current usage:** Creates Express app for MCP HTTP transport
**Lines affected:** ~20

```typescript
// Current
const app = express();
app.use(express.json());

// New
const app = new Hono();
// JSON parsing is automatic in Hono
```

**Note:** The MCP SDK's `StreamableHTTPServerTransport` may have Express-specific expectations. Need to verify compatibility.

---

### 4.2 `src/tracing/otlpReceiver.ts`

**Current usage:** Standalone Express server for OTLP trace ingestion
**Lines affected:** ~50

**Changes:**

- Replace `express()` with `new Hono()`
- Update `express.json()` and `express.raw()` middleware
- Update route handlers
- Update server lifecycle (`listen`, `close`)

**Protobuf handling:**

```typescript
// Express
this.app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));

// Hono
app.post('/v1/traces', async (c) => {
  const contentType = c.req.header('content-type');
  if (contentType === 'application/x-protobuf') {
    const buffer = await c.req.arrayBuffer();
    // Process protobuf...
  } else {
    const json = await c.req.json();
    // Process JSON...
  }
});
```

---

## Phase 5: Test Migration

### Test Pattern Changes

**Supertest compatibility:**
Supertest works with any Node.js HTTP server. For Hono:

```typescript
import { testClient } from 'hono/testing';
import { createHonoApp } from '../server/hono/app';

// Option 1: Use Hono's test client
const client = testClient(createHonoApp());
const res = await client.api.results.$get();

// Option 2: Continue using supertest with HTTP server
import request from 'supertest';
import { createServer } from '@hono/node-server';

const app = createHonoApp();
const server = createServer({ fetch: app.fetch });
const res = await request(server).get('/api/results');
```

### 5.1 Test Files - No Changes Required

- `test/server/routes/version.test.ts` - Pure logic testing
- `test/server/utils/evalTableUtils.test.ts` - Pure utility testing
- `test/server/findStaticDir.test.ts` - FS logic testing

### 5.2 Test Files - Minor Updates

**`test/server/server.test.ts`**

- Update `createApp()` import if function signature changes
- Verify Socket.io integration tests still work

**`test/server/eval.test.ts`**

- Uses supertest - may work as-is with HTTP server adapter

**`test/server/routes/eval.filteredMetrics.test.ts`**

- Similar to eval.test.ts

### 5.3 Test Files - Medium Updates

**`test/server/routes/eval.export.test.ts`**

- Mocks Express Request/Response
- Need to update mocks for Hono Context

**`test/server/routes/providers.test.ts`**

- Uses supertest + app factory

**`test/server/routes/redteam.test.ts`**

- Uses supertest + app factory

**`test/server/routes/modelAudit.test.ts`**

- Uses supertest + process mocking

**`test/server/utils/downloadHelpers.test.ts`**

- Mocks Express Response
- Update to test new header-returning function

**`test/server/routes-eval.test.ts`**

- Tests handler directly
- May need Context mock updates

---

## Phase 6: Integration & Verification

### 6.1 Parallel Running Strategy

During migration, run both servers:

```typescript
// Feature flag approach
if (process.env.USE_HONO_SERVER) {
  await startHonoServer(port);
} else {
  await startExpressServer(port);
}
```

### 6.2 API Contract Testing

Create integration tests that verify:

- All endpoints return same response shapes
- Status codes match
- Headers match (CORS, cache, content-type)
- WebSocket events work

### 6.3 Performance Benchmarking

```bash
# Before migration
autocannon -c 100 -d 30 http://localhost:3000/api/results

# After migration
autocannon -c 100 -d 30 http://localhost:3000/api/results
```

---

## Dependency Changes

### Add

```json
{
  "@hono/node-server": "^1.x",
  "@hono/zod-validator": "^0.x"
}
```

### Remove (after migration)

```json
{
  "express": "^5.x",
  "compression": "^1.x"
}
```

### Keep

```json
{
  "cors": "^2.x", // May still be needed for Socket.io
  "socket.io": "^4.x"
}
```

---

## Risk Mitigation

| Risk                   | Mitigation                           |
| ---------------------- | ------------------------------------ |
| Socket.io breaks       | Test extensively, have rollback plan |
| Performance regression | Benchmark before/after               |
| Subtle API differences | Contract testing                     |
| Test failures          | Fix tests incrementally              |
| Third-party compat     | Verify MCP SDK works                 |

---

## Rollback Plan

1. Keep Express implementation in separate branch
2. Feature flag for server choice
3. If issues found in production:
   - Revert feature flag
   - Investigate root cause
   - Fix and retry

---

## Success Criteria

- [ ] All 60+ API endpoints functional
- [ ] Socket.io real-time updates working
- [ ] Static file serving working
- [ ] SPA routing working
- [ ] All tests passing
- [ ] No performance regression
- [ ] MCP server functional
- [ ] OTLP receiver functional
