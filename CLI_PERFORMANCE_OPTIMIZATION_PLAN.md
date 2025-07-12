# Commander.js CLI Performance Optimization Plan

## Current Performance Issues

Your `main.ts` file currently has several performance bottlenecks causing slow startup times (>1 second for `--help`):

1. **Eager loading of all command modules** - All ~20 command modules are imported at startup
2. **Expensive initialization operations** run on every invocation:
   - Database migrations (`runDbMigrations()`)
   - Update checks (`checkForUpdates()`)
   - Loading default configs twice (main app + redteam)
3. **All commands are registered** regardless of which one will be used

## Optimization Strategies

### 1. Implement Lazy Loading (Biggest Impact)

Based on research, lazy loading can provide **4-8x performance improvements**. The key is to only load modules when they're actually needed.

**Implementation approach:**
- Use dynamic `import()` statements instead of top-level imports
- Load command modules only when that specific command is invoked
- Cache loaded modules to avoid re-loading

**Example from the refactored code:**
```typescript
// Instead of:
import { evalCommand } from './commands/eval';

// Use:
const commandLoaders = {
  eval: async (program: Command) => {
    const { evalCommand } = await import('./commands/eval');
    evalCommand(program, defaultConfig, defaultConfigPath);
  }
};
```

### 2. Defer Expensive Operations

Don't run expensive operations for simple commands like `--help`:

```typescript
// Check if it's a help/version command
const isHelpOrVersion = args.includes('--help') || args.includes('-h') || 
                       args.includes('--version') || args.includes('-V');

if (isHelpOrVersion) {
  // Skip DB migrations, update checks, config loading
  // Just show help and exit
}
```

### 3. Optimize for Common Use Cases

For `--help` and `--version`, create lightweight command stubs:

```typescript
if (isHelpOrVersion) {
  // Register command stubs for help display
  program.command('eval').description('Evaluate prompts and models');
  // ... other stubs
  program.parse();
  return; // Exit early
}
```

### 4. Additional Optimizations

1. **Use caching for expensive operations:**
   ```typescript
   let defaultConfigCache = null;
   async function getDefaultConfig() {
     if (!defaultConfigCache) {
       defaultConfigCache = await loadDefaultConfig();
     }
     return defaultConfigCache;
   }
   ```

2. **Load subcommands based on arguments:**
   ```typescript
   const commandName = args[0];
   if (commandLoaders[commandName]) {
     await commandLoaders[commandName](program);
   }
   ```

3. **Parallel loading when possible:**
   - Use `Promise.all()` for independent imports
   - Load related modules together

## Expected Performance Improvements

Based on research and similar optimizations:

| Command       | Before  | After  | Improvement |
| ------------- | ------- | ------ | ----------- |
| `--help`      | ~1000ms | ~200ms | 5x faster   |
| `--version`   | ~1000ms | ~200ms | 5x faster   |
| `init --help` | ~1200ms | ~400ms | 3x faster   |
| `eval` (full) | ~1500ms | ~800ms | 1.9x faster |

## Implementation Checklist

- [x] Replace static imports with dynamic imports
- [x] Create command loader functions
- [x] Implement early exit for help/version
- [x] Add caching for config loading
- [x] Defer database migrations
- [x] Defer update checks
- [x] Fix TypeScript types for lazy loading
- [ ] Test all commands still work correctly
- [ ] Measure performance improvements
- [ ] Consider build-time optimizations (esbuild, bundling)

## Testing the Improvements

Use the benchmark script to measure improvements:

```bash
# Before optimization
node scripts/benchmark-startup.js

# Make changes...

# After optimization
node scripts/benchmark-startup.js
```

## Additional Considerations

1. **Build-time optimizations:**
   - Use esbuild or similar for faster TypeScript compilation
   - Consider bundling for production (reduces file I/O)

2. **Module caching:**
   - Node.js caches required modules by default
   - Dynamic imports also benefit from this

3. **Trade-offs:**
   - Slightly more complex code structure
   - First-time command execution may be slightly slower (loading on demand)
   - Much better overall user experience

## References

- [Lazy Loading Node Modules (8x improvement)](https://jbavari.github.io/blog/2015/08/25/lazy-loading-your-node-modules/)
- [AWS Lambda Lazy Loading Pattern](https://dev.to/aws-builders/thawing-your-lambda-cold-starts-with-lazy-loading-2mop)
- [Node.js Performance Best Practices](https://article.arunangshudas.com/optimizing-node-js-performance-with-lazy-loading-and-code-splitting)

## Next Steps

1. Run the benchmark script to establish baseline
2. Test the refactored implementation
3. Verify all commands work correctly
4. Consider additional optimizations based on profiling
5. Update documentation for contributors about the lazy loading pattern 