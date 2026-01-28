---
name: fix-any-types
description: Convert poorly-typed TypeScript code with `any` to use proper type annotations
---

# Fix TypeScript `any` Types Skill

This skill helps convert poorly-typed TypeScript code to use better type annotations, following the patterns and best practices established in this codebase.

## Principles

1. **Avoid `any` completely** - It disables type checking and should never be used
2. **Use generics when APIs support them** - Many libraries provide generic type parameters to customize return types
3. **Prefer proper interfaces over `Record<string, unknown>`** - If you know the structure, define it
4. **Use `unknown` sparingly for truly dynamic data** - Forces proper type checking before use, but only when structure is genuinely unknown
5. **Create proper interfaces** - Define clear types for data structures
6. **Single assertion at query level** - Cast once at the source, not at every property access
7. **Avoid double casting** - Never use `as unknown as Type` patterns
8. **Use proper type narrowing** - Prefer type guards and narrowing over casts

## Common Patterns

### Pattern 1: Use generics when APIs support them

**When to use generics:**

- The API/library explicitly supports generic type parameters
- You want the function to preserve or transform types
- You're working with collections, promises, or query builders
- You want compile-time type safety without runtime casting

**Before:**

```typescript
// Bad: Using any with an API that supports generics
async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}

const user = await fetchData('/api/user');
console.log(user.name); // No type safety!
```

**After:**

```typescript
// Good: Using generics for type safety
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

interface User {
  id: string;
  name: string;
  email: string;
}

const user = await fetchData<User>('/api/user');
console.log(user.name); // Type-safe!
```

**Common APIs with generic support:**

```typescript
// Promises
async function processData<T>(data: T): Promise<T> {
  // Process and return same type
  return data;
}

// Arrays with map
const ids = users.map<string>((user) => user.id);

// Writing generic functions with constraints
interface HasId {
  id: string;
}

function extractId<T extends HasId>(obj: T): string {
  return obj.id;
}
```

### Pattern 2: Use existing types when available

**IMPORTANT**: Before using `Record<string, unknown>`, check if a proper type already exists in the codebase.

**Before:**

```typescript
// Bad: Using Record<string, unknown> when a proper type exists
function processPluginConfig(config: Record<string, unknown>): void {
  // ...
}

function processStrategyConfig(config: Record<string, unknown>): void {
  // ...
}
```

**After:**

```typescript
// Good: Using the existing types
import type { PluginConfig, StrategyConfig } from '../types';

function processPluginConfig(config: PluginConfig): void {
  // Now we have full type safety and autocomplete
}

function processStrategyConfig(config: StrategyConfig): void {
  // Now we have full type safety and autocomplete
}
```

**Common existing types to check for:**

- Plugin configurations: `PluginConfig`
- Strategy configurations: `StrategyConfig`
- Provider configurations: `ProviderOptions`
- Test cases: `TestCase`, `TestCaseWithPlugin`
- Always search the codebase for existing types before creating new ones

### Pattern 3: Extend types when you need additional properties

**Before:**

```typescript
// Bad: Losing type information
function processWithExtra(config: Record<string, unknown> & { n?: number }): void {
  // ...
}
```

**After:**

```typescript
// Good: Extending the proper type
import type { StrategyConfig } from '../types';

interface ExtendedConfig extends StrategyConfig {
  n?: number;
  modelFamily?: string;
}

function processWithExtra(config: ExtendedConfig): void {
  // Now we have both the base type safety AND the extra properties
}
```

### Pattern 4: Replace `any` with `unknown` only for truly dynamic data

**Before:**

```typescript
function log(metadata: Record<string, any> = {}): void {
  logger.info({ message: 'Log entry', ...metadata });
}
```

**After:**

```typescript
function log(metadata: Record<string, unknown> = {}): void {
  logger.info({ message: 'Log entry', ...metadata });
}
```

### Pattern 3: Create interfaces for database query results

**Before:**

```typescript
const rows = await db.execute(sql`SELECT id, config FROM evals`);
for (const row of rows) {
  const id = row.id as string;
  const config = row.config as any;
  // Process row...
}
```

**After:**

```typescript
interface EvalRow {
  id: string;
  config: Record<string, unknown> | null;
}

const rows = await db.execute(sql`SELECT id, config FROM evals`);
const typedRows = rows as unknown as EvalRow[];
for (const row of typedRows) {
  const id = row.id; // No cast needed!
  const config = row.config;
  // Process row...
}
```

### Pattern 4: Type database count results properly

**Before:**

```typescript
const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM table`);
const total = Number.parseInt((countResult[0] as any).count as string);
```

**After:**

```typescript
interface CountResult {
  count: string | number;
}

const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM table`);
const firstRow = countResult[0] as CountResult;
const total = Number.parseInt(String(firstRow.count));
```

### Pattern 5: Type function parameters from utility returns

**Before:**

```typescript
const updates: Array<{
  id: string;
  data: any; // Bad!
}> = [];
```

**After:**

```typescript
import { type SQL } from 'drizzle-orm';

interface SearchableUpdates {
  searchableVars: SQL;
  searchableResponse: SQL;
  searchableGradingResults: SQL;
}

const updates: Array<{
  id: string;
  data: SearchableUpdates; // Properly typed!
}> = [];
```

### Pattern 6: Handle JSON parsing with proper types

**Before:**

```typescript
function extractData(row: any): string | null {
  const testCase = row.test_case;
  if (typeof testCase === 'string') {
    const parsed = JSON.parse(testCase);
    return (parsed as any)?.metadata?.id || null;
  }
  return (testCase as any)?.metadata?.id || null;
}
```

**After:**

```typescript
interface TestCaseRow {
  test_case: string | { metadata?: { id?: string } } | null;
}

interface TestCaseWithMetadata {
  metadata?: {
    id?: string;
  };
}

function extractData(row: TestCaseRow): string | null {
  const testCase = row.test_case;

  if (!testCase) {
    return null;
  }

  if (typeof testCase === 'string') {
    try {
      const parsed = JSON.parse(testCase) as TestCaseWithMetadata;
      return parsed?.metadata?.id || null;
    } catch {
      return null;
    }
  }

  return testCase?.metadata?.id || null;
}
```

## Decision Tree

When you encounter `any`, follow this decision tree:

```text
Step 1: Does a proper type already exist in the codebase?
├─ YES → Use the existing type (PluginConfig, StrategyConfig, ProviderOptions, etc.)
│         Example: Use PluginConfig instead of Record<string, unknown>
│         ALWAYS search for existing types before creating new ones
│
└─ NO → Does the API support generics (Promise<T>, Array<T>, function<T>)?
    ├─ YES → Use generics with appropriate type parameters
    │         Example: Promise<User> instead of Promise<any>
    │         Example: function process<T>(data: T): Promise<T>
    │
    └─ NO → Is the data structured (objects, arrays with known shape)?
        ├─ YES → Create a proper interface and cast once at the source
        │         Example: const rows = results as MyRow[]
        │         Do NOT use Record<string, unknown> if you know the structure
        │
        └─ NO → Is the data truly dynamic (completely unknown structure)?
            ├─ YES → Use Record<string, unknown> or unknown as a last resort
            │         Then narrow with type guards before use
            │         This should be rare!
            │
            └─ Still not sure? → Search the codebase for similar patterns first
```

## Usage

When you encounter `any` types in TypeScript code:

1. **Check for generic support first:**
   - Does the API accept type parameters? (e.g., `Promise<T>`, `Array<T>`)
   - Can you add generic parameters to your function?
   - Will using generics provide better type inference?
   - **If yes:** Use generics instead of `any` or casting

2. **Identify the context:**
   - Is it metadata/context? Use `Record<string, unknown>`
   - Is it from a database query? Create an interface
   - Is it from JSON parsing? Create an interface for the shape
   - Is it truly dynamic? Use `unknown` and narrow

3. **Create proper types:**
   - Define interfaces for structured data
   - Use union types for variants (e.g., `string | null`)
   - Import proper types from libraries (e.g., `SQL` from drizzle-orm)
   - Add generic constraints where helpful (e.g., `T extends Record<string, unknown>`)

4. **Cast once, use many:**
   - Cast at the source (query result, API response)
   - Use the typed value throughout the rest of the code
   - Avoid per-property casts

5. **Validate before use:**
   - Check for null/undefined before accessing properties
   - Use type guards for complex validation
   - Use try-catch for JSON parsing

## Special Cases

### Generic Functions with Constraints

When writing reusable functions, use generics with constraints:

```typescript
// Bad: Using any
function extractField(obj: any, field: string): any {
  return obj[field];
}

// Good: Using generics with constraints
function extractField<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  field: K,
): T[K] {
  return obj[field];
}

// Usage with full type safety
interface User {
  id: string;
  name: string;
}

const user: User = { id: '1', name: 'Alice' };
const name = extractField(user, 'name'); // Type: string
// extractField(user, 'invalid'); // TypeScript error!
```

### Drizzle ORM Raw SQL Queries

**IMPORTANT**: Avoid raw SQL queries when possible. Use Drizzle's query builder for automatic type inference:

```typescript
// BEST: Use query builder for automatic types
const results = await db.select().from(usersTable);
// Type is automatically inferred from the table schema - no casts needed!
```

**For unavoidable raw SQL queries** (backfills, complex queries), you must use `as unknown as` due to Drizzle's type system limitations. This is the ONLY acceptable use of double casting:

```typescript
interface MyRow {
  id: string;
  name: string;
}

const results = await db.execute(sql`SELECT id, name FROM users`);
// ⚠️ EXCEPTION: Double cast required for Drizzle raw SQL only
// TypeScript won't allow direct cast from Record<string, unknown> to MyRow
const typedResults = results as unknown as MyRow[];
```

**This is the ONLY exception to the "no double casting" rule.** All other code should avoid `as unknown as`.

### Count Queries

For count queries, access the property directly with String() coercion:

```typescript
const result = await db.execute(sql`SELECT COUNT(*) as count FROM table`);
const firstRow = result[0];
// Access with type assertion only if needed, or use String() coercion
const count = Number.parseInt(String((firstRow as { count: string | number }).count));

// Or better: use Drizzle's query builder
const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(table);
const count = countResult[0].count;
```

### Optional Chaining with Casts

When you have a chain like `obj?.prop1?.prop2`, type the object properly instead of casting:

```typescript
// Bad
const value = (obj as any)?.prop1?.prop2;

// Good
interface MyObject {
  prop1?: {
    prop2?: string;
  };
}
const typedObj = obj as MyObject;
const value = typedObj?.prop1?.prop2;
```

## Verification Steps

**CRITICAL**: After making changes, you MUST verify the entire project compiles:

1. **Run TypeScript compilation for the whole project:**

   ```bash
   npm run tsc
   ```

   - This checks the ENTIRE project, not just the file you changed
   - Your changes may affect other files through imports/exports
   - Fix ALL TypeScript errors before considering the task complete

2. **Run linting:**

   ```bash
   npm run lint
   ```

   - This catches remaining `any` types and style issues
   - Must pass with no errors

3. **If errors exist:**
   - Read the error messages carefully
   - Fix type mismatches by adjusting interfaces
   - Ensure imports are properly typed
   - Check that function return types match expectations
   - Re-run `npm run tsc` until all errors are resolved

## Checklist

When fixing a file with `any` types:

- [ ] Check if APIs/functions support generics and use them first
- [ ] Replace remaining `any` with `unknown` for generic data
- [ ] Create interfaces for structured data
- [ ] Add generic type parameters to your own functions where appropriate
- [ ] Use generic constraints (e.g., `T extends Record<string, unknown>`)
- [ ] Cast database results once at the query level
- [ ] Remove `as unknown as` double casts (except for Drizzle raw SQL)
- [ ] Replace property-level `as string` casts with interface properties
- [ ] Add proper null/undefined handling
- [ ] **MUST: Run `npm run tsc` for the ENTIRE project**
- [ ] **MUST: Fix any compilation errors in other files caused by your changes**
- [ ] Run `npm run lint` to verify no linting errors
- [ ] Task is NOT complete until TypeScript compilation passes with zero errors
