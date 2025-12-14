# Node.js Native SQLite vs better-sqlite3: Deep Analysis

This document analyzes the trade-offs between continuing to ship `better-sqlite3` as a native dependency versus migrating to Node.js's built-in `node:sqlite` module.

---

## Executive Summary

| Factor | better-sqlite3 | Node.js native (`node:sqlite`) |
|--------|----------------|-------------------------------|
| **Stability** | Production-ready (8+ years) | Experimental (Stability 1.1) |
| **Performance** | Fastest | Nearly identical (~5% slower) |
| **Native compilation** | Required per platform | None (built into Node.js) |
| **Drizzle ORM support** | Full support | No adapter exists |
| **Bundle complexity** | High (prebuild per platform) | Zero |
| **Node.js version** | 18+ | 22+ (flag), 23.4+ (no flag) |
| **Custom SQLite builds** | Supported | Not supported |

**Recommendation:** Continue with `better-sqlite3` for pip/binary distribution in the short term. Plan migration to native SQLite when:
1. Node.js 24+ becomes LTS (April 2025)
2. Drizzle ORM adds `node:sqlite` adapter
3. Native module reaches Stability 2

---

## 1. Current State: better-sqlite3 in promptfoo

### 1.1 Usage Pattern

```typescript
// src/database/index.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqliteInstance = new Database(dbPath);
sqliteInstance.pragma('foreign_keys = ON');
sqliteInstance.pragma('journal_mode = WAL');
sqliteInstance.pragma('synchronous = NORMAL');
sqliteInstance.pragma('wal_autocheckpoint = 1000');

const db = drizzle(sqliteInstance, { logger: drizzleLogger });
```

### 1.2 Key Dependencies

```
promptfoo
├── better-sqlite3 (direct dependency)
├── drizzle-orm
│   └── drizzle-orm/better-sqlite3 (adapter)
└── drizzle-orm/better-sqlite3/migrator
```

### 1.3 Features Used

| Feature | Usage in promptfoo |
|---------|-------------------|
| WAL mode | Enabled for concurrent read/write |
| Foreign keys | Enforced for referential integrity |
| Pragmas | Multiple performance tuning |
| Transactions | Used in `deleteEval`, `deleteEvals`, etc. |
| Prepared statements | All queries via Drizzle ORM |
| In-memory DB | Used for testing (`:memory:`) |

---

## 2. Node.js Native SQLite Module

### 2.1 Availability Timeline

| Node.js Version | Status | Flag Required |
|-----------------|--------|---------------|
| 22.5.0 | Introduced | `--experimental-sqlite` |
| 23.0.0 | Improved | `--experimental-sqlite` |
| 23.4.0 | No flag needed | None |
| 24.0.0 (future) | Expected stable | None |
| 25.x (current) | Active development | None |

### 2.2 API Comparison

#### Database Initialization

```typescript
// better-sqlite3
import Database from 'better-sqlite3';
const db = new Database('app.db');
db.pragma('foreign_keys = ON');

// node:sqlite
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('app.db', {
  enableForeignKeyConstraints: true,  // Built-in option
});
```

#### Pragma Configuration

```typescript
// better-sqlite3
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

// node:sqlite
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
// OR use constructor options:
const db = new DatabaseSync('app.db', {
  timeout: 5000,  // busy_timeout equivalent
});
```

#### Prepared Statements

```typescript
// better-sqlite3
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(1);
const users = stmt.all();

// node:sqlite (identical API!)
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(1);
const users = stmt.all();
```

#### Transactions

```typescript
// better-sqlite3
db.transaction(() => {
  db.prepare('INSERT INTO users VALUES (?)').run('Alice');
  db.prepare('INSERT INTO users VALUES (?)').run('Bob');
})();

// node:sqlite (no built-in transaction helper)
db.exec('BEGIN TRANSACTION');
try {
  db.prepare('INSERT INTO users VALUES (?)').run('Alice');
  db.prepare('INSERT INTO users VALUES (?)').run('Bob');
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
```

### 2.3 Features NOT in node:sqlite

| Feature | better-sqlite3 | node:sqlite |
|---------|----------------|-------------|
| `.pragma()` method | ✅ | ❌ (use `.exec()`) |
| `.transaction()` helper | ✅ | ❌ (manual BEGIN/COMMIT) |
| User-defined functions | ✅ | ✅ |
| Aggregate functions | ✅ | ✅ |
| Custom SQLite builds | ✅ | ❌ |
| Backup API | ✅ | ✅ (added v23.3.0) |
| Session/Changeset | ❌ | ✅ |

### 2.4 Unique node:sqlite Features

```typescript
// SQLTagStore - LRU cache for prepared statements
const sql = db.createTagStore(500);
const user = sql.get`SELECT * FROM users WHERE id = ${userId}`;

// Sessions for change tracking (replication)
const session = db.createSession();
// ... make changes ...
const changeset = session.changeset();
targetDb.applyChangeset(changeset);

// Authorization callbacks
db.setAuthorizer((action, arg1, arg2, dbName, trigger) => {
  if (action === constants.SQLITE_DROP_TABLE) {
    return constants.SQLITE_DENY;
  }
  return constants.SQLITE_OK;
});
```

---

## 3. Performance Comparison

### 3.1 Benchmark Results (2025)

From [better-sqlite3#1266](https://github.com/WiseLibs/better-sqlite3/issues/1266):

> Performance between `node:sqlite` and `better-sqlite3` is "almost indistinguishable"

| Operation | better-sqlite3 | node:sqlite | Difference |
|-----------|----------------|-------------|------------|
| INSERT (single) | 1.0x | 0.95x | ~5% slower |
| SELECT (single) | 1.0x | 0.98x | ~2% slower |
| Bulk INSERT | 1.0x | 0.97x | ~3% slower |
| Bulk SELECT | 1.0x | 0.99x | ~1% slower |

**Conclusion:** Performance is not a differentiator.

### 3.2 Why better-sqlite3 Was Historically Faster

- Optimized C++ bindings with minimal overhead
- Synchronous-only API avoids async/callback overhead
- Careful memory management

Node.js native module uses similar techniques, closing the gap.

---

## 4. Drizzle ORM Compatibility

### 4.1 Current State

```typescript
// Currently supported adapters in drizzle-orm
import { drizzle } from 'drizzle-orm/better-sqlite3';     // ✅
import { drizzle } from 'drizzle-orm/bun-sqlite';         // ✅
import { drizzle } from 'drizzle-orm/libsql';             // ✅
import { drizzle } from 'drizzle-orm/node-sqlite';        // ❌ Does not exist
```

### 4.2 Migration Complexity

To migrate promptfoo from better-sqlite3 to node:sqlite, we would need:

1. **Drizzle adapter**: Create or wait for `drizzle-orm/node-sqlite`
2. **Migrator**: Port `drizzle-orm/better-sqlite3/migrator`
3. **Transaction wrapper**: Implement transaction helper
4. **Pragma handling**: Convert `.pragma()` calls to `.exec()`

### 4.3 Estimated Effort

| Task | Effort | Blocking? |
|------|--------|-----------|
| Wait for Drizzle adapter | 0 (external) | Yes |
| Update database/index.ts | 2 hours | No |
| Update migrate.ts | 1 hour | No |
| Test all database operations | 4 hours | No |
| Update CI for Node.js 24+ | 2 hours | No |

---

## 5. Binary Distribution Impact

### 5.1 With better-sqlite3 (Current Challenge)

```
Platform-specific builds required:
├── linux-x64/better_sqlite3.node     (~3MB)
├── linux-arm64/better_sqlite3.node   (~3MB)
├── darwin-x64/better_sqlite3.node    (~3MB)
├── darwin-arm64/better_sqlite3.node  (~3MB)
├── win32-x64/better_sqlite3.node     (~3MB)
└── linux-musl-x64/better_sqlite3.node (~3MB)
                                      ─────
                                      ~18MB total for all platforms
```

**Build complexity:**
- Requires prebuildify on each platform
- CI matrix: 5-6 different runners
- Native module version must match Node.js version
- Potential ABI compatibility issues

### 5.2 With node:sqlite (Future State)

```
No additional binaries needed:
└── Just ship the bundled JavaScript
```

**Benefits:**
- Single JS bundle works on all platforms
- No prebuild step
- No native module ABI issues
- Smaller package size (~3MB smaller per platform)
- Simpler CI pipeline

---

## 6. Decision Framework

### 6.1 When to Use better-sqlite3

Choose better-sqlite3 when:
- ✅ Need production stability today
- ✅ Using Drizzle ORM (no native adapter yet)
- ✅ Need custom SQLite builds
- ✅ Supporting Node.js < 22
- ✅ Need `.transaction()` helper

### 6.2 When to Use node:sqlite

Choose node:sqlite when:
- ✅ Targeting Node.js 24+ LTS
- ✅ Want to eliminate native compilation
- ✅ Need Session/Changeset features
- ✅ Need Authorization callbacks
- ✅ Not using Drizzle ORM (or adapter exists)

---

## 7. Migration Strategy

### 7.1 Phase 1: Prepare (Now)

1. **Abstract database layer**: Ensure all SQLite access goes through `src/database/index.ts`
2. **Document pragma requirements**: List all pragmas used
3. **Monitor Drizzle ORM**: Watch for `node-sqlite` adapter development
4. **Track Node.js 24 LTS**: Release scheduled April 2025

### 7.2 Phase 2: Implement Adapter (When Drizzle supports it)

```typescript
// Future: src/database/index.ts
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite'; // When available

function createDatabase(dbPath: string) {
  const sqlite = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });

  // Configure WAL mode
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA wal_autocheckpoint = 1000');

  return drizzle(sqlite, { logger: drizzleLogger });
}
```

### 7.3 Phase 3: Validate & Ship

1. Run full test suite
2. Benchmark against better-sqlite3
3. Test on all platforms
4. Update minimum Node.js version to 24+

---

## 8. Recommendations for pip/Binary Distribution

### 8.1 Short-Term (Phase 1-2 of pip install plan)

**Continue with better-sqlite3:**
- Ship prebuilt `.node` files per platform
- Bundle alongside the Node.js SEA binary
- Extract to `~/.promptfoo/lib/` on first run

```
promptfoo-0.121.0-darwin-arm64.tar.gz
├── promptfoo              # SEA binary with embedded Node.js
└── better_sqlite3.node    # Native module for this platform
```

### 8.2 Medium-Term (Phase 3+)

**Prepare for migration:**
- Add feature flag: `PROMPTFOO_USE_NATIVE_SQLITE=1`
- Implement node:sqlite backend in parallel
- Test with early adopters on Node.js 24+

### 8.3 Long-Term (Post Node.js 24 LTS)

**Full migration to node:sqlite:**
- Eliminate native module builds
- Single universal binary per platform
- Simpler CI, smaller packages

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drizzle never adds node:sqlite | Low | High | Fork or create adapter |
| node:sqlite has bugs | Medium | Medium | Feature flag fallback |
| Performance regression | Low | Low | Benchmark before shipping |
| Node.js 24 delayed | Low | Low | Continue with better-sqlite3 |
| better-sqlite3 unmaintained | Low | Medium | node:sqlite as backup |

---

## 10. Conclusion

### Keep better-sqlite3 for Now

For the pip install / binary distribution project, **continue shipping better-sqlite3** because:

1. **Drizzle ORM dependency**: No migration path without adapter
2. **Production stability**: better-sqlite3 is battle-tested
3. **Node.js version**: Can't require Node.js 22+ for binary distribution

### Plan for node:sqlite Migration

Track these milestones:
- [ ] Drizzle ORM releases `drizzle-orm/node-sqlite` adapter
- [ ] Node.js 24 becomes LTS (April 2025)
- [ ] node:sqlite reaches Stability 2

When all three are met, migrate to eliminate native module complexity entirely.

---

## Sources

- [Node.js SQLite Documentation](https://nodejs.org/api/sqlite.html)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
- [better-sqlite3 vs node:sqlite Discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1245)
- [node:sqlite Benchmarking Issue](https://github.com/WiseLibs/better-sqlite3/issues/1266)
- [Native SQLite in Node.js Guide](https://betterstack.com/community/guides/scaling-nodejs/nodejs-sqlite/)
- [Node.js 23 Release Notes](https://blog.risingstack.com/nodejs-23/)
