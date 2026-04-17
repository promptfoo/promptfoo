# Database Security (SQL Injection Prevention)

This codebase uses Drizzle ORM with SQLite. **All database queries MUST use parameterized queries** to prevent SQL injection.

## Required Pattern: Use `sql` Template Strings

```typescript
import { sql } from 'drizzle-orm';

// CORRECT: Parameterized query - values are safely escaped
const query = sql`SELECT * FROM eval_results WHERE eval_id = ${evalId}`;

// CORRECT: Multiple parameters
const query = sql`
  SELECT * FROM eval_results
  WHERE eval_id = ${evalId} AND success = ${1}
`;

// CORRECT: Using sql.join() for IN clauses
const ids = ['id1', 'id2', 'id3'];
const query = sql`SELECT * FROM evals WHERE id IN (${sql.join(ids, sql`, `)})`;
```

## Forbidden Pattern: String Interpolation with `sql.raw()`

```typescript
// WRONG: SQL injection vulnerability!
const query = sql.raw(`SELECT * FROM eval_results WHERE eval_id = '${evalId}'`);

// WRONG: String concatenation
const whereClause = `eval_id = '${evalId}'`;
const query = sql.raw(`SELECT * FROM eval_results WHERE ${whereClause}`);
```

## Special Case: JSON Paths in SQLite

SQLite's `json_extract()` requires literal string paths (cannot be parameterized). When user input affects JSON paths, use proper escaping:

```typescript
// JSON paths require sql.raw() but MUST be escaped
const buildSafeJsonPath = (field: string): ReturnType<typeof sql.raw> => {
  // Escape backslashes and double quotes for JSON path syntax
  const escapedField = field.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const jsonPathContent = `$."${escapedField}"`;
  // Escape single quotes for SQL string literal
  const sqlSafeJsonPath = jsonPathContent.replace(/'/g, "''");
  return sql.raw(`'${sqlSafeJsonPath}'`);
};

// Usage with escaped path
const query = sql`
  SELECT * FROM eval_results
  WHERE json_extract(metadata, ${buildSafeJsonPath(userField)}) = ${value}
`;
```

## Passing SQL Fragments Between Functions

When building complex queries, pass `SQL<unknown>` fragments instead of strings:

```typescript
import { type SQL, sql } from 'drizzle-orm';

// CORRECT: Function accepts SQL fragment
function queryWithFilter(whereSql: SQL<unknown>): Promise<Result[]> {
  const query = sql`SELECT * FROM eval_results WHERE ${whereSql}`;
  return db.all(query);
}

// CORRECT: Caller builds SQL fragment
const filter = sql`eval_id = ${evalId} AND success = ${1}`;
const results = await queryWithFilter(filter);
```

## Key Files with Database Queries

- `src/models/eval.ts` - Main eval queries, filter building
- `src/util/calculateFilteredMetrics.ts` - Metrics aggregation queries
- `src/database/index.ts` - Database connection
