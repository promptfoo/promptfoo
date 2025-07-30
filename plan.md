# React 19 Upgrade Plan

## Overview

This document outlines the strategy for upgrading from React 18 to React 19 in the promptfoo project.

## Current State

- Main package: React 18.3.1
- Frontend app (src/app): React 18.3.1
- Material UI: v6.5.0
- Testing: Vitest 3.2.4 + React Testing Library 16.3.0
- Build tool: Vite 6.3.5

## Prerequisites

✅ Already on React 18.3.x (good - this version includes deprecation warnings for React 19)

## Breaking Changes to Address

### 1. TypeScript Types

- Need to update to React 19 RC types until stable release
- Run codemod: `npx types-react-codemod@latest preset-19 ./src/app`

### 2. Removed APIs

- **PropTypes**: Check for any usage and remove (migrate to TypeScript)
- **defaultProps**: Replace with ES6 default parameters in function components
- **ReactDOM.render/hydrate**: Migrate to createRoot API
- **forwardRef**: Can now use ref as a prop directly in function components
- **Module pattern factories**: Check for any usage
- **react-dom/test-utils**: Replace with React Testing Library

### 3. Material UI Compatibility

- MUI v6 supports React 19
- May need to add react-is resolution for compatibility
- Check for useRef usage that might need updating

### 4. Testing Library Updates

- React Testing Library should work with React 19
- May need to update @types/react and @types/react-dom to v19
- Watch for act() warnings

## Upgrade Steps

### Phase 1: Preparation

1. **Run React 19 codemods**

   ```bash
   cd src/app
   npx types-react-codemod@latest preset-19 .
   cd ../..
   npx react-codemod@latest react-19 src
   ```

2. **Update dependencies**

   ```json
   // In src/app/package.json
   "react": "^19.0.0",
   "react-dom": "^19.0.0",
   "@types/react": "npm:types-react@rc",
   "@types/react-dom": "npm:types-react-dom@rc"
   ```

3. **Add react-is resolution** (if needed)
   ```json
   // In package.json
   "overrides": {
     "react-is": "^19.0.0"
   }
   ```

### Phase 2: Code Changes

1. **Search and replace deprecated patterns**
   - Find all `React.forwardRef` usage
   - Find all `defaultProps` usage
   - Find all `PropTypes` usage
   - Check for `ReactDOM.render` or `ReactDOM.hydrate`

2. **Update test setup**
   - Ensure vitest config uses jsdom environment
   - Update test utilities if needed

3. **Fix Material UI specific issues**
   - Check Data Grid apiRef usage (MutableRefObject → RefObject)
   - Review any custom theme modifications

### Phase 3: Testing & CI

1. **Local testing**

   ```bash
   npm run lint
   npm run format:check
   npm run tsc
   npm test
   npm run build
   ```

2. **Fix any type errors**
   - Run `npm run tsc` and address all TypeScript errors
   - Common issues: ref types, event handler types

3. **Run integration tests**
   ```bash
   npm run test:integration
   npm run test:redteam:integration
   ```

### Phase 4: CI Fixes

1. **Common CI failures to expect**
   - Type checking errors
   - Test failures due to React 19 behavior changes
   - Linting issues from codemods
   - Build failures from removed APIs

2. **Debugging strategy**
   - Check CI logs for specific error messages
   - Run failing commands locally
   - Fix issues incrementally

## Rollback Plan

If issues are too complex:

1. Keep changes in separate branch
2. Cherry-pick non-breaking improvements to main
3. Plan phased migration over multiple PRs

## Success Criteria

- All tests pass
- TypeScript compilation succeeds
- Linting passes
- Application builds successfully
- Manual testing shows no regressions
- CI pipeline is green

## Notes

- React 19 is backward compatible for most patterns
- Focus on automated tooling (codemods) first
- Test thoroughly before merging
- Consider feature flagging if needed for gradual rollout
