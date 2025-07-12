# CLI Startup Optimization Summary

## What We've Done

### 1. Optimized checkNodeVersion

- Removed heavy imports (chalk, logger)
- Only loads dependencies when version mismatch occurs
- Estimated savings: ~150ms

### 2. Refactored Commands with Lazy Loading

Applied the minimal imports pattern to these commands:

- **eval** - Moved heavy logic to evalAction.ts
- **init** - Moved heavy logic to initAction.ts
- **view** - Moved heavy logic to viewAction.ts
- **generate** (dataset/assertions) - Moved heavy logic to action files
- **share** - Moved heavy logic to shareAction.ts
- **show** - Moved heavy logic to showAction.ts
- **list** - Moved heavy logic to listAction.ts
- **cache** - Moved heavy logic to cacheAction.ts

### 3. Key Pattern Applied

```typescript
// Before: Heavy imports at top level
import chalk from 'chalk';
import logger from '../logger';
import telemetry from '../telemetry';
// ... many more imports

// After: Minimal imports for registration
import type { Command } from 'commander';

// Lazy load everything in action handler
.action(async (...args) => {
  const { actionHandler } = await import('./command/action');
  await actionHandler(...args);
});
```

## Results

- Initial startup time: ~977ms
- After optimizations: ~909ms
- **Total improvement: ~68ms (7%)**

## Why the Improvement is Limited

The user correctly identified the core issue: **"you should split out the imports more so that command registration is not expensive"**

Even though we lazy load action handlers, the command registration files still:

1. Are all imported eagerly by main.ts
2. Import some dependencies at the module level (e.g., zod schemas, constants)
3. Create a cascading effect where importing one module triggers many others

## Next Steps for Greater Improvements

### 1. Lazy Load Command Registration in main.ts

Instead of:

```typescript
import { evalCommand } from './commands/eval';
import { initCommand } from './commands/init';

// ... all commands imported eagerly
```

Consider:

```typescript
// Only import the most essential commands eagerly
import { evalCommand } from './commands/eval';

// Lazy load less common commands
if (process.argv[2] === 'share') {
  const { shareCommand } = await import('./commands/share');
  shareCommand(program);
}
```

### 2. Further Minimize Command File Imports

Some command files still import schemas and types that could be lazy loaded:

- Move zod schemas into action files
- Lazy load type definitions where possible
- Extract re-exported functions to avoid loading action modules

### 3. Consider Command Splitting

- Create a separate `promptfoo-dev` CLI for development commands
- Move rarely used commands to plugins
- Use sub-process spawning for heavy commands

### 4. Profile Import Chain

Use tools like `--trace-warnings` or webpack bundle analyzer to identify:

- Which modules take the longest to load
- Circular dependencies
- Unnecessary imports

## Benchmark Script

Created `scripts/benchmark-startup.js` to measure startup performance.

## Conclusion

While we've made progress, achieving the target 3-4x improvement (800ms → 200-250ms) requires more fundamental changes to how commands are loaded in main.ts. The current approach of eagerly importing all command modules limits the effectiveness of lazy loading within those modules.
