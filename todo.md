# Clean Sheet Refactor: Lazy Loading Command Actions Without Touching main.ts

## Overview

Refactor each command file to separate registration (lightweight) from execution (heavyweight), keeping main.ts completely unchanged.

## Core Principle

- main.ts imports commands as before (no changes)
- Each command file exports a lightweight registration function
- Action logic is moved to separate functions that are lazy-loaded
- Heavy imports are moved inside the action functions

## Architecture Pattern

### Before (Current Structure)

```typescript
// src/commands/eval.ts
import { heavyDependency1 } from '../heavy1';
// Loaded immediately
import { heavyDependency2 } from '../heavy2';

// Loaded immediately

export function evalCommand(program: Command) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .action(async (options) => {
      // Action logic using heavy dependencies
      await heavyDependency1.doSomething();
    });
}
```

### After (Lazy Loaded Actions)

```typescript
// src/commands/eval/evalAction.ts
import { heavyDependency1 } from '../../heavy1';
// Only loaded when action runs
import { heavyDependency2 } from '../../heavy2';

// src/commands/eval.ts
export function evalCommand(program: Command) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .action(async (options) => {
      // Lazy load the action handler
      const { evalAction } = await import('./eval/evalAction');
      await evalAction(options);
    });
}

// Only loaded when action runs

export async function evalAction(options: any) {
  // Action logic using heavy dependencies
  await heavyDependency1.doSomething();
}
```

## TODO List

### Phase 0: Quick Wins (Do First!)

These optimizations can be done immediately with minimal risk:

#### Optimize checkNodeVersion (~150ms savings)

- [ ] Modify `src/checkNodeVersion.ts` to lazy-load dependencies
- [ ] Current implementation:
  ```typescript
  import chalk from 'chalk';
  import logger from './logger';

  // Heavy import!
  ```
- [ ] Optimized implementation:
  ```typescript
  export const checkNodeVersion = (): void => {
    const requiredVersion = engines.node;

    // Version check logic...

    if (versionMismatch) {
      // Only load chalk when needed (rare case)
      const chalk = require('chalk');

      console.error(
        chalk.yellow(
          `You are using Node.js ${major}.${minor}.${patch}. This version is not supported. Please use Node.js ${requiredVersion}.`,
        ),
      );

      process.exitCode = 1;
      throw new Error(chalk.yellow(errorMessage));
    }
    // Happy path: zero imports!
  };
  ```
- [ ] Benefits:
  - Saves ~150ms on every CLI invocation
  - No async changes needed
  - One-file change
  - Since version mismatches are rare, bypassing logger is acceptable

#### Other Quick Wins

- [ ] Identify other top-level imports in main.ts that could be deferred
- [ ] Look for heavy imports that are only used in specific conditions

### Phase 1: Setup & Planning

- [ ] Create benchmark script to measure current startup times
- [ ] Document current import structure and identify heavy dependencies
- [ ] Create a priority list of commands to refactor (by usage frequency)

### Phase 2: Refactor Commands (Priority Order)

#### 1. Eval Command (Most Complex)

- [ ] Create `src/commands/eval/evalAction.ts`
- [ ] Move all action logic from evalCommand to evalAction
- [ ] Move heavy imports into evalAction
- [ ] Update evalCommand to lazy load evalAction
- [ ] Test eval command functionality

#### 2. Init Command (Lightweight)

- [ ] Create `src/commands/init/initAction.ts`
- [ ] Move action logic and imports
- [ ] Update initCommand to lazy load
- [ ] Test init command

#### 3. View Command

- [ ] Create `src/commands/view/viewAction.ts`
- [ ] Move server startup logic and imports
- [ ] Update viewCommand to lazy load
- [ ] Test view command

#### 4. Generate Commands

- [ ] Create `src/commands/generate/dataset/datasetAction.ts`
- [ ] Create `src/commands/generate/assertions/assertionsAction.ts`
- [ ] Create `src/commands/generate/redteam/redteamAction.ts`
- [ ] Move respective action logic and imports
- [ ] Update generate commands to lazy load
- [ ] Test all generate subcommands

#### 5. Redteam Commands

- [ ] Create action files for each redteam subcommand
- [ ] Move action logic and imports
- [ ] Update redteam commands to lazy load
- [ ] Test redteam functionality

#### 6. Remaining Commands (Alphabetical)

- [ ] auth → `src/commands/auth/authAction.ts`
- [ ] cache → `src/commands/cache/cacheAction.ts`
- [ ] config → `src/commands/config/configAction.ts`
- [ ] debug → `src/commands/debug/debugAction.ts`
- [ ] delete → `src/commands/delete/deleteAction.ts`
- [ ] export → `src/commands/export/exportAction.ts`
- [ ] feedback → `src/commands/feedback/feedbackAction.ts`
- [ ] import → `src/commands/import/importAction.ts`
- [ ] list → `src/commands/list/listAction.ts`
- [ ] scan-model → `src/commands/modelScan/modelScanAction.ts`
- [ ] share → `src/commands/share/shareAction.ts`
- [ ] show → `src/commands/show/showAction.ts`
- [ ] validate → `src/commands/validate/validateAction.ts`

### Phase 3: Shared Utilities

- [ ] Create `src/commands/utils/setupHelpers.ts` for shared lazy setup logic
- [ ] Move common heavy operations (DB migrations, update checks) to lazy helpers
- [ ] Implement caching for setup operations to avoid duplicate work

### Phase 4: Testing

- [ ] Update unit tests to work with new structure
- [ ] Add tests for lazy loading behavior
- [ ] Performance benchmarks for each command
- [ ] Integration tests to ensure commands work correctly

### Phase 5: Documentation

- [ ] Update contributing guidelines with new pattern
- [ ] Document the lazy loading architecture
- [ ] Add performance improvement metrics to README

## Implementation Guidelines

### 1. Identifying Heavy Dependencies

Look for imports that:

- Load large modules (e.g., database, evaluator)
- Trigger side effects on import
- Import other heavy modules transitively
- Are only used in action handlers

### 2. Action File Structure

```typescript
// src/commands/[command]/[command]Action.ts
// All heavy imports go here
import { heavyDep } from '../../heavy';

export interface [Command]Options {
  // Type-safe options interface
}

export async function [command]Action(options: [Command]Options) {
  // All action logic here
}
```

### 3. Command File Structure

```typescript
// src/commands/[command].ts
// Only lightweight imports
import { Command } from 'commander';

export function [command]Command(program: Command) {
  program
    .command('[command]')
    .description('...')
    .option(...)
    .action(async (...args) => {
      // Lazy load action
      const { [command]Action } = await import('./[command]/[command]Action');
      await [command]Action(...args);
    });
}
```

### 4. Testing Strategy

- Mock dynamic imports in tests
- Test both registration and execution separately
- Ensure lazy loading doesn't break error handling

## Expected Results

### Performance Improvements

- Target: 3-4x faster startup (800ms → 200-250ms)
- Help commands should be near-instant (<200ms)
- First run of a command will have slight overhead (+10-20ms)

### Benefits

1. **No main.ts changes**: Zero risk to core CLI structure
2. **Gradual migration**: Can be done command by command
3. **Clear separation**: Registration vs execution logic
4. **Type safety**: Maintained through interfaces
5. **Testability**: Easier to test action logic in isolation

### Potential Challenges

1. **Circular dependencies**: Need careful import management
2. **Type exports**: May need to export types separately
3. **Error handling**: Ensure import errors are caught gracefully
4. **Development experience**: Slightly more complex debugging

## Success Criteria

- [ ] All commands work as before
- [ ] Startup time improved by >3x
- [ ] No regression in command execution time
- [ ] All tests passing
- [ ] No increase in bundle size
- [ ] Clear documentation for maintainers
