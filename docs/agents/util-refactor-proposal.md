# Util Directory Refactor Proposal

**Issue**: [#3228](https://github.com/promptfoo/promptfoo/issues/3228) - Migrate Helper File functions to file.ts

**Status**: Approved for implementation

**Date**: 2025-12-28

## Problem Statement

`src/util/index.ts` is 828 lines / 29KB - the largest util file. It mixes unrelated concerns:
- File I/O (read/write)
- Environment setup
- Provider utilities
- Data comparison utilities
- Template rendering
- Path parsing

## Selected Approach: Proposal D - Functional Split with Flat Structure

**Philosophy**: Keep it flat, split by function category. No deep nesting, clear single-purpose files.

### Target Structure

```
src/util/
├── index.ts              # Barrel: re-exports public API (~80 lines)
│
├── file.ts               # EXPAND: All file loading/reading
│   ├── maybeLoadFromExternalFile()        [existing]
│   ├── maybeLoadConfigFromExternalFile()  [existing]
│   ├── maybeLoadToolsFromExternalFile()   ← move from index.ts
│   ├── readFilters()                      ← move from index.ts
│   ├── readOutput()                       ← move from index.ts
│   └── parsePathOrGlob()                  ← move from index.ts
│
├── output.ts             # NEW: All file writing/export
│   ├── writeOutput()                      ← move from index.ts
│   ├── writeMultipleOutputs()             ← move from index.ts
│   └── createOutputMetadata()             ← move from index.ts
│
├── env.ts                # NEW: Environment setup
│   └── setupEnv()                         ← move from index.ts
│
├── render.ts             # NEW: Template rendering
│   ├── renderVarsInObject()               ← move from index.ts
│   └── renderEnvOnlyInObject()            ← move from index.ts
│
├── comparison.ts         # NEW: Data comparison
│   ├── varsMatch()                        ← move from index.ts
│   ├── resultIsForTestCase()              ← move from index.ts
│   └── filterRuntimeVars()                ← move from index.ts
│
├── provider.ts           # NEW: Provider utilities
│   └── providerToIdentifier()             ← move from index.ts
│
├── runtime.ts            # NEW: Runtime detection
│   └── isRunningUnderNpx()                ← move from index.ts
│
└── [existing files unchanged]
    ├── templates.ts
    ├── pathUtils.ts
    ├── fileExtensions.ts
    ├── invariant.ts
    ├── createHash.ts
    └── ...
```

## Why This Approach

1. **Node.js convention alignment**: Flat structure with focused files is idiomatic
2. **Open source contributor experience**: Easy to find code by filename
3. **Incremental migration**: One function at a time, easy to review/revert
4. **Clear maintainability**: No ambiguity about where new code belongs
5. **Package-friendly**: Re-exports maintain backwards compatibility
6. **Right-sized**: Not over-engineered, addresses the real problem

## Implementation Phases

### Phase 1: Create new modules with complex functions
- Create `output.ts` ← writeOutput, writeMultipleOutputs, createOutputMetadata
- Create `env.ts` ← setupEnv
- Create `render.ts` ← renderVarsInObject, renderEnvOnlyInObject

### Phase 2: Expand file.ts with file operations
- Move parsePathOrGlob
- Move readFilters
- Move readOutput
- Move maybeLoadToolsFromExternalFile

### Phase 3: Create remaining focused modules
- Create `comparison.ts` ← varsMatch, resultIsForTestCase, filterRuntimeVars
- Create `provider.ts` ← providerToIdentifier
- Create `runtime.ts` ← isRunningUnderNpx

### Phase 4: Transform index.ts to barrel file
- Replace implementations with re-exports
- Verify no breaking changes

### Phase 5: Update internal imports (gradual)
- Change imports to use specific modules where beneficial

## Validation

After each step:
1. Run `npm run build` to verify compilation
2. Run `npm test` to verify functionality
3. Check for circular dependencies
4. Commit with conventional commit format

## Circular Dependency Prevention

The current codebase has NO circular dependencies. This refactor maintains that by:
- Keeping pure utilities at base level (invariant, createHash, etc.)
- Having higher-level utilities import from lower-level ones only
- Using the barrel file (index.ts) only for external consumers

## Backwards Compatibility

All functions remain exported from `src/util/index.ts` via re-exports:

```typescript
// src/util/index.ts (after refactor)
export { writeOutput, writeMultipleOutputs, createOutputMetadata } from './output';
export { setupEnv } from './env';
export { renderVarsInObject, renderEnvOnlyInObject } from './render';
// ... etc
```

Existing imports like `import { writeOutput } from '../util'` continue to work.
