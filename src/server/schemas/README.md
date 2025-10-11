# API Schema Organization

This directory contains the centralized API contract shared between frontend and backend with runtime validation using Zod.

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────┐
│ Layer 3: API Schemas (api)             │
│ Resource-organized endpoints            │
│ api.user.email.get.res                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ Layer 2: Common Composites (Schema)    │
│ Frequently used patterns                │
│ Schema.id, Schema.message, etc.        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ Layer 1: Primitive Fields (Field)      │
│ Atomic building blocks                  │
│ Field.id, Field.email, etc.            │
└─────────────────────────────────────────┘
```

### File Structure

```
src/server/schemas/
├── index.ts     # Main exports
├── common.ts    # Field + Schema primitives/composites
├── api.ts       # Complete API contract
└── README.md    # This file
```

## Naming Conventions

### Resource-First Organization

```
api.{resource}.{endpoint}.{method}.{part}
```

- **resource**: Domain object (user, eval, results, traces, etc.)
- **endpoint**: Specific endpoint (email, byId, list, etc.)
- **method**: HTTP method (get, post, update, delete)
- **part**: Request/response part (params, query, body, res)

### Examples

| HTTP Route                   | Schema Path                              |
| ---------------------------- | ---------------------------------------- |
| `GET /api/user/email`        | `api.user.email.get.res`                 |
| `PATCH /api/eval/:id/author` | `api.eval.author.update.params/body/res` |
| `GET /api/results?type=eval` | `api.results.list.query/res`             |
| `GET /api/traces/:traceId`   | `api.traces.byId.params/res`             |

### HTTP Terminology

- **params**: Path parameters (`:id`, `:traceId`, etc.)
- **query**: Query string parameters (`?type=eval&limit=50`)
- **body**: Request body (POST/PUT/PATCH payload)
- **res**: Response body

## Usage

### Backend Usage

```typescript
import { api } from './schemas';

// Validate path params
app.get('/eval/:id', async (req, res) => {
  const { id } = api.eval.byId.get.params.parse(req.params);
  // TypeScript knows: { id: string }
});

// Validate query params
app.get('/results', async (req, res) => {
  const query = api.results.list.query.parse(req.query);
  // TypeScript knows: { datasetId?: string, type?: 'redteam' | 'eval', ... }
});

// Validate request body
app.post('/user/email', async (req, res) => {
  const { email } = api.user.email.update.body.parse(req.body);
  // TypeScript knows: { email: string } (validated email format)
});

// Validate response
app.get('/user/email', async (req, res) => {
  const email = getUserEmail();
  res.json(api.user.email.get.res.parse({ email: email || null }));
  // Runtime validation + TypeScript types
});
```

### Frontend Usage

```typescript
import { api } from '@promptfoo/server/schemas';
import { callApiValidated } from '@app/utils/api';

// Validated API calls with automatic type inference
const userData = await callApiValidated('/user/email', api.user.email.get.res);
// TypeScript automatically knows: { email: string | null }

const evalData = await callApiValidated(`/eval/${id}/author`, api.eval.author.update.res, {
  method: 'PATCH',
  body: JSON.stringify({ author: email }),
});
// TypeScript knows: { message: string }
```

### Type Extraction

Use the provided type helpers for manual type extraction:

```typescript
import { api, type ApiParams, type ApiResponse } from '@promptfoo/server/schemas';

// Extract parameter types
type EvalParams = ApiParams<typeof api.eval.byId.delete>;
// { id: string }

// Extract query types
type ResultsQuery = ApiQuery<typeof api.results.list>;
// { datasetId?: string, type?: 'redteam' | 'eval', includeProviders?: boolean }

// Extract body types
type UpdateAuthor = ApiBody<typeof api.eval.author.update>;
// { author: string }

// Extract response types
type UserEmail = ApiResponse<typeof api.user.email.get>;
// { email: string | null }
```

## DRY Principles

### Primitive Fields (Field)

Reusable atomic schemas:

```typescript
Field.id; // z.string().min(1)
Field.email; // z.string().email()
Field.message; // z.string()
Field.boolean; // z.boolean()
Field.sha256; // z.string().regex(/^[a-f0-9]{64}$/)
```

### Common Composites (Schema)

Frequently used object patterns:

```typescript
Schema.id; // { id: string }
Schema.message; // { message: string }
Schema.success; // { success: boolean, message: string }
Schema.error; // { error: string }
```

### Before/After Comparison

**Before:**

```typescript
// Repeated 15+ times across the codebase
const ParamsSchema = z.object({ id: z.string() });
const ResponseSchema = z.object({ message: z.string() });
```

**After:**

```typescript
// Defined once, reused everywhere
const params = Schema.id;
const res = Schema.message;
```

## Benefits

### ✅ Discoverability

Type `api.user.` and autocomplete shows:

- email
- id
- login
- logout
- cloudConfig

Type `api.user.email.` and see:

- get
- update
- status

### ✅ Clear Mapping

The schema path mirrors the HTTP route:

- Route: `GET /api/eval/:id` → Schema: `api.eval.byId.get.params`
- Route: `PATCH /api/user/email` → Schema: `api.user.email.update.body`

### ✅ Type Safety

Full TypeScript inference without manual type definitions:

```typescript
// No manual types needed!
const data = await callApiValidated('/user/email', api.user.email.get.res);
// TypeScript knows the exact shape: { email: string | null }
```

### ✅ Composability

Build complex schemas from simple parts:

```typescript
// Compose from primitives
const UserSchema = z.object({
  id: Field.id,
  email: Field.email,
  verified: Field.boolean,
});

// Extend common patterns
const CustomResponse = Schema.success.extend({
  data: UserSchema,
});
```

### ✅ Runtime Safety

Catch breaking changes immediately:

```typescript
// Backend changes response structure
api.user.email.get.res = z.object({
  email: Field.email.nullable(),
  verified: Field.boolean, // NEW FIELD
});

// Frontend code breaks at runtime with clear error
// Error: "verified: Required"
// You know immediately the API contract changed!
```

## Adding New Routes

### 1. Add primitives if needed

```typescript
// src/server/schemas/common.ts
export const Field = {
  // ... existing fields
  username: z.string().min(3).max(20),
};
```

### 2. Add common patterns if reusable

```typescript
// src/server/schemas/common.ts
export const Schema = {
  // ... existing schemas
  pagination: z.object({
    limit: z.coerce.number().positive().default(50),
    offset: z.coerce.number().nonnegative().default(0),
  }),
};
```

### 3. Add to API contract

```typescript
// src/server/schemas/api.ts
export const api = {
  user: {
    // ... existing endpoints
    profile: {
      get: {
        params: Schema.id,
        res: z.object({
          id: Field.id,
          email: Field.email,
          username: Field.username,
        }),
      },
      update: {
        params: Schema.id,
        body: z.object({
          username: Field.username,
        }),
        res: Schema.success,
      },
    },
  },
};
```

### 4. Use in backend route

```typescript
app.get('/user/:id/profile', async (req, res) => {
  const { id } = api.user.profile.get.params.parse(req.params);
  const user = await getUser(id);
  res.json(api.user.profile.get.res.parse(user));
});
```

### 5. Use in frontend

```typescript
const profile = await callApiValidated(`/user/${userId}/profile`, api.user.profile.get.res);
// TypeScript knows: { id: string, email: string, username: string }
```

## Migration Guide

### Backwards Compatibility

The old `ApiSchemas` is available as an alias during migration:

```typescript
// Old code still works
import { ApiSchemas } from '@promptfoo/server/schemas';
const { id } = ApiSchemas.User.Get.Response.parse(...);

// But prefer new structure
import { api } from '@promptfoo/server/schemas';
const { id } = api.user.id.get.res.parse(...);
```

### Migration Pattern

1. **Find old usage**: `ApiSchemas.Resource.Action.Part`
2. **Convert to new**: `api.resource.endpoint.method.part`
3. **Update naming**:
   - `Request` → `body`
   - `Response` → `res`
   - `Params` → `params`
   - `Query` → `query`

### Examples

| Old                                    | New                           |
| -------------------------------------- | ----------------------------- |
| `ApiSchemas.User.Get.Response`         | `api.user.email.get.res`      |
| `ApiSchemas.Eval.UpdateAuthor.Request` | `api.eval.author.update.body` |
| `ApiSchemas.Results.List.Query`        | `api.results.list.query`      |
| `ApiSchemas.Traces.GetById.Params`     | `api.traces.byId.params`      |

## Best Practices

### DO ✅

- Use `Field` primitives for atomic values
- Use `Schema` composites for common patterns
- Follow the `api.resource.endpoint.method.part` naming
- Validate all inputs (params, query, body)
- Validate critical outputs (especially public APIs)
- Use `callApiValidated()` in frontend for type safety

### DON'T ❌

- Create new schemas for common patterns - reuse `Schema.*`
- Repeat primitive validations - use `Field.*`
- Use inconsistent naming - follow conventions
- Skip validation "to save time" - runtime safety is critical
- Use `any` types - defeats the purpose

## Performance

### Bundle Size Impact

- Zod core: ~9KB gzipped
- Our schemas: ~3KB gzipped
- **Total:** ~12KB for complete type safety

For a development tool like Promptfoo, this is negligible.

### Runtime Performance

Schema validation is fast:

- Simple schema: ~1-10μs
- Complex nested: ~10-100μs
- Negligible compared to network latency (50-500ms)

## Resources

- [Zod Documentation](https://zod.dev)
- [tRPC Pattern Reference](https://trpc.io)
- [OpenAPI/Swagger](https://swagger.io/specification/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
