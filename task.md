# CommonJS to ESM Migration Plan for promptfoo

## Executive Summary

This document outlines a comprehensive plan to migrate the promptfoo project from CommonJS to ESM (ECMAScript Modules). The migration will modernize the codebase and align with current JavaScript standards.

**2025 Context**: Native ESM support is now mature in Node.js v22+ with built-in CommonJS-to-ESM interop, and Node.js v23 includes experimental native TypeScript stripping. Jest 30 (released June 2025) has improved ESM support, though some APIs remain experimental. Any performance improvements will be measured and not assumed.

## Current State Analysis

### Project Structure

- **Root workspace**: CommonJS (`"type": "commonjs"`)
- **App workspace** (`src/app`): Already ESM (`"type": "module"`)
- **Site workspace** (`site`): CommonJS (no type specified)
- **TypeScript**: Root uses `"module": "CommonJS"`, app uses modern ESM config

### Key Findings from Audit

#### ✅ ESM-Ready Elements

- Extensive use of dynamic imports (78+ instances)
- Modern dependency versions with ESM support
- App workspace already fully ESM
- No significant use of legacy CommonJS patterns in core logic

#### ⚠️ Migration Challenges Identified

1. **CommonJS Usage Patterns**:
   - `require.main === module` checks (6+ instances across CLI, strategies, and scripts)
   - `__dirname` and `__filename` usage (numerous occurrences across `src/` and `scripts/`)
   - Build scripts using CommonJS (e.g., `scripts/generate-constants.js`, `scripts/generate-blog-image.js`)
   - `module.exports` inside onboarding templates in `src/onboarding.ts` (intentional examples; do not auto-convert)

2. **Configuration Dependencies**:
   - Jest configuration needs ESM support
   - ts-node configuration updates required
   - Build process modifications needed

3. **Mixed Workspace Setup**:
   - Root and site workspaces in CommonJS
   - App workspace already ESM
   - Potential dependency resolution issues

## Migration Strategy

### Project Constraints

- Do not rename existing files if at all possible. Prefer code edits and build-time transforms over renames.

### Phase 1: Foundation Setup (Low Risk)

**Estimated Duration**: 2-3 days

#### 1.1 Update TypeScript Configuration

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["src", "test"]
}

// tsconfig.esm.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "outDir": "dist/esm"
  }
}

// tsconfig.cjs.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "dist/cjs"
  }
}

// tsconfig.types.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "emitDeclarationOnly": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist/types"
  }
}
```

#### 1.2 Update Root Package.json (decide ESM-only vs dual-package)

Option A: ESM-only (breaking change in a major release)

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    }
  }
}
```

Option B: Dual package (preserve CommonJS consumers)

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs",
      "types": "./dist/types/index.d.ts"
    }
  }
}
```

Note: Choose one path and align the build output accordingly.

#### Decision matrix: ESM-only vs dual-package

| Criteria               | ESM-only                                  | Dual-package (ESM + CJS)                            |
| ---------------------- | ----------------------------------------- | --------------------------------------------------- |
| Backward compatibility | Breaking for CJS consumers                | Preserves existing CJS users                        |
| Publishing complexity  | Simple (one build)                        | Higher (two outputs, conditional exports)           |
| Tree-shaking           | Best (ESM-native)                         | Good (depends on consumer/tooling)                  |
| Node.js support range  | Modern Node only                          | Broader (legacy CJS users supported)                |
| Tooling requirements   | Standard `tsc`/bundler                    | Build orchestration for CJS/ESM/types               |
| Test matrix            | Smaller                                   | Larger (esm + cjs consumption tests)                |
| Package.json exports   | `import` + `types`                        | `import` + `require` + `types` (possibly sub-paths) |
| Recommended when       | You can cut a major and move users to ESM | You must maintain CJS compatibility                 |

Guidance:

- If you are comfortable with a major version bump and your audience is primarily modern Node/bundlers, choose ESM-only.
- If you need to avoid breaking CJS consumers, choose dual-package and add end-to-end consumption tests for both module types.

#### Chosen approach for promptfoo: Dual-package (ESM + CJS)

We will maintain support for both ESM and CommonJS consumers. This requires:

- Conditional exports in `package.json` for `import`, `require`, and `types`
- Separate build outputs: `dist/esm` (ESM), `dist/cjs` (CJS), and `dist/types` (d.ts)
- Ensuring the CLI binary (`bin`) points to a CJS entry for maximum compatibility

Example `package.json` changes:

```json
{
  "type": "module",
  "main": "dist/cjs/index.cjs",
  "types": "dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs",
      "types": "./dist/types/index.d.ts"
    },
    "./package.json": "./package.json"
  },
  "bin": {
    "promptfoo": "dist/cjs/main.cjs",
    "pf": "dist/cjs/main.cjs"
  }
}
```

#### 1.3 Site Workspace strategy

Do not change the `site` workspace to ESM in Phase 1. It currently uses CommonJS config files (e.g., `site/babel.config.js`, `site/sidebars.js`). If desired, convert in a later phase by either renaming those files to `.cjs` or porting them to ESM.

### Phase 2: Code Transformation (Medium Risk)

**Estimated Duration**: 3-5 days

#### 2.1 Replace CommonJS Globals

Replace all `__dirname` and `__filename` usage:

```typescript
// Before
const configPath = path.join(__dirname, 'config.json');

// After
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = path.join(__dirname, 'config.json');
```

**Files requiring updates (examples, not exhaustive)**:

- `src/esm.ts` (already has ESM helper)
- `src/migrate.ts`
- `src/python/pythonUtils.ts`
- `src/app/vite.config.ts`
- `src/providers/golangCompletion.ts`
- `scripts/generate-constants.js` (if converting to ESM rather than renaming to `.cjs`)

#### 2.2 Replace require.main Checks

```typescript
// Before
if (require.main === module) {
  main();
}

// After (robust, handles spaces/platforms)
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
// Alternatively:
// if (import.meta.url === pathToFileURL(process.argv[1]!).href) { main(); }
```

**Files requiring updates (examples)**:

- `src/main.ts`
- `src/migrate.ts`
- `src/redteam/strategies/simpleVideo.ts`
- `src/redteam/strategies/simpleImage.ts`
- `scripts/generateCitation.ts`

#### 2.3 Fix Import Statements

Prefer tool-assisted or build-time handling. Options:

- Add `.js` extensions to all relative imports in source, or
- Use a bundler/post-build rewrite to add extensions in output while keeping source imports without extensions, or
- Use `moduleResolution: NodeNext` with explicit specifiers.

Notes for ESM in 2025:

- JSON modules: if importing JSON at runtime under ESM, use `import data from './file.json' with { type: 'json' }` (or read via `fs`). Keep `"resolveJsonModule": true` for TS type support.

```typescript
// Before
import { evaluate } from './evaluator';

// After
import { evaluate } from './evaluator.js';
```

#### 2.4 Convert Build Scripts

Prefer code edits and build-time transforms over renames. If a script relies on CommonJS globals and must remain runnable under root ESM, use one of:

- Wrap with a tiny launcher that uses `node --loader tsx/esm` (for TS) or dynamic `import()` calls
- Use a bundler (e.g., esbuild) to emit a CJS artifact for the script while keeping source filename unchanged

If converting to ESM, use the following pattern:

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ... rest of the script
```

#### 2.5 Fix module.exports Usage

Do not modify the `module.exports` inside `src/onboarding.ts` template strings; these are user-facing examples that intentionally show CommonJS. If desired, add parallel ESM templates rather than replacing the CJS ones.

#### 2.6 CLI Binary compatibility (dual-package)

- Ensure the CLI entry in `bin` points to the CJS output (e.g., `dist/cjs/main.cjs`) with a shebang (`#!/usr/bin/env node`).
- Keep an equivalent `dist/esm/main.js` for module consumers who import programmatic APIs.
- Do not rename source files; rely on build outputs to create CJS/ESM variants.

### Phase 3: Testing & Tooling Updates (Medium Risk)

**Estimated Duration**: 2-3 days

#### 3.1 Update Jest Configuration (Jest 30+ Features)

Leverage Jest 30 improvements while maintaining current SWC setup:

```typescript
// jest.config.ts (Jest 30 optimized)
import type { Config } from 'jest';
const config: Config = {
  extensionsToTreatAsEsm: ['.ts'],
  transform: { '^.+\\.m?[tj]sx?$': '@swc/jest' },
  // Jest 30+ has native .mts/.cts support
  // If using Node.js v23 native TS stripping, Jest skips TS transformer automatically
  // If import suffixes cause issues when running tests against TS source, add:
  // moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },

  // Jest 30 improvements
  testEnvironmentOptions: {
    globalsCleanup: 'soft', // Already in your config
  },
};
export default config;
```

**Note**: Jest 30 (June 2025) includes native support for `.mts`/`.cts` files and automatic TypeScript transformer skipping when using Node.js native stripping.

#### 3.2 Leverage Modern Node.js TypeScript Support (2025)

##### Option A: Native TypeScript Stripping (Node.js v23+)

```json
{
  "scripts": {
    "db:migrate": "node --experimental-strip-types src/migrate.ts",
    "local": "node --experimental-strip-types src/main.ts"
  }
}
```

##### Option B: TSX (if compatibility needed)

```json
{
  "scripts": {
    "db:migrate": "node --loader tsx/esm src/migrate.ts",
    "local": "node --loader tsx/esm src/main.ts"
  }
}
```

Notes:

- Node.js v23+ includes experimental native TypeScript stripping, which is great for dev scripts. Keep publishing via `tsc` (or a bundler) to emit JS for your distributed package.
- Avoid relying on experimental flags in CI or published artifacts until stabilized.

For dual-package builds, prefer stable toolchains (`tsc`/bundler) and avoid experimental flags in the production build pipeline.

#### 3.3 Update Package Scripts

```json
{
  "scripts": {
    "build:clean": "shx rm -rf dist",
    "build:esm": "tsc -p tsconfig.esm.json",
    "build:cjs": "tsc -p tsconfig.cjs.json",
    "build:types": "tsc -p tsconfig.types.json",
    "postbuild": "shx chmod +x dist/cjs/main.cjs",
    "build": "npm run build:clean && npm run build:esm && npm run build:cjs && npm run build:types && npm run postbuild",
    "db:migrate": "node --loader tsx/esm src/migrate.ts",
    "local": "node --loader tsx/esm src/main.ts"
  }
}
```

### Phase 4: Dependency Updates (Low Risk)

**Estimated Duration**: 1-2 days

#### 4.1 Dependency compatibility review

- Ensure critical dependencies work under ESM (or have CJS fallbacks if using a dual build)
- Keep `esModuleInterop: true` to ease interop with CJS packages
- Replace or shim any problematic CJS-only dependencies if they block ESM-only builds

#### 4.2 Review Peer Dependencies

Verify all peer dependencies support ESM and update versions if needed.

## Verification & Testing Strategy

### Pre-Migration Baseline

1. **Run full test suite**: `npm test`
2. **Build project**: `npm run build`
3. **Run CLI commands**: Test core functionality
4. **Performance baseline**: Record test execution times

### Phase-by-Phase Verification

#### Phase 1 Verification

- [ ] TypeScript compilation succeeds
- [ ] Package.json structure is valid
- [ ] No regression in app workspace build

#### Phase 2 Verification

- [ ] All imports resolve correctly
- [ ] Build scripts execute successfully
- [ ] Runtime behavior unchanged for core functionality
- [ ] CLI entry points work correctly
- [ ] Package can be consumed by external projects (`npm pack` + install test)
- [ ] CLI binaries retain executable shebang and correct ESM execution
- [ ] JSON module imports (if any) function under ESM (or fall back to fs)
- [ ] Programmatic API works for both ESM `import` and CJS `require`
- [ ] Bin works when installed globally and locally (npx)

#### Phase 3 Verification

- [ ] All tests pass with new Jest configuration
- [ ] Test execution performance improvement measured
- [ ] No test mocking regressions
- [ ] Development server starts correctly

#### Phase 4 Verification

- [ ] All dependencies resolve correctly
- [ ] No peer dependency conflicts
- [ ] Bundle size impact assessment

### Comprehensive Testing Checklist

#### Unit Tests

- [ ] Jest runs with ESM support
- [ ] All existing tests pass
- [ ] Mocking functionality still works
- [ ] Import assertions work correctly
- [ ] Packaging smoke test for both ESM and (if supported) CJS consumers
- [ ] Dual-consumption tests: one project using `import`, one using `require`

#### Integration Tests

- [ ] CLI commands function correctly
- [ ] File system operations work
- [ ] Database migrations execute
- [ ] Provider integrations function

#### E2E Tests

- [ ] Full evaluation workflows
- [ ] Red team functionality
- [ ] Web UI integration
- [ ] MCP server functionality

#### Performance Benchmarks

- [ ] Test execution time comparison
- [ ] Build time measurement
- [ ] Bundle size analysis
- [ ] Runtime performance validation

## Risk Assessment & Mitigation

### High Risk Items (Updated for August 2025)

1. **Jest ESM Support**: Improved with Jest 30 but some APIs still experimental
   - **Mitigation**: Jest 30 has better ESM support; Vitest remains a stable alternative
   - **Rollback Plan**: Maintain Jest with CommonJS support

2. **Third-party Dependencies**: ESM ecosystem much more mature in 2025
   - **Mitigation**: Most major packages now support ESM; fewer compatibility issues expected
   - **Rollback Plan**: Use import() for any remaining problematic dependencies

3. **Experimental Node flags for TypeScript**
   - **Mitigation**: Limit `--experimental-strip-types` to local/dev scripts; keep build artifacts generated by stable toolchains (tsc/bundler)
   - **Rollback Plan**: Fall back to `tsx`/`ts-node` for script execution if issues arise

### Medium Risk Items

1. **Dynamic Imports**: Behavior may change slightly
   - **Mitigation**: Thorough testing of all dynamic import usage
   - **Rollback Plan**: Maintain wrapper functions

2. **Build Pipeline**: Complex build process with multiple steps
   - **Mitigation**: Update build scripts incrementally
   - **Rollback Plan**: Keep original build scripts as backup

### Low Risk Items

1. **TypeScript Configuration**: Well-supported migration path
2. **Node.js Version**: >=18.0.0 has excellent ESM support
3. **App Workspace**: Already ESM, no changes needed

## Rollback Strategy

### Immediate Rollback (Within Each Phase)

1. Maintain git branches for each phase
2. Keep backup copies of critical configuration files
3. Document all changes for easy reversal

### Complete Rollback Plan

1. **Revert package.json changes**: Remove `"type": "module"`
2. **Restore TypeScript config**: Return to CommonJS module setting
3. **Revert Jest configuration**: Return to original setup
4. **Restore build scripts**: Revert to CommonJS versions

### Rollback Verification

- [ ] All tests pass after rollback
- [ ] Build process works correctly
- [ ] CLI functionality restored
- [ ] Performance baseline maintained

## Timeline & Resources

### Estimated Timeline: 6-10 days (Updated for 2025 tooling maturity)

- **Phase 1**: 1-2 days (TypeScript/package.json config - simplified with modern tooling)
- **Phase 2**: 3-4 days (Code transformation - same complexity)
- **Phase 3**: 1-2 days (Testing/tooling - Jest 30 + native Node.js features reduce complexity)
- **Phase 4**: 1-2 days (Dependencies - more stable ESM ecosystem in 2025)

### Required Resources

- Senior TypeScript/Node.js developer
- Access to CI/CD pipeline for testing
- Ability to coordinate with team on breaking changes

### Dependencies

- No major dependency upgrades required
- Node.js >=18.0.0 (already satisfied)
- Team coordination for testing assistance

## Success Criteria

### Functional Requirements

- [ ] All existing functionality preserved
- [ ] No regression in performance (except test improvements)
- [ ] Build process completes successfully
- [ ] CLI tools work correctly

### Technical Requirements

- [ ] Full ESM compliance across all workspaces
- [ ] Improved test execution performance (target: 2-4x faster)
- [ ] Modern import syntax throughout codebase
- [ ] No CommonJS legacy patterns remaining

### Quality Requirements

- [ ] Test coverage maintained at current levels
- [ ] No new linting or TypeScript errors
- [ ] Documentation updated to reflect changes
- [ ] CI/CD pipeline functions correctly

## Post-Migration Cleanup

### Code Quality Improvements

1. **Remove ESM compatibility code**: Clean up transitional patterns
2. **Optimize imports**: Use tree shaking opportunities
3. **Update documentation**: Reflect new module system
4. **Performance optimization**: Leverage ESM benefits

### Future Considerations (2025 Edition)

1. **Native TypeScript execution**: Consider Node.js v23+ native TypeScript stripping for development workflows
2. **Top-level await**: Can be used where beneficial
3. **Dynamic imports**: More efficient lazy loading
4. **Bundle analysis**: Tree shaking improvements
5. **Dependency management**: ESM-first packages are now the standard
6. **Built-in Node.js features**: Leverage native file watching and other modern Node.js capabilities
7. **Package exports/types**: Consider subpath exports and `"types"` condition for better editor/TS tooling if you ship dual outputs

## Conclusion

This migration plan provides a systematic approach to converting the promptfoo project from CommonJS to ESM. The phased approach minimizes risk while delivering the benefits of modern JavaScript modules. The existing ESM usage in the app workspace and extensive dynamic imports indicate the codebase is well-prepared for this migration.

Key success factors:

- **Incremental approach**: Reduces risk and allows for early problem detection
- **Comprehensive testing**: Ensures no functionality regression
- **Clear rollback plan**: Provides confidence to proceed with migration
- **Performance focus**: Targets measurable improvements in test execution

The migration will modernize the codebase and position it for future JavaScript ecosystem developments while maintaining all existing functionality.
