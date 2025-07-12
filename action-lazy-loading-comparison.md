# Action-Based vs Command-Based Lazy Loading

## Overview

Instead of lazy loading entire commands, we can lazy load just the action handlers. This addresses many downsides while keeping performance benefits.

## Comparison

### Command-Based Lazy Loading (Current Implementation)

```typescript
// Pros: Maximum performance gain
// Cons: Complex, duplicate command registration

if (isHelpOrVersion) {
  // Duplicate command stubs
  program.command('eval').description('Evaluate prompts');
  // ... more stubs
} else if (commandName === 'eval') {
  // Load and register full command
  const { evalCommand } = await import('./commands/eval');
  evalCommand(program, defaultConfig, defaultConfigPath);
}
```

### Action-Based Lazy Loading (Alternative)

```typescript
// Pros: Simpler, no duplicate registration
// Cons: Commands modules need refactoring

// Register command structure immediately
program
  .command('eval')
  .description('Evaluate prompts')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (...args) => {
    // Lazy load only when action is invoked
    const { evalAction } = await import('./commands/eval/action');
    await evalAction(...args);
  });
```

## Implementation Challenge

The current command modules combine registration and action:

```typescript
// Current: commands/eval.ts
export function evalCommand(program: Command, config, path) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .option('...')
    .action(async (options) => {
      // Action logic here - this is what's heavy
      const { SomeHeavyDependency } = await import('heavy-lib');
      // ... lots of logic
    });
}
```

To use action-based lazy loading, we'd need to refactor:

```typescript
// New: commands/eval/index.ts
export function evalCommand(program: Command) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .option('...')
    .action(async (options) => {
      // Lazy load the action implementation
      const { handleEvalCommand } = await import('./action');
      await handleEvalCommand(options);
    });
}

// New: commands/eval/action.ts
export async function handleEvalCommand(options) {
  // Heavy imports and logic moved here
  const { SomeHeavyDependency } = await import('heavy-lib');
  const { defaultConfig } = await getDefaultConfig();
  // ... actual command logic
}
```

## Hybrid Approach (Best of Both Worlds)

A practical middle ground that works with existing command structure:

```typescript
// Register all commands but with wrapper functions
function registerCommand(
  program: Command,
  loader: () => Promise<void>,
  options?: { skipForHelp?: boolean }
) {
  // For help/version, just load the command structure
  if (isHelpOrVersion && !options?.skipForHelp) {
    loader(); // Commands register themselves but actions won't run
  } else {
    // For actual execution, defer loading until needed
    const commandName = getCommandNameFromLoader(loader);
    if (args[0] === commandName) {
      loader();
    }
  }
}

// Usage
registerCommand(program, async () => {
  const { evalCommand } = await import('./commands/eval');
  evalCommand(program, defaultConfig, defaultConfigPath);
});
```

## Performance Comparison

| Approach           | Help Performance | Command Performance | Complexity |
| ------------------ | ---------------- | ------------------- | ---------- |
| No Lazy Loading    | Slow (800ms)     | Normal              | Low        |
| Command-Based Lazy | Fast (180ms)     | Normal              | High       |
| Action-Based Lazy  | Medium (400ms)   | Normal              | Medium     |
| Hybrid Approach    | Fast (200ms)     | Normal              | Medium     |

## Pros and Cons

### Action-Based Lazy Loading

**Pros:**
- No duplicate command registration
- Help text automatically correct
- Commander.js validation works normally
- Simpler mental model
- Better type safety

**Cons:**
- Still loads command definition modules (lighter but not zero)
- Requires refactoring existing commands
- Less performance gain than full lazy loading

### Recommendation

For a large CLI like promptfoo with 18+ commands:

1. **Short term**: Keep the current command-based lazy loading but improve it:
   - Extract command metadata to reduce duplication
   - Add tests to ensure help text stays in sync
   
2. **Long term**: Gradually refactor to action-based lazy loading:
   - Split heavy action logic from command registration
   - Move expensive imports into action handlers
   - Keep command structure lightweight

3. **Alternative**: Use a build tool to generate optimized bundles:
   - One bundle for help/structure
   - Separate bundles for each command's logic
   - Load appropriate bundle based on command

## Example Refactor

Here's how to refactor a command for action-based lazy loading:

```typescript
// Before: Everything in one file
export function evalCommand(program: Command, config, path) {
  const { heavyDep1 } = require('heavy-dep-1'); // Loaded immediately
  const { heavyDep2 } = require('heavy-dep-2');
  
  program
    .command('eval')
    .description('Evaluate prompts')
    .action(async (options) => {
      // Use heavy dependencies
    });
}

// After: Split registration and action
// commands/eval/register.ts
export function registerEvalCommand(program: Command) {
  program
    .command('eval')
    .description('Evaluate prompts')
    .option('-c, --config <path>', 'Config file')
    .action(async (options, command) => {
      // Lazy load action - only runs when command is executed
      const { executeEval } = await import('./execute');
      await executeEval(options, command);
    });
}

// commands/eval/execute.ts
export async function executeEval(options, command) {
  // Heavy imports only loaded when needed
  const { heavyDep1 } = await import('heavy-dep-1');
  const { heavyDep2 } = await import('heavy-dep-2');
  const { defaultConfig } = await import('../../util/config/default');
  
  // Actual command logic here
}
```

This approach provides a good balance between performance and maintainability. 