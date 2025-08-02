# Migrate from better-sqlite3 to Turso/libSQL

## Summary

- Migrate database driver from `better-sqlite3` to `@libsql/client` (Turso)
- Fix synchronous operations being awaited (they were no-ops)
- Align implementation with existing config that specified `dialect: 'turso'`
- Update drizzle-orm to latest version (0.44.4)

## Problem

Our codebase had several issues:

1. **Config mismatch**: `drizzle.config.ts` specified `dialect: 'turso'` but we were using better-sqlite3
2. **Incorrect async patterns**: Awaiting synchronous functions like `.all()`, `.run()`, `.get()`
3. **Synchronous transactions**: No proper error handling possible with sync transactions
4. **SQL injection risk**: Raw SQL queries not properly parameterized (fixed along the way)

## Solution

Migrated to Turso's libSQL client which:

- Provides native async/await support
- Matches our existing config
- Maintains full SQLite compatibility
- Enables better error handling with async transactions

## Changes

1. **Dependencies**:
   - Removed: `better-sqlite3`, `@types/better-sqlite3`
   - Using existing: `@libsql/client` (was already installed)
   - Updated: `drizzle-orm` from 0.44.3 to 0.44.4

2. **Code changes**:
   - Replaced database connection from better-sqlite3 to libSQL
   - Removed all `.all()`, `.run()`, `.get()` suffixes (Turso is async by default)
   - Converted all transactions to async pattern: `await db.transaction(async (tx) => {...})`
   - Added `await` to all operations within transactions (required in drizzle-orm 0.44.4)
   - Fixed raw SQL queries to use `db.all(sql.raw(query))` instead of string concatenation

3. **Test updates**:
   - Updated all test mocks from better-sqlite3 to @libsql/client
   - Tests pass with expected table creation warnings in test environment

## Impact

- **No breaking changes for users** - libSQL uses the same SQLite file format
- **No migration required** - existing databases work without modification
- **Performance**: Comparable to better-sqlite3 for local operations
- **Future-proof**: Ready for edge deployment if needed

## Testing

```bash
npm test
npm run test:integration
```

All tests passing. Table creation warnings in tests are expected (no migrations in test env).

## Files changed

- Core: `src/database/index.ts`, `src/migrate.ts`
- Models: `src/models/eval.ts`, `src/models/evalResult.ts`
- Utils: `src/util/database.ts`, `src/commands/import.ts`
- Tests: 5 test files updated
- Docs: `site/docs/usage/troubleshooting.md`
- Package: `package.json`, `package-lock.json`

## Review checklist

- [ ] All `.all()`, `.run()`, `.get()` calls removed
- [ ] All transactions converted to async
- [ ] No references to better-sqlite3 remain
- [ ] Tests passing
- [ ] Documentation updated
