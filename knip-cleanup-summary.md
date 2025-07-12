# Knip Cleanup Summary

## Overview

This branch implements knip to identify and clean up unused code in the promptfoo codebase.

## Changes Made

### PR Review Comments Addressed ✅

1. **Fixed ScanIssue export** - Exported the interface to prevent TypeScript errors
2. **Fixed duplicate DEFAULT_QUERY_LIMIT** - Imported from constants.ts instead of defining locally
3. **Removed unused mock** - Cleaned up unused getEnvInt mock in test/fetch.test.ts
4. **Fixed knip.json spacing** - Removed extra spaces in file extensions
5. **Fixed inconsistent PLUGIN_ID exports** - Made all redteam plugin IDs private (non-exported)
6. **Updated tests** - Fixed tests to work with non-exported PLUGIN_IDs
7. **Cleaned up unused Zod schemas** - Removed unused validation schemas from validators/providers.ts
8. **Fixed type-only imports** - Changed gaxios and @aws-sdk/types to avoid dependency issues
9. **Removed unused devDependencies** - Removed globals and graphiql from app package.json

### Additional Improvements 🔧

1. **Export cleanup** - Moved exports to where items are defined instead of separate export statements
2. **Removed unused exports**:
   - EXAMPLE_APPLICATION_DEFINITION
   - HYPERBOLIC_AUDIO_MODELS and HYPERBOLIC_IMAGE_MODELS
   - DEFAULT_MAX_TURNS and DEFAULT_MAX_BACKTRACKS (duplicates)
   - DatabricksProvider (backward compatibility alias)
   - DATASET_PATH from unsafebench
   - getOTLPReceiver
   - dbInstance and sqliteInstance
3. **Removed unused type exports**:
   - ExtensionHookContext
   - StoreTraceData
   - CreateEvalOptions (test factory)
4. **Fixed duplicate exports** - Removed duplicate exports for logger and CustomProvider

### Knip Results

**Before cleanup:**

- Numerous unused files, dependencies, exports, and duplicate exports
- Configuration issues

**After cleanup:**

- ✅ 0 unused files
- ✅ 0 duplicate exports
- ✅ Reduced unused exports from 23 → 11
- ✅ Reduced unused exported types from 36 → 33
- ✅ Better configured for the project structure

### Remaining Items

The remaining knip findings are mostly false positives:

- **Site devDependencies** - Actually used in blog components
- **Unlisted dependencies** - Mostly Docusaurus theme imports provided by the framework
- **Unused exports** - Many are part of the public API or used dynamically

### Configuration Improvements

1. Added `src/server/index.ts` to entry points and ignore list
2. Configured site workspace properly in knip.json
3. Added ignoreBinaries for dist/src/main.js and gh
4. Added ignoreDependencies for Docusaurus theme imports

5. **Test Updates**
   - Updated rbac.test.ts to use `plugin.id` instead of imported PLUGIN_ID
   - Updated competitors.test.ts similarly

## Merge with Main Branch

Successfully merged the latest changes from main branch:

- Resolved conflicts in package.json and src/app/package.json
- Updated dependency versions to match main
- Removed additional unused dependencies introduced by the merge:
  - rouge
  - @swc/cli
  - @typescript-eslint/parser
  - Several unused devDependencies in src/app/package.json
- Regenerated package-lock.json

## Results

**Before cleanup:**

- Numerous unused files, dependencies, exports, and duplicate exports
- Configuration issues

**After cleanup:**

- ✅ 0 unused files
- ✅ 0 duplicate exports
- ✅ Reduced unused exports from 23 → 11
- ✅ Reduced unused exported types from 36 → 33
- ✅ Better configured for the project structure

### Remaining Items

The remaining knip findings are mostly false positives:

- **Site devDependencies** - Actually used in blog components
- **Unlisted dependencies** - Mostly Docusaurus theme imports provided by the framework
- **Unused exports** - Many are part of the public API or used dynamically
