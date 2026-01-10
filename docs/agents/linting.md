# Linting Guidelines

## Biome Configuration

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Configuration is in `biome.json`.

## Running Linting

```bash
npm run lint        # Lint src directory
npm run lint:tests  # Lint test directory
npm run lint:site   # Lint site directory
npm run l           # Lint only changed files (faster)
```

## Key Rules

### noFloatingPromises (Promise Error Detection)

The `noFloatingPromises` rule catches unhandled promises that could silently fail:

```typescript
// Bad - promise errors are silently swallowed
fetchData();

// Good - error is handled
await fetchData();
// or
fetchData().catch(handleError);
// or
void fetchData(); // Explicitly ignoring
```

**Known Limitation:** This is a "project domain" type-aware rule that requires the Biome Scanner. The scanner analyzes the entire project for type information, which means:

- File-level overrides only reset to default severity ("info"), not fully disable
- Override patterns like `include: ["src/app/**"]` will show violations as "info" level instead of "error"
- These "info" level violations won't block CI but will appear in lint output

This is a known Biome limitation tracked in:
- [GitHub Issue #7062](https://github.com/biomejs/biome/issues/7062)
- [GitHub Issue #7924](https://github.com/biomejs/biome/issues/7924)

**Current Configuration:** `noFloatingPromises` is enabled at "error" level for `src/` but overridden to "off" for `src/app/`, test files, and scripts. Due to the limitation above, `src/app/` violations appear at "info" level rather than being fully suppressed.

### useIterableCallbackReturn

This rule ensures proper usage of iterable callbacks:

```typescript
// Bad - forEach should not return values
items.forEach((item) => process(item));  // implicit return from expression

// Good - use block body for forEach
items.forEach((item) => {
  process(item);
});

// Bad - map must always return
items.map((item) => {
  if (condition) {
    return item.value;
  }
  // Missing return - returns undefined
});

// Good - map always returns
items.map((item) => {
  if (condition) {
    return item.value;
  }
  return null;
});
```

## Suppressing Lint Errors

When you need to suppress a lint error, use a comment:

```typescript
// biome-ignore lint/suspicious/noFloatingPromises: Intentionally fire-and-forget
startBackgroundTask();
```

Always include a reason after the colon explaining why the suppression is necessary.

## Before Committing

Always run linting before committing:

```bash
npm run l && npm run f
```

This runs linting and formatting on changed files only.
