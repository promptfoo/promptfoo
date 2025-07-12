# ESM Migration Status Report

## Overview
The project has been set up for dual ESM/CJS builds with backwards compatibility. The build process completes successfully, but there are some remaining issues to address.

## What's Working ✅

### 1. Build System
- Full build process completes successfully (`npm run build`)
- Generates both ESM (`dist/esm/`) and CJS (`dist/cjs/`) builds
- Type definitions are generated (`dist/types/`)
- Web app builds successfully

### 2. CLI Functionality
- CLI commands work via the wrapper script (`dist/main-wrapper.cjs`)
- Automatic fallback from ESM to CJS when ESM fails
- Both `promptfoo` and `pf` commands are functional after `npm link`
- Version command works: shows version number correctly

### 3. Package Configuration
- Dual package exports configured in `package.json`
- Separate `package.json` files for ESM and CJS builds
- Main entry points properly configured

### 4. Test Suite (Partial)
- 167 out of 350 test suites pass (47.7%)
- 2799 out of 2808 individual tests pass (99.7%)
- Simple tests without ESM-specific features work correctly

## What Needs Fixing 🔧

### 1. ESM Import Issues
- **Directory imports**: The script `add-js-extensions.mjs` doesn't handle bare `.` imports
  - Example: `import { OpenAiGenericProvider } from '.'` should become `from './index.js'`
  - Affects multiple files in the ESM build
  - Causes: `Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import '...' is not supported`

### 2. Test Suite Compatibility
- 183 test suites fail due to `import.meta` syntax issues
- Jest doesn't handle the TypeScript compiler's transformation of `import.meta`
- Error: `SyntaxError: Cannot use 'import.meta' outside a module`
- Affected files:
  - `src/esm.ts`
  - `src/migrate.ts`
  - `src/providers/golangCompletion.ts`
  - `src/python/pythonUtils.ts`

### 3. Build Scripts
- The `add-js-extensions.mjs` script regex pattern `(\.[^'"]+)` doesn't match bare `.` imports
- Need to update the pattern to handle this edge case

## Recommendations for Next Steps

1. **Fix ESM Import Script**:
   - Update `scripts/add-js-extensions.mjs` to handle bare `.` imports
   - Add a specific pattern like `/from ['"]\.['"])/` to transform to `from './index.js'`

2. **Jest Configuration**:
   - Consider using `@swc/jest` with proper ESM configuration
   - Or mock the `import.meta` usage in test setup
   - Alternative: Use Node's native test runner which has better ESM support

3. **Gradual Migration**:
   - The current fallback mechanism works well for production use
   - Focus on fixing the ESM imports first
   - Address test suite issues as a separate task

4. **Testing**:
   - Add integration tests for both ESM and CJS entry points
   - Test package installation in both CommonJS and ESM projects

## Current Workaround
The `main-wrapper.cjs` successfully provides backwards compatibility by:
1. Attempting to load the ESM build first
2. Falling back to CJS when ESM fails
3. Providing clear error messages about the fallback

This ensures the tool remains functional for all users during the migration period.