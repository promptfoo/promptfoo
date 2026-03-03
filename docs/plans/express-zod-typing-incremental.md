# Express Server Zod Typing - Incremental Plan

## Overview

Improve request/response type safety across Express routes using Zod schemas, enabling DTO sharing between client and server.

## Current State Audit

| Route File   | Endpoints | With Zod | No Validation | Type Safety Score |
| ------------ | --------- | -------- | ------------- | ----------------- |
| configs.ts   | 4         | 0        | 4             | 🔴 0%             |
| traces.ts    | 2         | 0        | 2             | 🔴 0%             |
| redteam.ts   | 5         | 1        | 4             | ⚠️ 20%            |
| eval.ts      | 12        | 4        | 7             | ⚠️ 35%            |
| user.ts      | 8         | 4        | 4             | 🟢 50%            |
| providers.ts | 8         | 5        | 2             | 🟢 75%            |
| **Total**    | **51**    | **14**   | **28**        | **~27%**          |

## Architecture: Shared DTOs

### Proposed Structure

```
src/
├── types/
│   └── api/                    # NEW: Shared API types
│       ├── index.ts            # Re-exports all
│       ├── common.ts           # ApiResponse<T>, ApiError, pagination
│       ├── configs.ts          # Config API schemas
│       ├── eval.ts             # Eval API schemas
│       ├── providers.ts        # Provider API schemas
│       ├── redteam.ts          # Redteam API schemas
│       ├── traces.ts           # Traces API schemas
│       └── user.ts             # User API schemas
├── server/
│   ├── apiSchemas.ts           # DEPRECATED: Migrate to src/types/api/
│   └── routes/                 # Import from src/types/api/
└── app/src/
    └── utils/api.ts            # Import from src/types/api/
```

### Shared Type Pattern

```typescript
// src/types/api/common.ts
import { z } from 'zod';

// Standard API response envelope
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

// Infer TypeScript types from schemas
export type ApiResponse<T> = { success: true; data: T };
export type ApiError = z.infer<typeof ApiErrorSchema>;

// Pagination
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
```

### Route Schema Pattern

```typescript
// src/types/api/configs.ts
import { z } from 'zod';

// Request schemas
export const GetConfigsQuerySchema = z.object({
  search: z.string().optional(),
});

// Response schemas
export const ConfigSummarySchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const GetConfigsResponseSchema = z.object({
  configs: z.array(ConfigSummarySchema),
});

// Inferred types for frontend consumption
export type GetConfigsQuery = z.infer<typeof GetConfigsQuerySchema>;
export type ConfigSummary = z.infer<typeof ConfigSummarySchema>;
export type GetConfigsResponse = z.infer<typeof GetConfigsResponseSchema>;
```

---

## Phase 1: Foundation (Week 1)

### 1.1 Create Shared Types Infrastructure

**Files to create:**

- `src/types/api/common.ts` - Base response types, pagination, errors
- `src/types/api/index.ts` - Re-exports

**QA:**

- [ ] TypeScript compiles without errors
- [ ] Types are importable from both server and app

### 1.2 Migrate Existing apiSchemas.ts

**Current location:** `src/server/apiSchemas.ts`
**Target:** `src/types/api/user.ts`, `src/types/api/eval.ts`

**QA:**

- [ ] All existing schema tests pass
- [ ] Server routes still work
- [ ] No duplicate type definitions

---

## Phase 2: Critical Routes (0% Coverage)

### 2.1 configs.ts - 4 Endpoints

| Method | Path           | Current          | Action                        |
| ------ | -------------- | ---------------- | ----------------------------- |
| GET    | `/configs`     | ❌ No validation | Add query + response schemas  |
| GET    | `/configs/:id` | ❌ No validation | Add params + response schemas |
| POST   | `/configs`     | ❌ No validation | Add body + response schemas   |
| DELETE | `/configs/:id` | ❌ No validation | Add params schema             |

**Schemas to create in `src/types/api/configs.ts`:**

```typescript
// Query/Params
GetConfigsQuerySchema;
GetConfigParamsSchema;
CreateConfigBodySchema;
DeleteConfigParamsSchema;

// Responses
ConfigSummarySchema;
ConfigDetailSchema;
GetConfigsResponseSchema;
GetConfigResponseSchema;
CreateConfigResponseSchema;
```

**QA Strategy:**

- [ ] Unit tests for each schema validation
- [ ] Integration test: GET /configs returns valid response
- [ ] Integration test: GET /configs/:id with invalid ID returns 400
- [ ] Integration test: POST /configs with invalid body returns 400
- [ ] Frontend TypeScript: No `any` types when calling config APIs
- [ ] Manual test: Create config via UI, verify response types

### 2.2 traces.ts - 2 Endpoints

| Method | Path          | Current          | Action                        |
| ------ | ------------- | ---------------- | ----------------------------- |
| GET    | `/traces`     | ❌ No validation | Add query + response schemas  |
| GET    | `/traces/:id` | ❌ No validation | Add params + response schemas |

**Schemas to create in `src/types/api/traces.ts`:**

```typescript
GetTracesQuerySchema; // pagination, filters
GetTraceParamsSchema; // id param
TraceSchema; // single trace object
GetTracesResponseSchema; // array + pagination
GetTraceResponseSchema; // single trace detail
```

**QA Strategy:**

- [ ] Unit tests for schema validation
- [ ] Integration test: GET /traces with pagination
- [ ] Integration test: GET /traces/:id returns correct shape
- [ ] Frontend: Traces list component uses typed response

---

## Phase 3: Medium Coverage Routes

### 3.1 redteam.ts - 20% Coverage (5 Endpoints)

**Already has:** `TestCaseGenerationSchema` (partial)

| Method | Path                   | Current          | Action                |
| ------ | ---------------------- | ---------------- | --------------------- |
| POST   | `/redteam/generate`    | ✅ Has schema    | Verify response typed |
| GET    | `/redteam/history`     | ❌ No validation | Add schemas           |
| GET    | `/redteam/history/:id` | ❌ No validation | Add schemas           |
| POST   | `/redteam/run`         | ❌ No validation | Add schemas           |
| DELETE | `/redteam/history/:id` | ❌ No validation | Add params schema     |

**Schemas to create in `src/types/api/redteam.ts`:**

```typescript
// Leverage existing src/validators/redteam.ts
GetHistoryQuerySchema;
GetHistoryItemParamsSchema;
RunRedteamBodySchema;
RedteamHistoryItemSchema;
GetHistoryResponseSchema;
RunRedteamResponseSchema;
```

**QA Strategy:**

- [ ] Unit tests for new schemas
- [ ] Integration test: Full redteam generation flow
- [ ] Integration test: History pagination
- [ ] Frontend: Redteam components use typed responses
- [ ] Manual test: Run redteam scan, verify UI shows results

### 3.2 eval.ts - 35% Coverage (12 Endpoints)

**Already has:** `evalTableQuerySchema`, ApiSchemas.Eval.\*

| Method | Path                         | Current          | Action                   |
| ------ | ---------------------------- | ---------------- | ------------------------ |
| GET    | `/evals`                     | ⚠️ Partial       | Complete response schema |
| GET    | `/evals/:id`                 | ⚠️ Partial       | Add full response schema |
| GET    | `/evals/:id/results`         | ❌ No validation | Add schemas              |
| GET    | `/evals/:id/prompts`         | ❌ No validation | Add schemas              |
| POST   | `/evals/:id/copy`            | ✅ Has schema    | Verify                   |
| PATCH  | `/evals/:id/author`          | ✅ Has schema    | Verify                   |
| DELETE | `/evals/:id`                 | ❌ No validation | Add params schema        |
| GET    | `/evals/:id/metadata/keys`   | ✅ Has schema    | Verify                   |
| GET    | `/evals/:id/metadata/values` | ✅ Has schema    | Verify                   |
| POST   | `/evals/:id/tags`            | ❌ No validation | Add schemas              |
| DELETE | `/evals/:id/tags/:tag`       | ❌ No validation | Add schemas              |
| POST   | `/evals/:id/replay`          | ❌ No validation | Add schemas              |

**Schemas to create/migrate in `src/types/api/eval.ts`:**

```typescript
// Migrate from apiSchemas.ts
EvalUpdateAuthorSchema;
EvalMetadataKeysSchema;
EvalMetadataValuesSchema;
EvalCopySchema;

// New schemas
GetEvalsQuerySchema;
GetEvalParamsSchema;
EvalSummarySchema;
EvalDetailSchema;
EvalResultSchema;
GetEvalsResponseSchema;
GetEvalResponseSchema;
GetEvalResultsResponseSchema;
AddTagBodySchema;
ReplayEvalBodySchema;
ReplayEvalResponseSchema;
```

**QA Strategy:**

- [ ] Migrate existing tests for apiSchemas.ts
- [ ] Unit tests for all new schemas
- [ ] Integration test: List evals with filters
- [ ] Integration test: Get eval details
- [ ] Integration test: Copy eval
- [ ] Integration test: Tag operations
- [ ] Frontend: Eval list/detail pages use typed responses
- [ ] Manual test: Full eval workflow in UI

---

## Phase 4: High Coverage Routes (Polish)

### 4.1 user.ts - 50% Coverage

**Already has:** ApiSchemas.User.\* (good foundation)

**Missing validations:**

- GET `/user/api-keys`
- POST `/user/api-keys`
- DELETE `/user/api-keys/:id`
- GET `/user/preferences`
- PATCH `/user/preferences`

**QA Strategy:**

- [ ] Complete schema coverage
- [ ] Integration tests for API key management
- [ ] Frontend: User settings use typed responses

### 4.2 providers.ts - 75% Coverage

**Already has:** `TestPayloadSchema`, `TestRequestTransformSchema`

**Missing validations:**

- GET `/providers` response
- GET `/providers/:id` response

**QA Strategy:**

- [ ] Add response schemas
- [ ] Integration test: Provider list/detail
- [ ] Frontend: Provider selector uses typed data

---

## Phase 5: Frontend Integration

### 5.1 Update callApi Utility

```typescript
// src/app/src/utils/api.ts
import type { ApiResponse, ApiError } from '@/../types/api';

export async function callApi<T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T> | ApiError> {
  // ... existing implementation
  // Return type is now properly typed
}

// Typed API functions
import { GetEvalsResponse, GetEvalsQuery } from '@/../types/api/eval';

export async function getEvals(query?: GetEvalsQuery): Promise<GetEvalsResponse> {
  const response = await callApi<GetEvalsResponse>(`/api/evals?${qs(query)}`);
  if (!response.success) throw new Error(response.error);
  return response.data;
}
```

### 5.2 Remove Inline Type Definitions

**Files to update:**

- `src/app/src/hooks/useEvals.ts` - Use shared types
- `src/app/src/hooks/useConfigs.ts` - Use shared types
- `src/app/src/pages/eval/components/*` - Use shared types

**QA Strategy:**

- [ ] No `any` types in API calls
- [ ] No duplicate type definitions
- [ ] TypeScript strict mode passes
- [ ] All existing tests pass

---

## Implementation Order

1. **PR 1: Foundation** - Create `src/types/api/common.ts` with base types
2. **PR 2: configs.ts** - Full type safety (0% → 100%)
3. **PR 3: traces.ts** - Full type safety (0% → 100%)
4. **PR 4: redteam.ts** - Complete coverage (20% → 100%)
5. **PR 5: eval.ts** - Migrate and complete (35% → 100%)
6. **PR 6: user.ts + providers.ts** - Polish (50%/75% → 100%)
7. **PR 7: Frontend** - Use shared types, remove duplicates

## Testing Matrix

| Route        | Unit Tests | Integration Tests | Frontend Types | Manual QA |
| ------------ | ---------- | ----------------- | -------------- | --------- |
| configs.ts   | ⬜         | ⬜                | ⬜             | ⬜        |
| traces.ts    | ⬜         | ⬜                | ⬜             | ⬜        |
| redteam.ts   | ⬜         | ⬜                | ⬜             | ⬜        |
| eval.ts      | ⬜         | ⬜                | ⬜             | ⬜        |
| user.ts      | ⬜         | ⬜                | ⬜             | ⬜        |
| providers.ts | ⬜         | ⬜                | ⬜             | ⬜        |

## Success Metrics

- **Type Safety Score:** 27% → 100%
- **Shared DTOs:** 0 → All API types in `src/types/api/`
- **Frontend `any` types:** Eliminate in API layer
- **Schema Validation:** All 51 endpoints validated
- **Test Coverage:** Integration tests for all endpoints

## Notes

- Each PR should be self-contained and independently mergeable
- Run full test suite before each PR
- Update frontend components incrementally as backend types are added
- Consider generating OpenAPI spec from Zod schemas (future enhancement)
