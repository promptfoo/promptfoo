# Turso vs better-sqlite3 Analysis for PromptFoo (2025)

## Current Situation
- **Current setup**: Using `better-sqlite3` with Drizzle ORM
- **Config issue**: `drizzle.config.ts` specifies `dialect: 'turso'` but actually using better-sqlite3
- **Dependencies**: Both `@libsql/client` (v0.15.10) and `better-sqlite3` (v11.10.0) are installed

## Key Differences

### 1. **Architecture**
- **better-sqlite3**: Node.js SQLite3 bindings, synchronous by design, local-only
- **Turso/libSQL**: Fork of SQLite with additional features, supports both local and remote databases

### 2. **Transaction Support**
- **better-sqlite3**: Synchronous transactions only (by design for performance)
- **Turso/libSQL**: Full async/await transaction support with Drizzle ORM

### 3. **Features Comparison**

| Feature | better-sqlite3 | Turso/libSQL |
|---------|---------------|--------------|
| Local SQLite | ✅ | ✅ |
| Remote database | ❌ | ✅ |
| Async transactions | ❌ | ✅ |
| Edge deployment | ❌ | ✅ |
| Embedded sync | ❌ | ✅ |
| Additional ALTER statements | ❌ | ✅ |
| Built-in encryption | ❌ | ✅ |
| Connection protocols | Node.js only | HTTP, WebSocket, WASM |
| Performance | Excellent (sync) | Excellent (async with io_uring) |

### 4. **Code Impact**

#### Current code (better-sqlite3):
```typescript
// Synchronous transactions
db.transaction(() => {
  db.insert(table).values(data).run();
  // No await needed/possible
});

// Queries need .all()/.get()/.run()
const results = db.select().from(table).all();
```

#### With Turso/libSQL:
```typescript
// Async transactions
await db.transaction(async (tx) => {
  await tx.insert(table).values(data);
  // Natural async/await flow
});

// Queries are naturally async
const results = await db.select().from(table);
```

## Pros and Cons for PromptFoo

### Staying with better-sqlite3
**Pros:**
- No migration needed
- Excellent performance for local operations
- Simple, battle-tested
- Smaller dependency footprint

**Cons:**
- No async transactions (awkward error handling)
- Local-only (no edge deployment options)
- Limited to Node.js environments
- Config mismatch needs fixing

### Switching to Turso/libSQL
**Pros:**
- Natural async/await patterns throughout
- Future-proof for edge deployment
- Better error handling with async transactions
- Additional SQLite features
- Config already says 'turso' dialect
- Can still use local SQLite files
- Better for distributed/cloud deployments

**Cons:**
- Migration effort required
- Slightly larger dependency
- May need to update some synchronous code patterns

## Recommendation

**Switch to Turso/libSQL** for the following reasons:

1. **Better async patterns**: Your codebase already tries to use async patterns with transactions, which Turso supports natively
2. **Config alignment**: Your Drizzle config already specifies 'turso' dialect
3. **Future flexibility**: Turso gives you options for edge deployment without code changes
4. **Better error handling**: Async transactions allow proper try/catch patterns
5. **Minimal migration**: Most of your code uses Drizzle ORM abstraction, so changes are minimal

## Migration Path

1. Update `src/database/index.ts` to use libSQL client
2. Remove `.all()`, `.get()`, `.run()` calls (Turso queries are async by default)
3. Update transaction patterns to use async/await
4. Test thoroughly
5. Remove better-sqlite3 dependency

The migration would actually simplify your code by making everything consistently async, which aligns better with Node.js best practices.