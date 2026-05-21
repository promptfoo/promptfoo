# Database Security (SQL Injection Prevention)

This codebase uses Drizzle ORM with SQLite. All database queries must use parameterized SQL so user-controlled input never changes query structure.

## Quick Rules

- Use Drizzle's `sql` tagged template literals for dynamic values.
- Use `sql.join()` for dynamic lists such as `IN (...)` clauses.
- Pass `SQL<unknown>` fragments between functions, not strings.
- Do not build queries with `sql.raw()` or string interpolation.
- Prefer `json_each()` for user-selected JSON keys. If a SQLite JSON path must be constructed, build it as a parameterized string value and escape dynamic key segments with the vetted `escapeJsonPathKey` helper in `src/models/eval.ts`.

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

SQLite's `json_extract()` accepts the JSON path as a bound value. Do not use `sql.raw()` to splice user-controlled JSON paths into SQL. Prefer `json_each()` when filtering by dynamic keys, because the key can be compared as a normal parameter:

```typescript
import { sql } from 'drizzle-orm';

const query = sql`
  SELECT *
  FROM eval_results
  WHERE EXISTS (
    SELECT 1
    FROM json_each(metadata)
    WHERE json_each.key = ${field} AND json_each.value = ${value}
  )
`;
```

If you must construct a JSON path for `json_extract()`, escape dynamic key segments with `escapeJsonPathKey` from `src/models/eval.ts`, which escapes:

- Backslashes and double quotes for JSON path syntax

Reuse `escapeJsonPathKey` and bind the final path as a value:

```typescript
import { sql } from 'drizzle-orm';
import { escapeJsonPathKey } from '../../src/models/eval';

const jsonPath = `$."${escapeJsonPathKey(userField)}"`;
const query = sql`
  SELECT * FROM eval_results
  WHERE json_extract(metadata, ${jsonPath}) = ${value}
`;
```

If you need a new JSON-path helper, match the guarantees in `escapeJsonPathKey` and keep the implementation audited in one shared utility.

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
