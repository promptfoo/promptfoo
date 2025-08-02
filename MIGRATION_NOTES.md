# Turso/libSQL Migration Notes

## What Changed

- Migrated from `better-sqlite3` to `@libsql/client` (Turso's SQLite fork)
- All database operations are now properly asynchronous
- Removed `.all()`, `.run()`, `.get()` suffixes from queries
- Converted all transactions to async pattern

## Why This Change

1. **Config Alignment**: `drizzle.config.ts` already specified `dialect: 'turso'`
2. **Better Async Support**: Native async/await throughout, no more synchronous transactions
3. **Future-Proof**: Ready for edge deployment if needed
4. **Better Error Handling**: Async transactions allow proper try/catch blocks

## Migration Path for Users

- **No action required** - libSQL uses the same SQLite file format
- Existing databases will work without modification
- WAL mode is enabled by default in libSQL

## Performance Considerations

- libSQL has comparable performance to better-sqlite3 for local operations
- Async operations may have slight overhead but enable better concurrency
- WAL mode enabled by default improves write performance

## Testing

- All existing tests updated and passing
- Table creation warnings in tests are expected (no migrations in test env)
- Mock changes: `better-sqlite3` → `@libsql/client`

## Breaking Changes

- None for end users
- Developers: Database operations must now be awaited

## Rollback Plan

If issues arise, revert these commits:

1. Revert Turso migration commit
2. Revert transaction async changes
3. Revert initial async operations fix
