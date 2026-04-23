# Database Security (SQL Injection Prevention)

This codebase uses Drizzle ORM with SQLite. All database queries must use parameterized SQL so user-controlled input never changes query structure.

## Quick Rules

- Use Drizzle's `sql` tagged template literals for dynamic values.
- Use `sql.join()` for dynamic lists such as `IN (...)` clauses.
- Pass `SQL<unknown>` fragments between functions, not strings.
- Do not build queries with `sql.raw()` or string interpolation.
- The only exception is SQLite JSON paths. Use the existing vetted helper `buildSafeJsonPath` in `src/models/eval.ts` instead of ad-hoc escaping.

## Required Pattern: Use `sql` Template Strings

Use parameterized queries for single values:

```typescript
import { sql } from 'drizzle-orm';

const query = sql`SELECT * FROM eval_results WHERE eval_id = ${evalId}`;
```

Use parameterized queries for multiple values:

```typescript
import { sql } from 'drizzle-orm';

const query = sql`
  SELECT * FROM eval_results
  WHERE eval_id = ${evalId} AND success = ${1}
`;
```

Use `sql.join()` for dynamic `IN (...)` lists:

```typescript
import { sql } from 'drizzle-orm';

const ids = ['id1', 'id2', 'id3'];
const query = sql`SELECT * FROM evals WHERE id IN (${sql.join(ids, sql`, `)})`;
```

## Forbidden Pattern: Raw SQL with Dynamic Content

Do not interpolate user-controlled values into raw SQL:

```typescript
const query = sql.raw(`SELECT * FROM eval_results WHERE eval_id = '${evalId}'`);
```

Do not build SQL conditions with string concatenation:

```typescript
import { sql } from 'drizzle-orm';

const whereClause = `eval_id = '${evalId}'`;
const query = sql.raw(`SELECT * FROM eval_results WHERE ${whereClause}`);
```

## Special Case: JSON Paths in SQLite

SQLite's `json_extract()` requires the JSON path to be a string literal, so this is the one case where `sql.raw()` may be necessary. Do not hand-roll escaping at each callsite. Always use the existing helper in `src/models/eval.ts`, which escapes:

- Backslashes and double quotes for JSON path syntax
- Single quotes before embedding the path in a SQL string literal

Reuse `buildSafeJsonPath` from `src/models/eval.ts`:

```typescript
import { sql } from 'drizzle-orm';

const jsonPath = buildSafeJsonPath(userField);
const query = sql`
  SELECT * FROM eval_results
  WHERE json_extract(metadata, ${jsonPath}) = ${value}
`;
```

If you need a new JSON-path helper, match the guarantees in `buildSafeJsonPath` and keep the implementation audited in one shared utility.

## Passing SQL Fragments Between Functions

When building complex queries, pass `SQL<unknown>` fragments instead of strings:

```typescript
import { type SQL, sql } from 'drizzle-orm';

function queryWithFilter(whereSql: SQL<unknown>): Promise<Result[]> {
  const query = sql`SELECT * FROM eval_results WHERE ${whereSql}`;
  return db.all(query);
}

const filter = sql`eval_id = ${evalId} AND success = ${1}`;
const results = await queryWithFilter(filter);
```

## Key Files with Database Queries

- `src/models/eval.ts` - Main eval queries and JSON-path helper
- `src/util/calculateFilteredMetrics.ts` - Metrics aggregation queries
- `src/database/index.ts` - Database connection
