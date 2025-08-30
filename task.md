# CommonJS to ESM Migration Plan for promptfoo

## Executive Summary

This document outlines a comprehensive plan to migrate the promptfoo project from CommonJS to ESM (ECMAScript Modules). The migration will modernize the codebase, improve testing performsance (potentially up to 4x faster), and align with current JavaScript standards.

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
   - `require.main === module` checks (6 instances)
   - `__dirname` and `__filename` usage (8 instances)
   - Build scripts using CommonJS (generate-constants.js)
   - Module.exports in onboarding.ts (2 instances)

2. **Configuration Dependencies**:
   - Jest configuration needs ESM support
   - ts-node configuration updates required
   - Build process modifications needed

3. **Mixed Workspace Setup**:
   - Root and site workspaces in CommonJS
   - App workspace already ESM
   - Potential dependency resolution issues

## Migration Strategy

### Phase 1: Foundation Setup (Low Risk)

**Estimated Duration**: 2-3 days

#### 1.1 Update TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": false // Explicitly disable for strict ESM
  }
}
```

#### 1.2 Update Root Package.json

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

#### 1.3 Update Site Workspace

```json
// site/package.json
{
  "type": "module"
}
```

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

**Files requiring updates**:

- `src/esm.ts` (already has ESM helper)
- `src/migrate.ts`
- `src/python/pythonUtils.ts`
- `src/app/vite.config.ts`
- `src/providers/golangCompletion.ts`

#### 2.2 Replace require.main Checks

```typescript
// Before
if (require.main === module) {
  main();
}

// After
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

**Files requiring updates**:

- `src/main.ts`
- `src/migrate.ts`
- `src/redteam/strategies/simpleVideo.ts`
- `src/redteam/strategies/simpleImage.ts`

#### 2.3 Fix Import Statements

Add `.js` extensions to all relative imports:

```typescript
// Before
import { evaluate } from './evaluator';

// After
import { evaluate } from './evaluator.js';
```

#### 2.4 Convert Build Scripts

**Convert `scripts/generate-constants.js` to ESM**:

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

**In `src/onboarding.ts`**: Replace `module.exports` with `export`

### Phase 3: Testing & Tooling Updates (Medium Risk)

**Estimated Duration**: 2-3 days

#### 3.1 Update Jest Configuration

```typescript
// jest.config.ts
const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  transform: {
    '^.+\\.m?[tj]sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
          },
          target: 'es2022',
        },
        module: {
          type: 'es6',
        },
      },
    ],
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
```

#### 3.2 Update ts-node Configuration

```json
// tsconfig.json
{
  "ts-node": {
    "esm": true
  }
}
```

#### 3.3 Update Package Scripts

```json
{
  "scripts": {
    "db:migrate": "node --loader tsx/esm src/migrate.ts",
    "local": "node --loader tsx/esm --experimental-specifier-resolution=node src/main.ts"
  }
}
```

### Phase 4: Dependency Updates (Low Risk)

**Estimated Duration**: 1-2 days

#### 4.1 Update Dependencies to ESM Versions

- Replace `lodash` with `lodash-es` (if used)
- Ensure all dependencies support ESM
- Update any CJS-only dependencies

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

### High Risk Items

1. **Jest ESM Support**: Still experimental
   - **Mitigation**: Consider Vitest as alternative
   - **Rollback Plan**: Maintain Jest with CommonJS support

2. **Third-party Dependencies**: Some may not support ESM
   - **Mitigation**: Identify and update/replace incompatible deps
   - **Rollback Plan**: Use import() for problematic dependencies

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

### Estimated Timeline: 8-13 days

- **Phase 1**: 2-3 days
- **Phase 2**: 3-5 days
- **Phase 3**: 2-3 days
- **Phase 4**: 1-2 days

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

### Future Considerations

1. **Top-level await**: Can be used where beneficial
2. **Dynamic imports**: More efficient lazy loading
3. **Bundle analysis**: Tree shaking improvements
4. **Dependency management**: Prefer ESM-first packages

## Conclusion

This migration plan provides a systematic approach to converting the promptfoo project from CommonJS to ESM. The phased approach minimizes risk while delivering the benefits of modern JavaScript modules. The existing ESM usage in the app workspace and extensive dynamic imports indicate the codebase is well-prepared for this migration.

Key success factors:

- **Incremental approach**: Reduces risk and allows for early problem detection
- **Comprehensive testing**: Ensures no functionality regression
- **Clear rollback plan**: Provides confidence to proceed with migration
- **Performance focus**: Targets measurable improvements in test execution

The migration will modernize the codebase and position it for future JavaScript ecosystem developments while maintaining all existing functionality.
