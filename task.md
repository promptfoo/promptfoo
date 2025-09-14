# ESM Migration Plan: CommonJS to ESM

## Task Description

Migrate the promptfoo project from CommonJS to ESM (ECMAScript Modules) while maintaining compatibility with existing functionality, preserving the CLI tool, npm library exports, and workspace structure.

## Motivation

### Benefits of ESM Migration:
1. **Modern JavaScript Standard**: ESM is the official ECMAScript standard for modules
2. **Better Tree Shaking**: Improved bundle optimization and smaller production builds
3. **Static Analysis**: Better tooling support for imports/exports analysis
4. **Top-level await**: Native support for async operations at module level
5. **Browser Compatibility**: Direct browser support without transpilation
6. **Future-proofing**: Node.js and ecosystem moving toward ESM-first
7. **Developer Experience**: Better IDE support and error messages
8. **Performance**: Potentially faster module loading and resolution

### Current Pain Points:
- Complex dual-mode module loading system (`src/esm.ts`) with eval() workarounds
- TypeScript compilation to CommonJS creates interop complexity
- Mixed module systems between workspaces create confusion
- Development vs production build differences due to ts-node transforms

## Migration Strategy Overview

## Current Status and TODOs (Live Checklist)

This checklist reflects progress on esm-migration vs main and what’s left to finish. Items checked are already implemented in this branch.

- Config and Tooling
  - [x] Update `tsconfig.json` to ESM: `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`, `emitDeclarationOnly: true`
  - [x] Add `tsup` and `tsup.config.ts` with ESM CLI bundle and ESM/CJS library outputs
  - [x] Rename Node-executed build scripts to `.cjs`: `scripts/generate-constants.cjs`, `scripts/generate-blog-image.cjs`
  - [ ] Update `package.json` scripts to use tsup and tsc for types:
    - [ ] `build`: `npm run generate-constants && tsup && tsc --emitDeclarationOnly && npm run post-build`
    - [ ] `post-build`: copy assets (HTML, python wrapper, golang wrapper, drizzle) and `chmod +x dist/src/main.js`
    - [ ] Fix `generate-constants` path to `.cjs`
    - [ ] Prefer `tsx` for dev commands: `local`, `db:migrate`, `dev:server`
  - [ ] Switch `package.json` to `"type": "module"` and update `exports` to include ESM and CJS entries (or plan ESM-only + major bump)

- Source Changes (ESM patterns)
  - [ ] Replace `require.main === module` with `fileURLToPath(import.meta.url)` path equality in:
    - [ ] `src/main.ts`
    - [ ] `src/migrate.ts`
    - [ ] `src/redteam/strategies/simpleImage.ts`
    - [ ] `src/redteam/strategies/simpleVideo.ts`
  - [ ] Replace `__dirname` usage with `dirname(fileURLToPath(import.meta.url))` in:
    - [ ] `src/migrate.ts`
    - [ ] `src/providers/golangCompletion.ts`
    - [ ] `src/python/pythonUtils.ts`
    - [ ] `src/app/vite.config.ts` (ESM-only dev config; just switch to ESM-safe path resolution, no CJS fallback needed)
  - [ ] JSON imports: choose strategy and implement consistently
    - Option 1 (recommended with tsup): rely on bundling JSON; keep static imports; add Jest mapping if needed
    - Option 2: use JSON module assertions in source (Node 20+):
      - [ ] Static JSON: `import pkg from '../package.json' assert { type: 'json' }`
      - [ ] Dynamic JSON: `await import('./data.json', { assert: { type: 'json' } })`
    - Files to update:
      - [ ] `src/main.ts`
      - [ ] `src/constants.ts`
      - [ ] `src/commands/debug.ts`
      - [ ] `src/checkNodeVersion.ts`
      - [ ] `src/app/vite.config.ts` (app is ESM-only; Vite handles JSON in config, so this may not require change)
      - [ ] `src/redteam/strategies/promptInjections/index.ts` (dynamic)
      - [ ] `src/util/testCaseReader.ts` (replace `require(json)` with `fs.readFileSync + JSON.parse`)
  - [ ] Simplify `src/esm.ts`: remove eval() and CommonJS `require()` fallback; use native dynamic import with `pathToFileURL(safeResolve(...))`

- Package.json (Exports/Type)
  - [ ] After verifying builds, flip to `"type": "module"`
  - [ ] Set conditional exports to match tsup outputs:
    - [ ] `exports["."].import -> ./dist/src/index.js`
    - [ ] `exports["."].require -> ./dist/src/index.cjs`
    - [ ] `exports["."].types -> ./dist/src/index.d.ts`
  - [ ] Keep `bin` entries pointing to `dist/src/main.js` (ESM CLI)
  - [ ] Major version bump if moving to ESM-first package layout

- Build Pipeline & Assets
  - [ ] Update `build` to: `generate-constants (cjs)` -> `tsup` -> `tsc --emitDeclarationOnly` -> `npm run build:app` -> post-build asset copy
  - [ ] Post-build asset copy parity with current: HTML, python wrapper, golang wrapper, drizzle dir
  - [ ] Ensure `chmod +x dist/src/main.js`
  - [ ] Verify heavy deps are externalized (tsup config shows: better-sqlite3, playwright, sharp)

- Runtime & Test Verification
  - [ ] Run unit tests with @swc/jest; fix any JSON import issues (mapper/transform)
  - [ ] Build and smoke-test CLI from `dist`: `promptfoo --help`, basic commands
  - [ ] Build app workspace and load in dev: `npm run dev --prefix src/app` (ESM-only config)
  - [ ] Test library import in both ESM and CJS consumers locally

- Documentation & Examples
  - [ ] Remove/replace any remaining ts-jest guidance (we use @swc/jest)
  - [ ] Remove outdated `module: "ES2022"` / `moduleResolution: "bundler"` advice
  - [ ] Decide whether to keep CommonJS examples in docs; add ESM equivalents
  - [ ] Note migration guidance for CJS consumers (use `require('promptfoo')` via conditional export or `await import('promptfoo')`)

App Workspace (ESM-only)
- [x] `src/app/package.json` already `"type": "module"`
- [x] App uses Vite/Vitest (ESM-native); no CJS compatibility tasks
- [ ] Ensure any `__dirname` usage in app config uses `fileURLToPath`/`dirname`
- [ ] No import extension rewrites needed in app (bundled by Vite)

- Build and Distribution
  - [ ] Ensure tsup CLI bundle includes shebang and `shims: true` (present in `tsup.config.ts`)
  - [ ] Externalize heavy deps in tsup (present) and confirm asset copying in post-build
  - [ ] Validate `bin` entries continue to point at `dist/src/main.js` and binary is executable

- Testing (SWC/Jest)
  - [x] Keep `@swc/jest` transformer; no switch to ts-jest
  - [ ] If using JSON-in-source, add Jest support:
    - [ ] `moduleNameMapper` for JSON or a lightweight JSON transform/mock
  - [ ] Optional: add `moduleNameMapper` for “.js” suffix only if you codemod source imports (not needed with tsup approach)

- Documentation Cleanups in this document
  - [ ] Remove or update older guidance recommending `module: "ES2022"`, `moduleResolution: "bundler"`
  - [ ] Remove ts-jest guidance; keep `@swc/jest`
  - [ ] Consolidate duplicate “Create ESM Compatibility Utilities” sections
  - [ ] Standardize JSON examples to a single approach (bundled vs assert)

Notes: Current branch already includes tsconfig NodeNext/ES2022, tsup config with ESM/CJS builds, and `.cjs` script renames. Next highest-impact steps are updating `package.json` scripts, addressing JSON imports, and replacing `require.main`/`__dirname` usages.

### Phase 1: Preparation and Analysis (Low Risk)
1. Audit all CommonJS-specific patterns
2. Analyze external dependencies for ESM compatibility
3. Set up testing infrastructure for dual-mode validation
4. Create compatibility shims for migration period

### Phase 2: Core Infrastructure (Medium Risk)
1. Update package.json configurations
2. Modify TypeScript compilation targets
3. Update build processes and tooling
4. Convert CommonJS-specific patterns (__dirname, require.main, etc.)

### Phase 3: Module System Migration (High Risk)
1. Convert import/export patterns
2. Update dynamic imports and module loading
3. Migrate CLI entry points
4. Update npm exports configuration

### Phase 4: Testing and Validation (Medium Risk)
1. Comprehensive testing of CLI functionality
2. Library API compatibility testing
3. Workspace integration testing
4. Performance benchmarking

## Detailed Implementation Plan

### Phase 1: Preparation and Analysis (Low Risk)

This phase focuses on understanding the current state, identifying blockers, and creating the foundation for the migration without making any breaking changes.

#### 1.1 Dependency Audit and Compatibility Analysis
- **Task**: Complete analysis of all production dependencies for ESM compatibility
- **Deliverable**: ESM compatibility matrix and migration strategy per dependency

**Critical Dependencies Analysis:**

**📦 DEPENDENCY STATUS (Not Blockers):**

All dependencies work fine with ESM since Node.js ESM can import CommonJS modules without issues:

1. **Chalk 4.1.2**: Use `import chalk from 'chalk'` - works perfectly
2. **better-sqlite3 11.10.0**: Use `import Database from 'better-sqlite3'` - no issues
3. **Nunjucks 3.2.4**: CJS default namespace import works from ESM
4. **All other deps**: Standard ESM import syntax

**✅ ESM-READY DEPENDENCIES:**
- @anthropic-ai/sdk, openai, commander, winston, zod, socket.io, tsx, undici
- These require no changes, just import syntax updates

**⚠️ NEEDS TESTING:**
- drizzle-orm: ESM compatible but complex import patterns
- async: Status unclear, may need replacement with native Promises
- js-yaml: Status unclear, may need dynamic import

**Actions for 1.1:**
- [ ] Test chalk v5 upgrade compatibility
- [ ] Evaluate better-sqlite3 alternatives (libsql benchmark)
- [ ] Research nunjucks alternatives or ESM compatibility layers
- [ ] Create dependency decision matrix with pros/cons
- [ ] Document rollback strategy for each dependency choice

#### 1.2 CommonJS Pattern Detailed Analysis
- **Task**: Comprehensive mapping of all CommonJS-specific code patterns
- **Files analyzed**: 8 files with CommonJS patterns identified

**Detailed Pattern Inventory:**

**1. CLI Entry Point Detection (`require.main === module`)**
- **Files affected**: 4 files
  - `src/main.ts`: Main CLI entry point
  - `src/migrate.ts`: Database migration script
  - `src/redteam/strategies/simpleVideo.ts`: Video processing utility
  - `src/redteam/strategies/simpleImage.ts`: Image processing utility
- **Current usage**: Entry point detection for direct script execution
- **ESM equivalent**: `import.meta.url` comparison with `process.argv[1]`
- **Migration complexity**: Low - straightforward pattern replacement

**2. Directory Resolution (`__dirname`)**
- **Files affected**: 5 files
  - `src/esm.ts`: Legacy compatibility layer
  - `src/python/pythonUtils.ts`: Python script path resolution
  - `src/app/vite.config.ts`: Build configuration (can stay, it's already ESM)
  - `src/migrate.ts`: Database migrations folder path
  - `src/providers/golangCompletion.ts`: Go wrapper file copying
- **Current usage**: Directory path resolution for file operations
- **ESM equivalent**: `path.dirname(fileURLToPath(import.meta.url))`
- **Migration complexity**: Low - mechanical replacement

**3. Filename Resolution (`__filename`)**
- **Files affected**: 1 file
  - `src/esm.ts`: Currently commented out but available
- **ESM equivalent**: `fileURLToPath(import.meta.url)`
- **Migration complexity**: Low

**4. Dynamic Module Loading (`require()`)**
- **Files affected**: 4 files with 7 total occurrences
  - `src/esm.ts`: Fallback require() in importModule function
  - `src/__mocks__/esm.ts`: Test mock using require()
  - `src/constants/build.ts`: Build-time constant loading with try/catch
  - `src/util/testCaseReader.ts`: JSON test file loading
- **Current usage**:
  - Conditional imports for build constants
  - JSON file loading
  - Mock implementations
  - Fallback loading in dual-mode system
- **ESM equivalent**: Dynamic `import()` statements
- **Migration complexity**: Medium - requires async/await handling

**Actions for 1.2:**
- [ ] Create detailed migration plan for each file
- [ ] Document dependencies between files that need coordinated changes
- [ ] Identify which patterns can be migrated independently
- [ ] Plan testing strategy for each pattern replacement

#### 1.3 Create ESM Compatibility Utilities
- **Task**: Build comprehensive helper functions for CommonJS → ESM transition
- **Strategy**: Create utilities that work in both CommonJS and ESM during transition

**New files to create:**

**`src/utils/esm-compat.ts`**
```typescript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/**
 * ESM replacement for __dirname
 * Usage: const __dirname = getDirname(import.meta.url);
 */
export function getDirname(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/**
 * ESM replacement for __filename
 * Usage: const __filename = getFilename(import.meta.url);
 */
export function getFilename(metaUrl: string): string {
  return fileURLToPath(metaUrl);
}

/**
 * Cross-platform path resolution with proper URL handling
 */
export function resolvePathFromUrl(metaUrl: string, ...segments: string[]): string {
  const dir = getDirname(metaUrl);
  return path.join(dir, ...segments);
}
```

**`src/utils/cli-detect.ts`**
```typescript
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * ESM replacement for require.main === module check
 * Detects if current module is being run directly as CLI entry point
 */
export function isCliEntry(metaUrl: string, processArgv: string[] = process.argv): boolean {
  try {
    const scriptPath = resolve(fileURLToPath(metaUrl));
    const processPath = resolve(processArgv[1] || '');
    return scriptPath === processPath;
  } catch {
    return false;
  }
}

/**
 * Enhanced CLI detection with additional checks
 */
export function isMainModule(metaUrl: string): boolean {
  return isCliEntry(metaUrl) || process.argv[1]?.endsWith(fileURLToPath(metaUrl));
}
```

**`src/utils/dynamic-import.ts`**
```typescript
/**
 * Safe dynamic import with fallback handling
 * Handles the transition from require() to import()
 */
export async function safeDynamicImport<T = any>(
  modulePath: string,
  options: {
    fallbackRequire?: boolean;
    namedExport?: string;
    defaultExport?: boolean;
  } = {}
): Promise<T> {
  const { fallbackRequire = false, namedExport, defaultExport = false } = options;

  try {
    const imported = await import(modulePath);

    if (namedExport) {
      return imported[namedExport];
    }

    if (defaultExport) {
      return imported.default || imported;
    }

    return imported;
  } catch (error) {
    if (fallbackRequire) {
      try {
        // @ts-ignore - require will exist during transition period
        const required = require(modulePath);
        return namedExport ? required[namedExport] : required;
      } catch (requireError) {
        throw requireError;
      }
    }
    throw error;
  }
}

/**
 * JSON file loading compatible with ESM
 */
export async function loadJsonFile(filePath: string): Promise<any> {
  try {
    // ESM way with import assertions (Node 17.5+)
    const imported = await import(filePath, { assert: { type: 'json' } });
    return imported.default;
  } catch {
    // Fallback: read file and parse JSON
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  }
}
```

#### 1.4 Testing Infrastructure Preparation
- **Task**: Set up comprehensive testing for migration phases
- **Strategy**: Ensure no regressions during gradual migration

**Test Categories:**

**1. Unit Test Compatibility**
- **Current**: Jest with SWC transformer
- **ESM Challenge**: Jest ESM support has limitations
- **Actions**:
  - [ ] Test current test suite with `"type": "module"`
  - [ ] Evaluate Vitest as Jest alternative (ESM-native)
  - [ ] Update jest.config.ts for ESM if staying with Jest
  - [ ] Create test utilities for dual-mode compatibility

**2. Integration Test Suite**
- **Coverage needed**:
  - [ ] CLI command execution tests
  - [ ] Library API usage tests
  - [ ] File system operations (templates, configs)
  - [ ] Database operations (migrations, queries)
  - [ ] External service integrations
- **ESM-specific tests**:
  - [ ] Dynamic import functionality
  - [ ] Module resolution paths
  - [ ] CLI entry point detection
  - [ ] Cross-platform path handling

**3. Compatibility Testing**
- **Node.js versions**: Test ESM on Node 18, 20, 22+
- **Package managers**: npm, yarn, pnpm compatibility
- **Import patterns**: Both `import pkg` and `import { named } from 'pkg'`
- **File extensions**: Verify .js extensions in imports work correctly

#### 1.5 Migration Environment Setup
- **Task**: Prepare development environment for safe migration

**Branch Strategy:**
- [ ] Create `esm-migration` branch from main
- [ ] Set up parallel testing with both CommonJS and ESM builds
- [ ] Configure CI/CD for dual-mode validation
- [ ] Plan staged rollout strategy

**Development Tools:**
- [ ] Update VSCode settings for ESM development
- [ ] Configure TypeScript for ESM-aware IntelliSense
- [ ] Set up lint rules for ESM import patterns
- [ ] Create pre-commit hooks for import validation

**Build Pipeline Updates:**
- [ ] Test build process with ESM TypeScript compilation
- [ ] Verify dist/ output structure remains compatible
- [ ] Ensure CLI binary permissions and shebangs work
- [ ] Test npm pack/publish process with ESM package

#### 1.6 Risk Assessment and Mitigation Planning
- **Task**: Comprehensive risk analysis with specific mitigation strategies

**High-Risk Areas:**
1. **CLI Binary Execution**
   - Risk: ESM changes break CLI installation/execution
   - Mitigation: Extensive cross-platform testing, version pinning
   - Testing: Manual testing on Windows/Mac/Linux

2. **Library Consumer Breaking Changes**
   - Risk: ESM transition breaks downstream projects
   - Mitigation: Major version bump, clear migration guide, beta testing
   - Testing: Test with popular consumer projects

3. **Database Operations**
   - Risk: better-sqlite3 issues with ESM break core functionality
   - Mitigation: Thorough testing, potential alternative evaluation
   - Testing: Migration script testing, database operation validation

4. **Template System**
   - Risk: Nunjucks CommonJS-only nature breaks template rendering
   - Mitigation: Dynamic import strategy, alternative template engine evaluation
   - Testing: All template rendering scenarios

**Medium-Risk Areas:**
- Build process changes affecting asset copying
- Test framework compatibility issues
- Development workflow disruptions
- Documentation and example updates needed

**Low-Risk Areas:**
- Basic import/export syntax changes
- TypeScript compilation settings
- Static analysis and linting updates

#### 1.7 Documentation and Communication Plan
- **Task**: Prepare comprehensive documentation for migration

**Internal Documentation:**
- [ ] Migration runbook with step-by-step procedures
- [ ] Rollback procedures for each phase
- [ ] Troubleshooting guide for common issues
- [ ] Testing checklists for each migration phase

**External Communication:**
- [ ] Migration announcement with timeline
- [ ] Breaking changes documentation
- [ ] ESM migration guide for library consumers
- [ ] FAQ document for common migration questions

**Success Criteria for Phase 1:**
- [ ] Complete dependency compatibility matrix
- [ ] All CommonJS patterns catalogued and migration planned
- [ ] ESM compatibility utilities created and tested
- [ ] Testing infrastructure prepared for migration
- [ ] Risk mitigation strategies documented
- [ ] Go/no-go decision for Phase 2 based on findings

**Phase 1 Estimated Timeline: 1-2 weeks**

This phase is designed to be completely safe - no breaking changes to the codebase, just preparation and analysis. The extensive preparation will ensure Phases 2-4 can proceed smoothly with minimal risk.

---

## **CRITICAL UPDATE: Repo-Specific Analysis Results**

*Based on comprehensive code audit findings, the following critical blockers and concrete implementation details have been identified:*

### **🚨 MANDATORY CHANGES (Cannot proceed without these)**

#### **1. Import Extension Challenge - SOLVED WITH BUNDLING**
- **Scale**: 2,709 extensionless relative imports across 638 files in src/
- **Problem**: Node.js ESM requires explicit `.js` extensions for relative imports
- **Solution**: **tsup bundling (SINGLE RECOMMENDATION)**
  - Bundler handles extension resolution automatically
  - Keep all source imports extensionless - zero rewrites needed
  - Fast, battle-tested approach using esbuild under the hood
- **Estimated Effort**: 2-3 days total

#### **2. JSON Module Imports - CHOOSE STRATEGY**
- **Files affected**: 8 files with JSON imports
  - `src/main.ts`, `src/constants.ts`, `src/commands/debug.ts`, `src/checkNodeVersion.ts`
  - `src/app/vite.config.ts`, `src/redteam/strategies/promptInjections/index.ts`
  - `src/util/testCaseReader.ts` (dynamic JSON loading)

**Two Safe Paths (choose one):**

**Path A: Bundler-inlined JSON (RECOMMENDED)**
- Keep existing: `import packageJson from '../package.json'` in source
- tsup will inline JSON during bundling - no `assert` needed
- Add Jest mapping if tests import JSON: `"^\\.\\./package\\.json$": "<rootDir>/package.json"`

**Path B: Node JSON modules**
- Static: `import pkg from '../package.json' assert { type: 'json' };`
- Dynamic: `await import('./data.json', { assert: { type: 'json' } })`
- Ensure Jest + SWC can handle JSON assertions or mock in tests

#### **3. CommonJS Build Scripts - IMMEDIATE BLOCKER**
- **Files**: `scripts/generate-constants.js`, `scripts/generate-blog-image.js`
- **Problem**: These CJS scripts will break under `"type": "module"`
- **Solution**: Rename to `.cjs` or convert to ESM/TypeScript

### **🔧 CONCRETE IMPLEMENTATION PLAN UPDATES**

#### **Phase 1.1: TypeScript Configuration (Corrected)**
```json
// tsconfig.json changes
{
  "compilerOptions": {
    "module": "NodeNext",           // Matches Node's ESM resolver exactly
    "moduleResolution": "NodeNext", // Aligns TS resolution with Node semantics
    "target": "ES2022",
    "resolveJsonModule": true,      // Keep for JSON import support
    "esModuleInterop": true,        // Required for CJS interop
    "verbatimModuleSyntax": true,   // Optional: preserves import syntax faithfully
    "outDir": "dist",
    "rootDir": "."
  }
}
```

#### **Phase 1.2: JSON Import Fixes (Specific Files)**
**Immediate fixes needed:**

```typescript
// src/main.ts - BEFORE
import { version } from '../package.json';

// src/main.ts - AFTER (Node 20+)
import pkg from '../package.json' assert { type: 'json' };
const { version } = pkg;

// src/constants/build.ts - BEFORE
const generated = require('../generated/constants');

// src/constants/build.ts - AFTER (top-level await with ES2022)
const generated = await import('../generated/constants.js');

// src/util/testCaseReader.ts - BEFORE
const rawContent = require(testFile);

// src/util/testCaseReader.ts - AFTER
const rawContent = await import(testFile, { assert: { type: 'json' } });

// Alternative: fs.readFileSync + JSON.parse
import { readFileSync } from 'node:fs';
const rawContent = JSON.parse(readFileSync(testFile, 'utf8'));

// src/app/vite.config.ts - BEFORE
'@app': path.resolve(__dirname, './src'),

// src/app/vite.config.ts - AFTER
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
'@app': path.resolve(__dirname, './src'),
```

#### **Phase 1.3: Import Extension Strategy Decision**

**CRITICAL DECISION POINT:**

**tsup Bundled ESM Output (SINGLE RECOMMENDATION)**

**Approach**: Use bundler (tsup/rollup/esbuild) for runtime, tsc only for type declarations

**Implementation**:
```bash
npm install --save-dev tsup
```

**New build configuration** (tsup.config.ts):
```typescript
import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI binary (ESM only)
  {
    entry: ['src/main.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    clean: true,
    shims: true, // Provides __dirname, __filename shims automatically
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: ['better-sqlite3', 'playwright', 'sharp'] // Externalize heavy deps
  },
  // Library ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist/src',
    splitting: false,
    treeshake: true,
    external: ['better-sqlite3', 'playwright', 'sharp']
  },
  // Library CJS build for compatibility
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    target: 'node20',
    outDir: 'dist/src',
    outExtension: { '.js': '.cjs' },
    external: ['better-sqlite3', 'playwright', 'sharp']
  }
]);
```

**Package.json script updates**:
```json
{
  "scripts": {
    "build": "npm run generate-constants && tsup && tsc --emitDeclarationOnly && npm run post-build",
    "post-build": "shx cp src/*.html dist/src && shx cp -r drizzle dist/ && chmod +x dist/src/main.js",
    "build:watch": "tsup --watch",
    "tsc": "tsc --emitDeclarationOnly",
    "local": "tsx src/main.ts",
    "db:migrate": "tsx src/migrate.ts",
    "dev:server": "tsx --watch src/server/index.ts"
  }
}
```

**Pros of Option B**:
- **Zero import rewrites**: Keep all 2,709 extensionless imports as-is
- **Automatic shims**: tsup provides __dirname, __filename shims out of the box
- **Tree shaking**: Smaller runtime bundles through dead code elimination
- **Fast builds**: esbuild-based, much faster than tsc
- **Source maps**: Debugging works with original TypeScript code
- **Simplified migration**: No mass code changes required

**Cons of Option B**:
- **Build complexity**: Two-step build process (tsup + tsc for types)
- **Dev vs prod difference**: Source uses extensionless imports, output has bundled modules
- **Bundle debugging**: Runtime stack traces point to bundled code (though source maps help)
- **External deps**: Need to carefully manage what gets bundled vs externalized
- **CLI distribution**: Need to ensure shims work correctly for CLI execution

**tsconfig.json for Option B**:
```json
{
  "compilerOptions": {
    "module": "NodeNext",           // Still use NodeNext for correct resolution
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "declaration": true,            // Types only
    "emitDeclarationOnly": true,    // Let tsup handle JS
    "outDir": "dist",
    "rootDir": "."
  }
}
```

**Migration impact**:
- **Immediate**: Can flip to ESM package.json without import rewrites
- **JSON imports**: Still need assert syntax fixes (8 files)
- **CommonJS patterns**: Still need __dirname, require.main fixes (9 files)
- **Build scripts**: Still need .cjs renames (2 files)
- **Testing**: Jest continues to work with source files (no .js suffix mapping needed)

**Recommendation**: Option B is **significantly less risky** and faster to implement
- Estimated timeline: 2-3 days vs 1-2 weeks for Option A
- Smaller changeset, easier to review and rollback
- Modern toolchain upgrade (tsup is widely used)
- Can always migrate to Option A later if needed

#### **Phase 1.4: Script and Tooling Updates (Specific)**

**Build Scripts to Rename:**
```bash
mv scripts/generate-constants.js scripts/generate-constants.cjs
mv scripts/generate-blog-image.js scripts/generate-blog-image.cjs
```

**Package.json Script Updates:**
```json
{
  "scripts": {
    "local": "tsx src/main.ts",              // was: ts-node
    "db:migrate": "tsx src/migrate.ts",       // was: node --require tsx/cjs
    "dev:server": "tsx --watch src/server/index.ts" // nodemon with tsx
  }
}
```

#### **Phase 1.5: Testing Infrastructure (Finalized)**
- **Keep @swc/jest**: Current setup already handles TS and ESM - no changes needed
- **SWC usage**: Use @swc/jest for tests (fast, ESM-capable), tsx for dev
- **Optional dev alternative**: `node --loader=@swc-node/register/esm src/main.ts` but tsx is more battle-tested
- **JSON handling**: Add minimal Jest mapping if using bundler-inlined JSON and tests fail:
  ```json
  {
    "moduleNameMapper": {
      "^\\.\\./package\\.json$": "<rootDir>/package.json"
    }
  }
  ```

### **🎯 UPDATED PHASE PRIORITIES**

#### **Phase 1 (REVISED): Critical Blockers**
1. **JSON import fixes** (8 files) - 1 day
2. **CJS script renames** - 1 hour
3. **TypeScript config updates** - 1 hour
4. **Import extension strategy decision** - 2-3 days implementation
5. **Test and validate changes** - 1 day

#### **Phase 2: Package Configuration**
- Update to `"type": "module"`
- ESM-only exports with major version bump
- OR conditional exports with CJS wrapper for gentler migration

#### **Phase 3: CommonJS Pattern Migration**
- Replace `require.main === module` (4 files)
- Replace `__dirname` usage (5 files)
- Simplify `src/esm.ts` (remove eval() hack)

### **🚫 DEPENDENCY DECISIONS (Corrected)**

**Based on technical review - these are NOT blockers:**
1. **Chalk v4.1.2**: CJS import from ESM works fine with default import interop (`import chalk from 'chalk'`)
2. **better-sqlite3**: CJS imports work from ESM (`import Database from 'better-sqlite3'`) - Node ESM supports importing CJS
3. **Nunjucks**: CJS default namespace import works from ESM - high usage makes switching costly but not necessary
4. **All other deps**: Ready for ESM with standard import syntax updates

**Key insight**: Node.js ESM can import CommonJS modules without issues - no dynamic imports or require() fallbacks needed

### **💡 RELEASE STRATEGY RECOMMENDATION**

**Recommended: Dual CJS/ESM Build**
```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "require": "./dist/src/index.cjs",
      "types": "./dist/src/index.d.ts"
    }
  }
}
```

**tsup configuration for dual builds**:
```typescript
// tsup.config.ts
export default defineConfig([
  // ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist/src',
    // ... other options
  },
  // CJS build for compatibility
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outDir: 'dist/src',
    outExtension: { '.js': '.cjs' },
    // ... other options
  }
]);
```

This approach provides:
- Real CJS build (not a broken wrapper)
- Proper conditional exports
- Seamless migration path for consumers

### **⚡ IMMEDIATE NEXT STEPS (Final Priority)**

**RECOMMENDED PATH: Option B (Bundled ESM)**

1. **Day 1**:
   - Fix JSON imports in 8 identified files (assert syntax)
   - Rename 2 CJS build scripts to `.cjs`
   - Update TypeScript config for NodeNext + emitDeclarationOnly

2. **Day 2-3**:
   - Install and configure tsup
   - Update build scripts and package.json
   - Test bundled output and CLI functionality
   - Fix remaining CommonJS patterns (9 files)

3. **Day 4**:
   - Update to `"type": "module"` in package.json
   - Test full build, CLI, and test suite
   - Validate library exports work correctly

4. **Day 5**:
   - Final testing and validation
   - Prepare for Phase 2 (package configuration)

**Estimated Phase 1 Timeline: 2-3 days** (Option B) vs 1-2 weeks (Option A)
*Option B avoids 2,709 import rewrites while providing automatic ESM shims*

---

## **CORRECTED IMPLEMENTATION DETAILS**

### **CommonJS Pattern Replacements (Specific Files)**

#### **CLI Detection Pattern (`require.main === module`)**
**Files to update**: `src/main.ts`, `src/migrate.ts`, `src/redteam/strategies/simpleImage.ts`, `src/redteam/strategies/simpleVideo.ts`

```typescript
// BEFORE
if (require.main === module) {
  main();
}

// AFTER (exact path equality - surgical replacement)
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main();
}
```

#### **Directory Resolution (`__dirname`)**
**Files to update**: `src/migrate.ts`, `src/providers/golangCompletion.ts`, `src/python/pythonUtils.ts`, `src/app/vite.config.ts`

```typescript
// BEFORE
const migrationsFolder = path.join(__dirname, '..', 'drizzle');

// AFTER (precise pattern)
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, '..', 'drizzle');
```

### **ESM Compatibility Utilities (Consolidated)**

**`src/utils/esm-compat.ts`**
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path'; // Added missing path import

/**
 * ESM replacement for __dirname
 */
export function getDirname(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/**
 * ESM replacement for __filename
 */
export function getFilename(metaUrl: string): string {
  return fileURLToPath(metaUrl);
}

/**
 * Cross-platform path resolution with proper URL handling
 */
export function resolvePathFromUrl(metaUrl: string, ...segments: string[]): string {
  const dir = getDirname(metaUrl);
  return join(dir, ...segments);
}

/**
 * ESM replacement for require.main === module check
 * Uses exact path equality after resolve() on both sides
 */
export function isMainModule(metaUrl: string): boolean {
  try {
    return resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1] || '');
  } catch {
    return false;
  }
}
```

### **Simplified src/esm.ts (ESM-only)**
```typescript
import { pathToFileURL } from 'node:url';
import { safeResolve } from './util/file.node.js';

/**
 * ESM-only module loader - remove eval() and CJS fallback
 */
export async function importModule(modulePath: string, functionName?: string) {
  const url = pathToFileURL(safeResolve(modulePath)).toString();
  const m = await import(url);
  return functionName ? (m.default ?? m)[functionName] : (m.default ?? m);
}

// Remove getDirectory() - use utilities from esm-compat instead
```

---

## **FINAL IMPLEMENTATION CHECKLIST**

### **Config Updates (Day 1)**
- [ ] **TypeScript**: Update `tsconfig.json` with `NodeNext` + `emitDeclarationOnly`
- [ ] **Build scripts**: Rename `scripts/generate-constants.js` → `.cjs` and `scripts/generate-blog-image.js` → `.cjs`
- [ ] **JSON strategy**: Choose Path A (bundler-inlined) or Path B (JSON modules) and implement consistently

### **tsup Setup (Day 2)**
- [ ] **Install**: `npm install --save-dev tsup`
- [ ] **Configure**: Create `tsup.config.ts` with CLI + library dual builds
- [ ] **Scripts**: Update package.json with tsx dev commands and tsup build
- [ ] **Test**: Verify CLI binary preserves shebang and chmod +x

### **CommonJS Pattern Migration (Day 3)**
- [ ] **CLI detection**: Replace `require.main === module` in `src/main.ts`, `src/migrate.ts`, `src/redteam/strategies/simple{Image,Video}.ts`
- [ ] **Directory resolution**: Replace `__dirname` in `src/migrate.ts`, `src/providers/golangCompletion.ts`, `src/python/pythonUtils.ts`, `src/app/vite.config.ts`
- [ ] **Module loader**: Simplify `src/esm.ts` - remove eval() and CJS fallback
- [ ] **JSON imports**: Apply chosen strategy to 8 identified files

### **ESM Package Transition (Day 4-5)**
- [ ] **Package type**: Update to `"type": "module"` in package.json
- [ ] **Exports**: Configure dual exports with real CJS build (not wrapper)
- [ ] **Testing**: @swc/jest should continue working, add JSON mappings if needed
- [ ] **Validation**: Full test suite + CLI smoke tests + library import verification

### **Success Criteria**
- [ ] Zero import rewrites needed (tsup handles extensions)
- [ ] All tests pass with @swc/jest
- [ ] CLI functionality preserved across all commands
- [ ] Library works as both `import` and `require`
- [ ] Dependencies import correctly (CJS from ESM works fine)

**Key Decision: tsup bundling avoids 2,709 import rewrites while enabling full ESM benefits**
