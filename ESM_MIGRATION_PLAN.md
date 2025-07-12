# ESM Migration Plan for Promptfoo

## Executive Summary

This document outlines a comprehensive plan to migrate the Promptfoo project from CommonJS to ECMAScript Modules (ESM) while maintaining full backwards compatibility. The migration will be performed in phases to minimize risk and ensure all functionality continues to work as expected.

## Current State Analysis

### Module System Status
- **Main Package**: CommonJS (`"type": "commonjs"`)
- **Frontend App**: ESM (`"type": "module"`)
- **Site/Documentation**: CommonJS (no type specified)
- **TypeScript Output**: CommonJS (`"module": "CommonJS"`)

### Key Findings
1. The project already uses ES6 import/export syntax throughout, which is transpiled to CommonJS
2. A custom ESM/CJS loader exists (`src/esm.ts`) indicating awareness of compatibility issues
3. Dynamic imports are used for optional dependencies
4. Frontend app already uses ESM with Vite
5. Heavy reliance on Node.js built-ins and native modules

### Major Challenges
1. **Native Dependencies**: `better-sqlite3`, `sharp`, `fluent-ffmpeg`
2. **CommonJS-only Dependencies**: `python-shell`, `nunjucks`
3. **Dynamic Module Loading**: Custom loader logic for both ESM and CJS
4. **CLI Binary**: Needs to support both module systems
5. **Testing Infrastructure**: Jest configuration needs updates
6. **Backwards Compatibility**: Must maintain support for existing integrations

## Migration Strategy

### Phase 1: Preparation and Foundation (Week 1-2)

#### 1.1 Create Dual Package Support
- Set up dual package exports in `package.json`
- Create separate build outputs for ESM and CJS
- Implement proper export maps

#### 1.2 Update Build Infrastructure
- Configure TypeScript to output both ESM and CJS
- Set up separate tsconfig files for each target
- Update build scripts to generate both formats

#### 1.3 Handle Node.js Specific Code
- Replace `__dirname` and `__filename` usage
- Create utility functions for path resolution
- Update file path handling throughout codebase

### Phase 2: Core Library Migration (Week 3-4)

#### 2.1 Update Package Configuration
```json
{
  "type": "module",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    },
    "./package.json": "./package.json"
  }
}
```

#### 2.2 TypeScript Configuration
- Create `tsconfig.esm.json` for ESM output
- Create `tsconfig.cjs.json` for CJS output
- Update base `tsconfig.json` to coordinate builds

#### 2.3 Update Import Statements
- Add `.js` extensions to relative imports (for ESM)
- Update dynamic imports to handle both formats
- Ensure type imports are properly marked

### Phase 3: Dependency Management (Week 5-6)

#### 3.1 Handle Problematic Dependencies
- **better-sqlite3**: Use dynamic import with fallback
- **python-shell**: Wrap in compatibility layer
- **nunjucks**: Consider alternatives or create wrapper

#### 3.2 Update Optional Dependencies
- Maintain dynamic import pattern
- Add proper error handling for missing modules
- Document ESM requirements for optional features

### Phase 4: CLI and Binary Updates (Week 7)

#### 4.1 Create Universal CLI Entry Point
- Detect module system at runtime
- Load appropriate version (ESM or CJS)
- Maintain backwards compatibility

#### 4.2 Update Shebang and Loaders
- Use proper Node.js flags for ESM
- Handle different Node.js versions
- Test on various platforms

### Phase 5: Testing and Validation (Week 8-9)

#### 5.1 Update Test Configuration
- Configure Jest for ESM
- Update test imports
- Ensure all tests pass in both formats

#### 5.2 Integration Testing
- Test with existing examples
- Verify CLI functionality
- Test programmatic API usage

#### 5.3 Performance Testing
- Compare startup times
- Measure memory usage
- Benchmark critical operations

### Phase 6: Documentation and Release (Week 10)

#### 6.1 Update Documentation
- Migration guide for users
- API documentation updates
- Example updates

#### 6.2 Release Strategy
- Beta release for testing
- Gather community feedback
- Gradual rollout with feature flags

## Implementation Details

### 1. Dual Build Configuration

#### TypeScript Configurations

**tsconfig.esm.json**:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist/esm",
    "target": "ES2022"
  }
}
```

**tsconfig.cjs.json**:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist/cjs",
    "target": "ES2020"
  }
}
```

### 2. Path Resolution Utilities

Create `src/utils/paths.ts`:
```typescript
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export function getFilename(importMetaUrl: string): string {
  return fileURLToPath(importMetaUrl);
}
```

### 3. Dynamic Import Wrapper

Update `src/esm.ts`:
```typescript
export async function dynamicImport<T>(modulePath: string): Promise<T> {
  try {
    // Try ESM import first
    return await import(modulePath);
  } catch (error) {
    // Fallback to require for CJS modules
    if (typeof require !== 'undefined') {
      return require(modulePath);
    }
    throw error;
  }
}
```

### 4. Build Scripts

Update `package.json` scripts:
```json
{
  "scripts": {
    "build:esm": "tsc -p tsconfig.esm.json",
    "build:cjs": "tsc -p tsconfig.cjs.json",
    "build:types": "tsc -p tsconfig.types.json",
    "build": "npm run build:clean && npm run build:esm && npm run build:cjs && npm run build:types && npm run build:post",
    "build:post": "node scripts/post-build.js"
  }
}
```

### 5. Jest Configuration for ESM

Create `jest.config.esm.ts`:
```typescript
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.esm.json'
    }]
  }
};
```

## Testing Strategy

### 1. Compatibility Matrix

Test across:
- Node.js versions: 18.x, 20.x, 22.x
- Module systems: ESM, CJS
- Platforms: Linux, macOS, Windows
- Integration types: CLI, API, Examples

### 2. Automated Testing

- CI/CD pipeline updates
- Matrix testing for all combinations
- Performance benchmarks
- Memory leak detection

### 3. Manual Testing Checklist

- [ ] CLI commands work correctly
- [ ] Programmatic API functions
- [ ] All examples run successfully
- [ ] Documentation site builds
- [ ] Red team functionality works
- [ ] Database operations succeed
- [ ] External integrations function

## Rollback Plan

If issues arise:
1. Maintain previous CommonJS-only version
2. Use feature flags to toggle ESM
3. Provide escape hatch via environment variable
4. Document known issues and workarounds

## Success Metrics

1. **Functionality**: All tests pass, examples work
2. **Performance**: No significant degradation
3. **Compatibility**: Works with existing integrations
4. **Developer Experience**: Clear migration path
5. **Community Feedback**: Positive reception

## Timeline

- **Weeks 1-2**: Preparation and foundation
- **Weeks 3-4**: Core library migration
- **Weeks 5-6**: Dependency management
- **Week 7**: CLI and binary updates
- **Weeks 8-9**: Testing and validation
- **Week 10**: Documentation and release

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | High | Dual package support, extensive testing |
| Native module issues | Medium | Dynamic imports, documentation |
| Performance regression | Medium | Benchmarking, optimization |
| Ecosystem incompatibility | Low | Gradual rollout, feedback loop |

## Conclusion

This migration plan provides a structured approach to modernizing Promptfoo's module system while maintaining backwards compatibility. The phased approach minimizes risk and allows for course correction based on testing and feedback. The dual package strategy ensures existing users can continue using the library without disruption while enabling the benefits of ESM for new users and future development.