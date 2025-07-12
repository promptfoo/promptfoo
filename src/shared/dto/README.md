# Shared DTOs

This directory contains Data Transfer Object (DTO) definitions that are shared between the frontend app and backend server.

## Structure

Each DTO file follows this pattern:
- Uses Zod for runtime validation and TypeScript type generation
- Groups schemas by entity (e.g., User, Eval, Job)
- Exports both Zod schemas and TypeScript types

## Usage

### Backend (Server)
```typescript
import { UserDTOSchemas } from '../shared/dto';

// Use in route handlers
const result = UserDTOSchemas.Update.Request.parse(req.body);
```

### Frontend (App)
```typescript
import type { UserUpdateRequest, UserUpdateResponse } from '@promptfoo/shared/dto';

// Use for type-safe API calls
const response: UserUpdateResponse = await updateUser(data);
```

## Adding New DTOs

1. Create a new file in this directory following the naming pattern: `{entity}.dto.ts`
2. Define Zod schemas for request/response validation
3. Export TypeScript types using `z.infer`
4. Add exports to `index.ts`

Example:
```typescript
import { z } from 'zod';

export const EntityDTOSchemas = {
  Create: {
    Request: z.object({
      name: z.string(),
    }),
    Response: z.object({
      id: z.string(),
      name: z.string(),
    }),
  },
};

export type EntityCreateRequest = z.infer<typeof EntityDTOSchemas.Create.Request>;
export type EntityCreateResponse = z.infer<typeof EntityDTOSchemas.Create.Response>;
```