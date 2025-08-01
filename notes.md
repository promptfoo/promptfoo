# Drizzle Integration Issues and Fixes

## Critical Issues to Fix

### 1. Synchronous Database Operations (Branch: `fix/drizzle-async-operations`)
**Files affected:**
- `src/models/eval.ts`
- `src/models/evalResult.ts`
- `src/server/routes/eval.ts`

**Changes needed:**
- Remove `.all()` calls and use plain queries which return promises
- Remove `.get()` calls and use plain queries with `.limit(1)`
- Keep `.run()` for inserts/updates/deletes but ensure consistency
- Note: better-sqlite3 is synchronous by design, but Drizzle queries without `.all()/.get()/.run()` return promises

**Specific locations:**
- `src/models/eval.ts:131` - Remove `.all()` and add await
- `src/models/eval.ts:137-144` - Remove `.all()` and add await
- `src/models/eval.ts:180` - Remove `.all()` (already has await)
- `src/models/eval.ts:89` - Already has await, keep as is
- `src/models/eval.ts:753-758` - Inside synchronous transaction, keep as is for now

### 2. Synchronous Transactions (Branch: `fix/drizzle-async-transactions`)
**Files affected:**
- `src/models/eval.ts`
- `src/models/evalResult.ts`

**Changes needed:**
- Convert all `db.transaction(() => {})` to `await db.transaction(async (tx) => {})`
- Replace `db` with `tx` inside transactions
- Add await to all operations inside transactions

**Specific locations:**
- `src/models/eval.ts:213-274` - Large transaction in create() method
- `src/models/eval.ts:753-758` - Transaction in delete() method
- Any other synchronous transactions found

### 3. Drizzle Configuration (Branch: `fix/drizzle-config`)
**Files affected:**
- `drizzle.config.ts`

**Changes needed:**
- Change dialect from 'turso' to 'better-sqlite3'
- Ensure configuration matches the actual driver being used

### 4. Error Handling (Branch: `fix/drizzle-error-handling`)
**Files affected:**
- All files with database operations

**Changes needed:**
- Wrap all database operations in try-catch blocks
- Add proper error logging
- Ensure errors are propagated correctly
- Add transaction rollback on errors

### 5. Performance Optimizations (Branch: `fix/drizzle-performance`)
**Files affected:**
- `src/tracing/store.ts`
- `src/models/eval.ts`

**Changes needed:**
- Fix N+1 queries by using joins or batch operations
- Add missing indexes for frequently queried columns
- Optimize query patterns

### 6. Minor Updates (Branch: `chore/update-drizzle`)
**Changes needed:**
- Update drizzle-orm from 0.44.3 to 0.44.4
- Test for any breaking changes

## Implementation Order

1. **First:** Fix synchronous database operations (most critical)
2. **Second:** Fix synchronous transactions
3. **Third:** Fix Drizzle configuration
4. **Fourth:** Add error handling
5. **Fifth:** Performance optimizations
6. **Last:** Minor version updates

## Testing Strategy

- Run existing tests after each change
- Add new tests for async operations
- Test transaction rollback scenarios
- Performance benchmarks before/after optimizations