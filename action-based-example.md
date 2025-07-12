# Action-Based Lazy Loading: Practical Example

## The Problem with Current Command-Based Approach

Currently, we have to maintain command definitions in multiple places:

```typescript
// 1. Command loader map
const commandLoaders = {
  eval: async (program) => { /* ... */ }
};

// 2. Help stubs
if (isHelpOrVersion) {
  program.command('eval').description('Evaluate prompts');
}

// 3. Conditional loading logic
if (commandName === 'eval') {
  await commandLoaders.eval(program);
}
```

## Action-Based Solution

With action-based lazy loading, commands are registered once with lazy actions:

```typescript
// main.ts - Clean and simple!
async function main() {
  const program = new Command('promptfoo');
  
  // Register all commands immediately (lightweight)
  program
    .command('eval')
    .description('Evaluate prompts')
    .option('-c, --config <path>', 'Path to config file')
    .option('-j, --max-concurrency <number>', 'Max concurrent API calls')
    .action(lazyAction(async (options) => {
      // Load heavy dependencies only when action runs
      const { runEval } = await import('./commands/eval/action');
      await runEval(options);
    }));

  program
    .command('init [directory]')
    .description('Initialize project with dummy files or download an example')
    .option('--skip-npm-install', 'Skip npm install')
    .action(lazyAction(async (directory, options) => {
      const { runInit } = await import('./commands/init/action');
      await runInit(directory, options);
    }));

  // ... more commands

  program.parse();
}

// Helper to ensure setup runs before actions
function lazyAction(actionFn: Function) {
  return async (...args: any[]) => {
    // Run setup only for actual commands, not help
    if (!isShowingHelp()) {
      await ensureSetup();
    }
    return actionFn(...args);
  };
}

let setupComplete = false;
async function ensureSetup() {
  if (!setupComplete) {
    const [
      { checkForUpdates },
      { runDbMigrations }
    ] = await Promise.all([
      import('./updates'),
      import('./migrate')
    ]);
    
    await Promise.all([
      checkForUpdates(),
      runDbMigrations()
    ]);
    
    setupComplete = true;
  }
}
```

## Benefits Over Current Approach

### 1. **Single Source of Truth**
```typescript
// Before: Define command in multiple places
// After: Define once
program
  .command('eval')
  .description('Evaluate prompts')
  .option('-c, --config <path>', 'Path to config file')
  .action(lazyAction(/* ... */));
```

### 2. **Natural Help Text**
- No manual stubs needed
- Commander.js generates help automatically
- Options and descriptions always in sync

### 3. **Better Performance Profile**

| Operation         | Current (Command-Based) | Action-Based |
| ----------------- | ----------------------- | ------------ |
| Parse time        | ~50ms                   | ~100ms       |
| Help display      | 180ms                   | 250ms        |
| Command execution | 800ms                   | 800ms        |
| Code complexity   | High                    | Low          |

### 4. **Gradual Migration Path**

You can migrate one command at a time:

```typescript
// Step 1: Extract action from existing command
// commands/eval/action.ts
export async function runEval(options: any) {
  // Move all the heavy logic here
  const { defaultConfig } = await import('../../util/config/default');
  const { Eval } = await import('../../eval');
  // ... rest of eval logic
}

// Step 2: Update command registration
// commands/eval/index.ts
export function evalCommand(program: Command) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .action(async (options) => {
      const { runEval } = await import('./action');
      await runEval(options);
    });
}
```

## Performance Measurements

Estimated performance with action-based approach:

```bash
# Help command (registers all commands but no actions)
$ time promptfoo --help
real    0m0.250s  # vs 0.180s (command-based) vs 0.800s (no lazy)

# Actual command (loads only what's needed)
$ time promptfoo eval
real    0m0.800s  # Same as before - action loading is deferred

# Benefits:
# - 3.2x faster than no lazy loading for help
# - Only 70ms slower than complex command-based approach
# - Much simpler code
```

## Implementation Strategy

1. **Create a helper function** for lazy actions
2. **Refactor commands** to separate registration from execution
3. **Test thoroughly** to ensure behavior is preserved
4. **Measure performance** to confirm benefits

## Conclusion

Action-based lazy loading provides 80% of the performance benefit with 20% of the complexity. It's a more maintainable solution that:

- Eliminates duplicate command definitions
- Preserves Commander.js features
- Simplifies the codebase
- Still provides significant performance gains

For promptfoo, this approach would reduce `--help` time from 800ms to ~250ms while keeping the code much cleaner than the current implementation. 