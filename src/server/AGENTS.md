# Server Development Guide

## Overview

Express.js server with standardized middleware for API responses and request validation.

## Directory Structure

```
src/server/
├── middleware/         # Shared middleware
│   ├── apiResponse.ts  # Error/success response utilities
│   ├── validateRequest.ts # Zod request validation
│   └── index.ts        # Barrel export
├── routes/            # API route handlers
└── index.ts           # Server entry point
```

## Middleware

### Error Responses

Use `handleRouteError` for consistent catch block handling:

```typescript
import { handleRouteError } from '../middleware';

router.get('/', async (req, res) => {
  try {
    // ... route logic
  } catch (error) {
    handleRouteError(res, error, 'fetching configs', logger);
    // Logs: "Error fetching configs: <message>"
    // Returns: { success: false, error: "Failed fetching configs" }
  }
});
```

For specific error responses:

```typescript
import { sendError, HttpStatus } from '../middleware';

// Not found
sendError(res, HttpStatus.NOT_FOUND, 'Config not found');

// Bad request with details
sendError(res, HttpStatus.BAD_REQUEST, 'Invalid input', 'Expected numeric ID');
```

### Type-Safe Parameter Extraction

Avoid `any` casts with type-safe extractors:

```typescript
import { getQueryString, getQueryNumber, getQueryBoolean, getParam } from '../middleware';

// Query parameters
const type = getQueryString(req, 'type'); // string | undefined
const limit = getQueryNumber(req, 'limit', 10); // number (defaults to 10)
const active = getQueryBoolean(req, 'active'); // boolean (defaults to false)

// Route parameters
const id = getParam(req, 'id'); // string (empty string if missing)
```

### Request Validation

Use `validateRequest` middleware with Zod schemas:

```typescript
import { validateRequest, type ValidatedRequest } from '../middleware';
import { z } from 'zod';

const CreateConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['redteam', 'eval']),
});

router.post(
  '/',
  validateRequest({ body: CreateConfigSchema }),
  async (req: ValidatedRequest<{}, {}, z.infer<typeof CreateConfigSchema>>, res) => {
    const { name, type } = req.body; // Fully typed!
  },
);
```

### Success Responses

For new endpoints, optionally use wrapped success responses:

```typescript
import { sendSuccess, HttpStatus } from '../middleware';

// 200 OK with data wrapper
sendSuccess(res, { items: [...] });

// 201 Created
sendSuccess(res, { id: '123' }, HttpStatus.CREATED);
```

## Response Formats

### Error Response Shape

```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": "Optional additional details"
}
```

### Success Response Shape (wrapped)

```json
{
  "success": true,
  "data": {
    /* response payload */
  }
}
```

## Best Practices

1. **Use middleware utilities** instead of manual `res.status().json()`
2. **Extract parameters** with type-safe extractors, not `as` casts
3. **Centralize error handling** with `handleRouteError`
4. **Validate requests** at the router level with Zod schemas
5. **Use DTOs** from `src/dtos/` for response types
