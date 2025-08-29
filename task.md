# Task: Fix commandLineOptions.envPath Configuration Issue (#5412)

## Problem Summary

The `commandLineOptions.envPath` configuration option in promptfoo YAML config files is not properly processed, causing environment variables to not be loaded when specified via config file rather than command line flag.

**Expected Behavior:**

```yaml
commandLineOptions:
  envPath: ../../.env.local
```

Should load environment variables from the specified path.

**Actual Behavior:**
Environment variables are only loaded when using `--env-path` command line flag.

## Root Cause Analysis

### Issue Breakdown

1. **Timing Issue**: `setupEnv(cmdObj.envPath)` is called at `src/commands/eval.ts:104` **BEFORE** configuration loading
2. **Config Loading**: Configuration is loaded later at `src/commands/eval.ts:157` via `resolveConfigs()`
3. **Data Collection**: `commandLineOptions.envPath` from config files **IS** collected in `combineConfigs()` and aggregated at `src/util/config/load.ts:453-456`
4. **Missing Integration**: `commandLineOptions` are explicitly omitted from the returned config object (`src/util/config/load.ts:546`: `Omit<UnifiedConfig, 'evaluateOptions' | 'commandLineOptions'>`)
5. **No Feedback Loop**: There's no mechanism to apply the `commandLineOptions.envPath` from config files back to `cmdObj.envPath` before the `setupEnv()` call

### Code References

- `src/commands/eval.ts:104` - Early setupEnv call
- `src/commands/eval.ts:157` - Config loading
- `src/util/config/load.ts:453-456` - commandLineOptions collection
- `src/util/config/load.ts:546` - commandLineOptions omission
- `src/util/index.ts:323` - setupEnv implementation

## Solution Approaches & Tradeoffs

### Option 1: Move setupEnv() After Config Loading

**Pros:**

- Simple and direct fix
- Minimal code changes
- Clear flow: config loading → environment setup

**Cons:**

- **HIGH RISK**: Changes timing of environment setup - may break existing behavior where environment variables are expected during config loading
- Config loading itself might depend on environment variables
- Could affect downstream systems expecting early env vars

**Risk Level:** ❌ High (timing changes can have cascading effects)

### Option 2: Two-Phase Environment Loading ⭐ **RECOMMENDED**

**Pros:**

- ✅ Preserves existing behavior for command line args
- ✅ Additive approach - minimal risk of breaking functionality
- ✅ Clear separation of concerns
- ✅ Handles both CLI and config-based env paths

**Cons:**

- Need to handle override logic (CLI vs config priority)
- Two setupEnv calls (manageable complexity)

**Risk Level:** 🟡 Low-Medium (additive changes, preserves existing behavior)

### Option 3: Pre-parse Config for Environment Setup

**Pros:**

- Maintains current timing
- Surgical approach

**Cons:**

- **Complex implementation** - config files parsed twice
- **Performance impact** of double parsing
- Need to handle all config formats and edge cases
- Higher maintenance burden

**Risk Level:** 🟡 Medium (complexity and performance concerns)

### Option 4: Return commandLineOptions from resolveConfigs

**Pros:**

- Clean architecture
- Makes all command line options available

**Cons:**

- **Breaking change** - requires updating function signature
- May affect other callers of resolveConfigs
- Still has timing issue

**Risk Level:** 🔴 Medium-High (breaking changes to shared functions)

### Option 5: Dedicated Environment Configuration Phase

**Pros:**

- Most comprehensive solution

**Cons:**

- **Largest refactor** with highest risk
- May be overkill for this specific issue
- Complex testing requirements

**Risk Level:** ❌ High (major architectural changes)

## Recommended Solution: Option 2 - Two-Phase Environment Loading

### Implementation Plan

#### Phase 1: Modify resolveConfigs to Return commandLineOptions

```typescript
// In src/util/config/load.ts
export async function resolveConfigs(
  cmdObj: Partial<CommandLineOptions>,
  _defaultConfig: Partial<UnifiedConfig>,
  type?: 'DatasetGeneration' | 'AssertionGeneration',
): Promise<{
  testSuite: TestSuite;
  config: Partial<UnifiedConfig>;
  basePath: string;
  commandLineOptions: Record<string, any>; // ADD THIS
}> {
  // ... existing code ...

  return {
    config,
    testSuite: { tests, scenarios },
    basePath,
    commandLineOptions: fileConfig.commandLineOptions || {}, // ADD THIS
  };
}
```

#### Phase 2: Update eval.ts to Handle Config-based Environment Loading

```typescript
// In src/commands/eval.ts

// Line 104: Keep existing early setupEnv call
setupEnv(cmdObj.envPath);

// Line 157: Update resolveConfigs call and add post-config env setup
const {
  config,
  testSuite,
  basePath: _basePath,
  commandLineOptions,
} = await resolveConfigs(cmdObj, defaultConfig);

// NEW: Handle config-based environment loading
if (commandLineOptions?.envPath && commandLineOptions.envPath !== cmdObj.envPath) {
  logger.debug(`Loading additional environment from config: ${commandLineOptions.envPath}`);
  setupEnv(commandLineOptions.envPath);
}
```

#### Phase 3: Update Type Definitions

```typescript
// Remove commandLineOptions from Omit type in load.ts:546
const config: Omit<UnifiedConfig, 'evaluateOptions'> = {
  // ... existing config properties
};
```

### Implementation Steps

1. **Update resolveConfigs function signature and return value**
   - Add `commandLineOptions` to return type
   - Include `commandLineOptions` from `fileConfig` in return object
   - Update type definition to remove `commandLineOptions` from Omit

2. **Update eval.ts to handle two-phase environment loading**
   - Keep existing `setupEnv(cmdObj.envPath)` call at line 104
   - Update `resolveConfigs` destructuring to include `commandLineOptions`
   - Add conditional second `setupEnv()` call for config-based `envPath`
   - Add appropriate logging

3. **Handle priority logic**
   - Command line args take precedence over config file options
   - Only call second `setupEnv()` if config `envPath` differs from CLI `envPath`
   - Log when loading additional environment from config

4. **Update other callers of resolveConfigs**
   - Search for all usages of `resolveConfigs` and update destructuring
   - Ensure no breaking changes to existing functionality

### Testing Strategy

#### Unit Tests

```typescript
// Test cases to add
describe('Environment Loading', () => {
  test('CLI envPath takes precedence over config envPath', () => {
    // Test with both CLI --env-path and config envPath set
  });

  test('Config envPath is used when CLI envPath is not set', () => {
    // Test with only config envPath set
  });

  test('Multiple config files with different envPaths', () => {
    // Test config merging behavior
  });

  test('Environment variables are loaded from config-specified path', () => {
    // Create test .env file and config, verify vars are loaded
  });
});
```

#### Integration Tests

```bash
# Test scenarios to verify
1. CLI flag only: `promptfoo eval --env-path .env.test`
2. Config only: YAML with `commandLineOptions: envPath: .env.test`
3. Both specified: CLI should take precedence
4. Multiple configs: Test merge behavior
5. Invalid paths: Ensure graceful error handling
```

### Risk Assessment

**Low Risk Areas:**

- ✅ Additive changes preserve existing behavior
- ✅ CLI functionality remains unchanged
- ✅ No breaking changes to public APIs

**Medium Risk Areas:**

- 🟡 Function signature change for `resolveConfigs` (internal function)
- 🟡 Need to update all callers of `resolveConfigs`
- 🟡 Override logic between CLI and config options

**Mitigation Strategies:**

- Thorough testing of both CLI and config-based environment loading
- Careful review of all `resolveConfigs` callers
- Clear documentation of precedence rules
- Gradual rollout with feature flag if needed

## Alternative Quick Fix (Lower Risk)

If the full solution is too complex for immediate deployment, consider this minimal fix:

### Quick Fix: Extract and Apply envPath Before setupEnv

```typescript
// In src/commands/eval.ts, before line 104:

// Pre-extract envPath from config if no CLI envPath provided
let envPath = cmdObj.envPath;
if (!envPath && cmdObj.config) {
  try {
    const configPaths = Array.isArray(cmdObj.config) ? cmdObj.config : [cmdObj.config];
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const rawConfig = await readConfig(configPath);
        if (rawConfig.commandLineOptions?.envPath) {
          envPath = rawConfig.commandLineOptions.envPath;
          logger.debug(`Using envPath from config: ${envPath}`);
          break; // Use first found envPath
        }
      }
    }
  } catch (error) {
    logger.debug('Failed to pre-extract envPath from config:', error.message);
  }
}

setupEnv(envPath);
```

**Pros of Quick Fix:**

- ✅ Minimal changes
- ✅ Preserves all existing behavior
- ✅ No function signature changes
- ✅ Lower risk

**Cons of Quick Fix:**

- 🟡 Configs parsed twice (performance impact)
- 🟡 Less clean architecture
- 🟡 Doesn't handle complex config merging scenarios

## Recommended Approach

**For immediate fix:** Use the Quick Fix approach for v0.118.1 patch release
**For proper solution:** Implement Option 2 (Two-Phase Environment Loading) in next minor release

This provides both immediate resolution for users and a proper long-term architectural solution.
