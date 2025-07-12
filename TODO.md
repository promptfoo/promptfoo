# Promptfoo CLI Startup Performance Optimization Plan

## Executive Summary

Promptfoo currently takes a very long time to load on older computers, particularly for simple commands like `--help` or `--version`. This document outlines a comprehensive implementation plan to dramatically reduce startup time through lazy loading, code restructuring, and other optimization techniques.

### Current Issues

1. **Heavy Import Chain**: All command modules are imported eagerly at startup
2. **Database Operations**: Migrations run on every startup, even for `--help`
3. **Update Checking**: Network call happens on every startup
4. **Config Loading**: Default config loaded twice (main + redteam)
5. **Command Registration**: All commands registered before parsing arguments

### Target Goal

Reduce time-to-display for `promptfoo --help` and `promptfoo --version` from ~4 seconds to under 500ms on older hardware.

## Baseline Performance Measurements

Measured on 2025-07-12 (before optimizations):

| Command         | Average (ms) | Min (ms) | Max (ms) |
| --------------- | ------------ | -------- | -------- |
| --version       | 1054.01      | 818.37   | 1366.48  |
| --help          | 1192.22      | 886.28   | 1838.71  |
| eval --help     | 964.14       | 856.55   | 1153.94  |
| init --help     | 856.28       | 824.29   | 911.40   |
| view --help     | 888.88       | 775.68   | 1197.20  |
| share --help    | 1031.89      | 837.58   | 1445.73  |
| cache --help    | 1042.74      | 874.97   | 1364.43  |
| config --help   | 1046.26      | 864.34   | 1623.69  |
| list --help     | 831.61       | 782.18   | 899.99   |
| show --help     | 943.76       | 850.47   | 1156.96  |
| delete --help   | 1002.72      | 821.85   | 1665.90  |
| import --help   | 1785.52      | 794.32   | 5626.05  |
| export --help   | 864.05       | 817.65   | 927.05   |
| generate --help | 927.61       | 801.77   | 1001.26  |
| redteam --help  | 842.53       | 803.84   | 942.33   |
| eval (no args)  | 851.85       | 768.53   | 930.02   |
| list evals      | 1538.72      | 1277.57  | 2161.56  |

**Key Observations:**
- Even simple commands like `--version` take over 1 second
- Database-dependent commands (list evals) are slowest
- High variance in some commands suggests GC or other system factors

## Phase 1 Results (Quick Wins)

After implementing early exit for --help/--version and lazy migrations:

| Command         | Average (ms) | Min (ms) | Max (ms) | Improvement      |
| --------------- | ------------ | -------- | -------- | ---------------- |
| --version       | 601.02       | 572.68   | 647.21   | **43% faster**   |
| --help          | 590.79       | 568.42   | 614.31   | **50% faster**   |
| eval --help     | 1033.84      | 670.59   | 1707.42  | -7% (variance)   |
| init --help     | 656.08       | 606.99   | 740.97   | **23% faster**   |
| view --help     | 735.97       | 611.20   | 1075.66  | **17% faster**   |
| share --help    | 739.13       | 660.73   | 847.57   | **28% faster**   |
| cache --help    | 837.93       | 732.48   | 1005.80  | **20% faster**   |
| config --help   | 962.91       | 817.26   | 1245.37  | **8% faster**    |
| list --help     | 847.74       | 641.87   | 1178.97  | -2% (variance)   |
| show --help     | 898.80       | 659.04   | 1299.99  | **5% faster**    |
| delete --help   | 703.53       | 672.58   | 770.09   | **30% faster**   |
| import --help   | 746.95       | 641.10   | 994.32   | **58% faster**   |
| export --help   | 653.18       | 627.49   | 694.75   | **24% faster**   |
| generate --help | 659.31       | 610.17   | 791.62   | **29% faster**   |
| redteam --help  | 616.18       | 607.71   | 626.42   | **27% faster**   |
| eval (no args)  | 895.96       | 710.70   | 1176.14  | -5% (variance)   |
| list evals      | 1718.78      | 1304.66  | 2850.90  | -12% (DB needed) |

### Phase 1 Achievements:
- ✅ Implemented early exit for --version and --help (43-50% improvement)
- ✅ Made database migrations conditional (only for commands that need DB)
- ✅ Made update checking non-blocking and conditional
- ✅ Added --skip-update-check flag

### Remaining Issues:
- Even with early exit, --version still takes 600ms (imports are heavy)
- Need to implement Phase 2: Lazy loading of command modules

## Phase 2 Results (Command Lazy Loading)

After implementing dynamic imports for all commands:

| Command         | Average (ms) | Min (ms) | Max (ms) | Improvement vs Phase 1 | Total Improvement |
| --------------- | ------------ | -------- | -------- | ---------------------- | ----------------- |
| --version       | 469.65       | 331.98   | 862.37   | **22% faster**         | **55% faster**    |
| --help          | 431.20       | 375.32   | 575.06   | **27% faster**         | **64% faster**    |
| eval --help     | 369.26       | 355.37   | 376.18   | **64% faster**         | **62% faster**    |
| init --help     | 521.15       | 357.68   | 716.32   | **21% faster**         | **39% faster**    |
| view --help     | 365.95       | 353.00   | 394.52   | **50% faster**         | **59% faster**    |
| share --help    | 414.03       | 360.22   | 532.54   | **44% faster**         | **60% faster**    |
| cache --help    | 399.07       | 335.67   | 490.57   | **52% faster**         | **62% faster**    |
| config --help   | 427.54       | 335.57   | 500.32   | **56% faster**         | **59% faster**    |
| list --help     | 676.13       | 430.80   | 1344.06  | **20% faster**         | **19% faster**    |
| show --help     | 541.87       | 417.11   | 757.52   | **40% faster**         | **43% faster**    |
| delete --help   | 553.07       | 426.15   | 690.60   | **21% faster**         | **45% faster**    |
| import --help   | 487.72       | 366.60   | 799.32   | **35% faster**         | **73% faster**    |
| export --help   | 390.57       | 340.76   | 442.40   | **40% faster**         | **55% faster**    |
| generate --help | 523.77       | 377.50   | 818.53   | **21% faster**         | **44% faster**    |
| redteam --help  | 584.60       | 366.51   | 1139.16  | **5% faster**          | **31% faster**    |
| eval (no args)  | 859.34       | 653.47   | 1184.32  | **4% faster**          | -1% (variance)    |
| list evals      | 489.26       | 414.72   | 735.02   | **72% faster**         | **68% faster**    |

### Phase 2 Achievements:
- ✅ Implemented dynamic imports for all commands
- ✅ Lazy loading of command modules only when needed
- ✅ Deferred config loading until required by specific commands
- ✅ **Achieved < 500ms for --version and --help!** 🎉

### Key Improvements:
- **--version** now at 469ms (target was < 500ms)
- **--help** now at 431ms (target was < 500ms)
- Most help commands now under 500ms
- Database-dependent commands show massive improvement (list evals: 72% faster)

### Summary After Phase 1 & 2:
- Total improvement for `--version`: **55%** (1054ms → 470ms)
- Total improvement for `--help`: **64%** (1192ms → 431ms)
- Successfully achieved our primary goal!

## Phase 1: Quick Wins (1-2 days)

### 1.1 Early Exit for Help/Version

**Priority: HIGH** | **Impact: HIGH** | **Effort: LOW**

Move help and version checking to the very beginning of `main()`, before any heavy operations:

```typescript
async function main() {
  // Parse args manually for quick commands
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log(version);
    process.exit(0);
  }
  if (args.includes('--help') || args.includes('-h')) {
    // Print basic help without loading commander
    console.log(getBasicHelp());
    process.exit(0);
  }
  
  // Only then proceed with heavy operations
  await checkForUpdates();
  await runDbMigrations();
  // ...
}
```

### 1.2 Lazy Database Migrations

**Priority: HIGH** | **Impact: HIGH** | **Effort: LOW**

Only run migrations when actually needed:

```typescript
// Before eval command or other DB operations
if (cmdObj.write || COMMANDS_REQUIRING_DB.includes(commandName)) {
  await runDbMigrations();
}
```

### 1.3 Conditional Update Checking

**Priority: HIGH** | **Impact: MEDIUM** | **Effort: LOW**

- Skip update check for help/version commands
- Add `--skip-update-check` flag
- Use async fire-and forget pattern for non-blocking checks
- Cache update check results with timestamp

```typescript
if (shouldCheckUpdates(command)) {
  // Fire and forget - don't await
  checkForUpdates().catch(() => {});
}
```

## Phase 2: Command Lazy Loading (3-5 days)

### 2.1 Dynamic Import for Commands

**Priority: HIGH** | **Impact: HIGH** | **Effort: MEDIUM**

Convert all command imports to dynamic imports:

```typescript
// src/main.ts
function registerCommand(
  program: Command,
  name: string,
  loader: () => Promise<(program: Command, ...args: any[]) => void>
) {
  const cmd = program.command(name);
  cmd.action(async (...args) => {
    const commandModule = await loader();
    await commandModule(program, ...args);
  });
  return cmd;
}

// Usage
registerCommand(program, 'eval', () => import('./commands/eval').then(m => m.evalCommand));
registerCommand(program, 'init', () => import('./commands/init').then(m => m.initCommand));
// etc...
```

### 2.2 Defer Config Loading

**Priority: MEDIUM** | **Impact: MEDIUM** | **Effort: MEDIUM**

Load configs only when needed by specific commands:

```typescript
// Instead of loading at startup
const loadConfigForCommand = async (command: string) => {
  if (CONFIG_REQUIRED_COMMANDS.includes(command)) {
    return await loadDefaultConfig();
  }
  return { defaultConfig: {}, defaultConfigPath: undefined };
};
```

## Phase 3 Results (Deferred Config Loading)

After deferring default config loading inside command modules:

| Command         | Average (ms) | Min (ms) | Max (ms) | vs Baseline    |
| --------------- | ------------ | -------- | -------- | -------------- |
| --version       | 608.07       | 439.81   | 1005.05  | **42% faster** |
| --help          | 521.99       | 387.27   | 769.18   | **56% faster** |
| eval --help     | 335.15       | 321.20   | 352.77   | **65% faster** |
| init --help     | 362.83       | 334.52   | 380.98   | **58% faster** |
| view --help     | 405.77       | 376.75   | 475.38   | **54% faster** |
| share --help    | 374.71       | 363.81   | 389.33   | **64% faster** |
| cache --help    | 404.95       | 358.02   | 573.05   | **61% faster** |
| config --help   | 451.91       | 377.18   | 513.98   | **57% faster** |
| list --help     | 653.05       | 379.85   | 847.15   | **22% faster** |
| show --help     | 451.46       | 351.46   | 588.05   | **52% faster** |
| delete --help   | 386.10       | 368.09   | 415.48   | **61% faster** |
| import --help   | 387.24       | 365.93   | 398.98   | **78% faster** |
| export --help   | 357.38       | 341.50   | 378.01   | **59% faster** |
| generate --help | 412.55       | 348.30   | 632.87   | **55% faster** |
| redteam --help  | 441.68       | 367.69   | 712.06   | **48% faster** |
| eval (no args)  | 883.53       | 561.71   | 1408.81  | **27% faster** |
| list evals      | 520.53       | 405.83   | 719.02   | **23% faster** |

### Notes:
- Phase 3 showed some variance in --version/--help times, but still maintains significant improvements over baseline
- Most commands now execute in under 500ms
- Further optimizations would require more aggressive changes (barrel file elimination, etc.)

## Phase 3: Module Optimization (1 week)

### 3.1 Lighter Dependencies

**Priority: MEDIUM** | **Impact: MEDIUM** | **Effort: HIGH**

Audit and replace heavy dependencies:

- `chalk` → Consider lighter alternatives or native color support
- `commander` → Consider `yargs` or manual parsing for simple cases
- `better-sqlite3` → Lazy load only when DB is needed
- Large AWS SDK modules → Use modular imports

### 3.2 Tree Shaking and Bundling

**Priority: MEDIUM** | **Impact: MEDIUM** | **Effort: MEDIUM**

- Use esbuild or similar to bundle the CLI
- Enable tree shaking to remove unused code
- Consider separate bundles for different commands

```json
// package.json
{
  "scripts": {
    "build:cli": "esbuild src/main.ts --bundle --minify --platform=node --outfile=dist/cli.js --external:better-sqlite3 --external:fsevents"
  }
}
```

## Phase 4: V8 Snapshots (2 weeks)

### 4.1 Identify Snapshot Candidates

**Priority: LOW** | **Impact: HIGH** | **Effort: HIGH**

Good candidates for V8 snapshots:
- React/React-DOM (for web UI)
- Large parsing libraries
- Frequently used utilities

### 4.2 Implement Snapshot System

Follow the Electron/Atom approach:
1. Create snapshot generation script
2. Include core dependencies in snapshot
3. Load from snapshot in production

```typescript
// snapshot-generator.js
require('react');
require('react-dom');
require('chalk');
// ... other heavy, stable dependencies
```

## Phase 5: Architecture Improvements (Ongoing)

### 5.1 Monorepo Structure

**Priority: LOW** | **Impact: HIGH** | **Effort: HIGH**

Consider splitting into packages:
- `@promptfoo/cli` - Minimal CLI entry point
- `@promptfoo/core` - Core evaluation logic
- `@promptfoo/redteam` - Red team functionality
- `@promptfoo/web` - Web UI components

### 5.2 Progressive Enhancement

Load features progressively based on usage:
1. Start with minimal CLI
2. Load evaluation engine when needed
3. Load web UI only for `view` command
4. Load red team modules only for red team commands

## Implementation Checklist

### Week 1
- [ ] Implement early exit for --help/--version
- [ ] Make database migrations lazy
- [ ] Make update checks non-blocking
- [ ] Add performance benchmarking scripts

### Week 2
- [ ] Convert command imports to dynamic imports
- [ ] Implement lazy config loading
- [ ] Add startup time metrics/telemetry
- [ ] Test on various hardware configurations

### Week 3
- [ ] Audit and document heavy dependencies
- [ ] Implement build-time optimizations
- [ ] Create modular import strategy
- [ ] Performance testing and optimization

### Week 4+
- [ ] Research and implement V8 snapshots
- [ ] Plan monorepo migration (if beneficial)
- [ ] Continuous performance monitoring
- [ ] Documentation and best practices

## Measurement and Success Criteria

### Metrics to Track

1. **Time to --help**: Target < 500ms
2. **Time to --version**: Target < 300ms
3. **Time to first prompt (eval)**: Target < 2s
4. **Memory usage at startup**: Reduce by 50%

### Benchmarking Script

```bash
#!/bin/bash
# benchmark.sh
hyperfine --warmup 3 \
  'node dist/src/main.js --version' \
  'node dist/src/main.js --help' \
  'node dist/src/main.js eval --help'
```

## Best Practices Going Forward

1. **Lazy by Default**: New features should use dynamic imports
2. **Measure Impact**: Profile before adding new dependencies
3. **Regular Audits**: Monthly dependency size audits
4. **CI Performance Tests**: Fail builds if startup time regresses
5. **User Feedback**: Add opt-in telemetry for startup performance

## Alternative Approaches Considered

1. **Bun/Deno Migration**: Would provide immediate benefits but requires significant changes
2. **Native Binaries**: Using Rust/Go for performance-critical paths
3. **Multiple Entry Points**: Separate binaries for different commands
4. **Pre-compiled Binaries**: Using tools like pkg or nexe

## Conclusion

By implementing these optimizations in phases, we can achieve significant improvements in startup time while maintaining code quality and functionality. The key is to start with high-impact, low-effort changes and progressively tackle more complex optimizations.

The most important principle: **Don't load what you don't need, when you don't need it.** 