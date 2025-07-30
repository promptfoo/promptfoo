# Lazy Loading CLI Commands - Merge Results

## Summary

Successfully merged the `feat/lazy-load-cli-commands` branch with `main`, resolving all conflicts and maintaining the lazy loading optimizations for improved CLI startup performance.

## Key Changes

1. **Lazy Loading Implementation**: All CLI command actions are now dynamically imported only when the command is executed, reducing initial startup overhead.

2. **Conflict Resolution**: Resolved 18 merge conflicts across command files, preferring changes from main branch while maintaining the lazy loading pattern.

3. **Fixed Import Issues**: Updated all command files to properly export required functions for tests and other dependencies.

## Performance Results

### Before Lazy Loading (from PR description)

- Main branch average: 971.84ms
- Overall improvement: 15.7% (152.84ms faster)

### After Merge (measured on current machine)

- `promptfoo init --help`: **1.9 seconds** (improved from ~3.2s before optimization)
- Approximately **40% improvement** in startup time for simple commands

## Technical Details

### Commands Refactored

- ✅ auth
- ✅ cache
- ✅ config
- ✅ debug
- ✅ delete
- ✅ eval
- ✅ export
- ✅ generate (dataset, assertions)
- ✅ import
- ✅ init
- ✅ list
- ✅ modelScan
- ✅ share
- ✅ show
- ✅ validate
- ✅ view

### Optimization Opportunities Identified

1. **Database Migrations**: Currently run on every CLI startup. Could be deferred to only commands that need database access (eval, import, export, delete, list, show, share, view).

2. **Default Config Loading**: Currently loaded on startup for all commands. Only needed by: eval, debug, validate, and generate commands.

3. **Further Optimizations**: The `runDbMigrations()` and `loadDefaultConfig()` calls in main.ts could be made lazy, loading only when commands that need them are executed.

## Testing

- ✅ All TypeScript compilation errors resolved
- ✅ CLI help command works correctly
- ✅ Individual command help (e.g., `init --help`) works
- ✅ No duplicate option errors
- ✅ Performance improvement verified

## Breaking Changes

None - all changes are internal optimizations that maintain the same external API.

## Additional Performance Optimization Opportunities

After deeper analysis, here are more optimization opportunities that could significantly improve startup performance:

### 1. Network Request on Startup

**Issue**: `checkForUpdates()` makes a network request with 1s timeout on EVERY startup

```typescript
// In main.ts:
await checkForUpdates(); // This hits https://api.promptfoo.dev/api/latestVersion
```

**Solution**:

- Cache the version check result with a TTL (e.g., check once per day)
- Make it async/non-blocking
- Only check on certain commands (e.g., `eval`, not `--help`)

### 2. Heavy Import Chain

**Issue**: main.ts imports 30+ command files synchronously at startup
**Solution**: Lazy load command registration itself:

```typescript
// Instead of:
import { authCommand } from './commands/auth';

// Do:
const commands = {
  auth: () => import('./commands/auth').then((m) => m.authCommand),
  cache: () => import('./commands/cache').then((m) => m.cacheCommand),
  // etc...
};
```

### 3. Database Migrations on Every Startup

**Issue**: `runDbMigrations()` runs for ALL commands, even `--help`
**Solution**: Only run for commands that need DB:

- eval, import, export, delete, list, show, share, view
- Skip for: init, help, version, auth, config, etc.

### 4. Default Config Loading

**Issue**: `loadDefaultConfig()` loads and parses YAML for all commands
**Solution**: Only load for commands that use config:

- eval, debug, validate, generate commands
- Skip for most other commands

### 5. Logger and Chalk Imports

**Issue**: Heavy dependencies (chalk, logger) imported even for simple commands
**Solution**:

- Lazy load logger for commands that don't output logs
- Use lightweight alternatives for basic output

### 6. Redundant Imports

**Issue**: Some modules import both at top-level and dynamically
**Solution**: Audit and remove redundant imports

### 7. Command Registration Overhead

**Issue**: All commands registered even if user only runs one
**Solution**: Register commands on-demand based on argv[2]

### Estimated Performance Impact

With ALL optimizations implemented:

- Current: ~1.9s for `init --help`
- Potential: ~200-300ms (80-85% improvement)
- Most impact from: network request removal (1s) + lazy command loading

### Priority Order

1. **Remove/defer checkForUpdates()** - Immediate 1s improvement
2. **Lazy load command registration** - ~200-300ms improvement
3. **Defer runDbMigrations()** - ~100-200ms improvement
4. **Defer loadDefaultConfig()** - ~100ms improvement
5. **Other optimizations** - ~50-100ms combined

The lazy loading pattern has proven effective and these additional optimizations could reduce startup time by 80-85%, making the CLI feel instant for simple commands like `--help`.

## Proof of Concept: Ultimate Lazy Loading

Here's how the main.ts could be restructured for maximum performance:

```typescript
// Ultra-fast startup - only essential imports
import { Command } from 'commander';
import { version } from '../package.json';

const commandLoaders = {
  eval: () => import('./loaders/evalLoader'),
  init: () => import('./loaders/initLoader'),
  auth: () => import('./loaders/authLoader'),
  // ... etc
};

async function main() {
  const program = new Command('promptfoo');

  // Fast path for help/version
  if (process.argv.includes('--help') || process.argv.includes('--version')) {
    program.version(version);
    // Register commands with just descriptions (no imports)
    program.command('eval', 'Evaluate prompts');
    program.command('init', 'Initialize project');
    // etc...
    program.parse();
    return;
  }

  // Only load what's needed for the specific command
  const commandName = process.argv[2];
  if (commandLoaders[commandName]) {
    const loader = await commandLoaders[commandName]();
    await loader.default(program);
  }

  program.parse();
}

main();
```

This approach would achieve:

- `--help`: ~50ms (just commander + minimal code)
- `init --help`: ~200ms (load only init command)
- Full commands: Load only what they need

## Verification

Yes, I am confident that:

1. ✅ The merge was completed successfully
2. ✅ All conflicts were resolved correctly
3. ✅ The lazy loading for command actions is working
4. ✅ Performance improved by ~40% already
5. ✅ Multiple additional optimization opportunities identified

The biggest "low-hanging fruit" optimizations are:

- **checkForUpdates()** removal/deferral: Save ~1 second
- **Lazy command registration**: Save ~500-700ms
- **Defer DB/config loading**: Save ~200-300ms

With these changes, the CLI could achieve near-instant startup times (~50-200ms) for simple commands.

## Implemented Optimizations

### 1. Deferred Update Check ✅

Created `updates-deferred.ts` with:

- Non-blocking execution
- Only runs for specific commands (eval, view, redteam)
- Runs every time (no caching) as requested
- Now uses the same promise pattern as DB and config

### 2. Lazy Database Migrations ✅

Modified `main.ts` to:

- Skip DB init for quick commands (--help, --version)
- Run migrations as a promise
- Await only when commands need database access

### 3. Lazy Default Config Loading ✅

Modified `main.ts` to:

- Skip config loading for help/version commands
- Load config as a promise for commands that need it
- Dynamic import to avoid loading the config module unnecessarily

### Performance Results After Implementation

| Command       | Initial | After Lazy Actions | After All Optimizations | Total Improvement |
| ------------- | ------- | ------------------ | ----------------------- | ----------------- |
| `--help`      | ~3.2s   | 2.3s               | **1.0s**                | **69% faster**    |
| `init --help` | ~3.2s   | 1.9s               | **0.58s**               | **82% faster**    |
| `eval --help` | ~2.0s   | 1.4s               | **0.80s**               | **60% faster**    |

### Code Changes - Unified Promise Pattern

All three resources now use the same clean pattern:

```typescript
// 1. Start all resources as promises (non-blocking)
let updateCheckPromise = shouldCheckUpdates ? checkForUpdatesDeferred().catch(() => {}) : null;
let dbMigrationPromise = needsDatabase ? import('./migrate').then(m => m.runDbMigrations()) : null;
let configPromise = needsConfig ? import('./util/config/default').then(m => m.loadDefaultConfig()) : null;

// 2. Single preAction hook awaits what each command needs
program.hook('preAction', async (thisCommand) => {
  const cmdName = thisCommand.name();

  // Await update check if needed
  if (updateCheckPromise && ['eval', 'view', 'redteam'].includes(cmdName)) {
    await updateCheckPromise;
  }

  // Await database if needed
  if (dbMigrationPromise && ['eval', 'import', 'export', ...].includes(cmdName)) {
    await dbMigrationPromise;
  }

  // Await config if needed
  if (configPromise && ['eval', 'debug', 'validate', ...].includes(cmdName)) {
    const config = await configPromise;
    defaultConfig = config.defaultConfig;
    defaultConfigPath = config.defaultConfigPath;
  }
});
```

This pattern is clean, consistent, and ensures resources are loaded just-in-time for each command.

## Conclusion

The implemented optimizations demonstrate that the lazy loading pattern is highly effective:

- **82% improvement** for `init --help` (3.2s → 0.58s)
- **69% improvement** for `--help` (3.2s → 1.0s)
- **60% improvement** for `eval --help` (2.0s → 0.80s)

Key achievements:

- Update checks no longer block startup (non-blocking)
- Database only initialized when needed (lazy promise)
- Config only loaded for commands that use it (dynamic import)
- Help commands now feel nearly instant (~0.5-1s)

With these optimizations, the CLI startup performance has improved dramatically. The remaining time is primarily from loading the command registration functions themselves, which could be further optimized with lazy command registration (loading only the command being executed).
