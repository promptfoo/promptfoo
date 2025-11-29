# CLI Commands

**What this is:** CLI command implementations using Commander.js. Commands are registered in `src/main.ts`.

## Command Structure

**Every command is a function that registers with Commander:**

```typescript
import type { Command } from 'commander';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util/index';

export function myCommand(program: Command) {
  program
    .command('mycommand')
    .description('Brief description of command')
    .option('-o, --output <path>', 'Output file path')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { output?: string; envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', { name: 'mycommand' });

      try {
        // ... command implementation
        logger.info('Success message');
      } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
        return;
      }
    });
}
```

## Critical Patterns

### 1. Output: ALWAYS Use Logger

```typescript
// Correct - Use logger
logger.info('Output message');
logger.warn('Warning message');
logger.error('Error message');

// WRONG - NEVER use console
console.log('message'); // Don't do this
```

### 2. Telemetry: Track All Command Usage

```typescript
telemetry.record('command_used', {
  name: 'command_name',
  numItems: items.length,
});
```

### 3. Validation: Use Zod Schemas

```typescript
import { z } from 'zod';

const EmailSchema = z.string().email();
const parsed = EmailSchema.safeParse(email);
if (!parsed.success) {
  logger.error(`Invalid email: ${email}`);
  process.exitCode = 1;
  return;
}
```

### 4. Error Handling: Set Exit Code

```typescript
try {
  await doSomething();
} catch (error) {
  logger.error(`Operation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1; // Set exit code for CI/scripts
  return;
}
```

## Directory Structure

```
src/commands/
├── eval.ts              # Main eval command
├── init.ts              # Project initialization
├── config.ts            # Config get/set/unset subcommands
├── list.ts              # List evals/prompts/datasets
├── generate/            # Dataset & assertion generation
└── mcp/                 # Model Context Protocol server
    ├── tools/           # Individual MCP tools
    └── lib/             # MCP shared utilities
```

## Best Practices

### DO:

- Use `logger` for all output
- Track telemetry with `telemetry.record()`
- Validate inputs with Zod schemas
- Set `process.exitCode = 1` on errors
- Use `setupEnv()` for environment setup
- Handle async operations with try/catch
- Return early on errors (don't throw)

### DON'T:

- Use `console.log()` or `console.error()`
- Throw errors in action handlers (set exitCode instead)
- Skip telemetry tracking
- Forget to validate user inputs
- Use `process.exit()` directly (use exitCode)

## Testing Commands Locally

```bash
npm link
promptfoo mycommand --help

# Or use npm run local
npm run local -- mycommand --verbose
```
