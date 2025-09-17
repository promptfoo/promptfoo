# Python Extension Caching Bug - Task Scope

## Problem Statement

When users move their promptfoo project to a new folder, Python extensions fail with permission errors on temporary files, even though the extension worked previously. The error specifically shows:

```
[pythonUtils.js:168] Error running Python script: EACCES: permission denied, open '/var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/promptfoo-python-input-json-1758117675565-14497df623c8b.json'
```

The issue does not occur when the Python extension is removed from the config.

## Root Cause Analysis

### Caching Strategy Issue

The problem stems from a module-level caching strategy in `src/python/pythonUtils.ts:15-21`:

```typescript
export const state: {
  cachedPythonPath: string | null;
  validationPromise: Promise<string> | null;
} = {
  cachedPythonPath: null,
  validationPromise: null,
};
```

### The Breaking Scenario

1. **Initial run**: Python path validation occurs and gets cached with old directory context
2. **Directory change**: User moves project to new folder
3. **Cached path persists**: Module-level cache retains old context
4. **Fresh temp directory resolution**: `os.tmpdir()` resolves based on current environment, potentially different from cached context
5. **Permission mismatch**: Python process tries to access temp files using potentially stale environment variables

### Evidence

- Error shows temp directory: `/var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/`
- Current system temp directory: `/var/folders/r6/pcx8hf4x3h7b3gmjrbnq_8sm0000gn/T/`
- The mismatch indicates cached process context vs current environment

## Impact

- **User Experience**: Breaks workflow when moving projects
- **Scope**: Affects all Python extensions (`file://path/to/script.py:function`)
- **Workaround**: Removing extensions temporarily resolves the issue

## Proposed Solutions

### Option 1: Add Cache Invalidation (Recommended)

Add cache clearing functionality:

```typescript
// Add to pythonUtils.ts
export function clearPythonCache(): void {
  state.cachedPythonPath = null;
  state.validationPromise = null;
}
```

Call this when:

- Working directory changes detected
- Temp directory access fails
- User explicitly requests cache clear

### Option 2: Context-Aware Caching

Modify cache to include directory context:

```typescript
export const state: {
  cachedPythonPath: string | null;
  validationPromise: Promise<string> | null;
  cacheContext: string | null; // Add working directory context
} = {
  cachedPythonPath: null,
  validationPromise: null,
  cacheContext: null,
};
```

### Option 3: Temp Directory Validation

Add validation before temp file operations:

```typescript
// In runPython function, before fs.writeFileSync
try {
  // Test temp directory access
  const testPath = path.join(os.tmpdir(), `promptfoo-test-${Date.now()}.tmp`);
  fs.writeFileSync(testPath, '');
  fs.unlinkSync(testPath);
} catch (error) {
  // Clear cache and retry with fresh Python path resolution
  clearPythonCache();
  pythonPath = await validatePythonPath(pythonPath, typeof customPath === 'string');
}
```

## Files to Modify

1. **Primary**: `src/python/pythonUtils.ts`
   - Add cache invalidation function
   - Add context awareness to caching
   - Add temp directory validation

2. **Secondary**: Consider where to call cache invalidation
   - CLI startup
   - Working directory change detection
   - Error recovery paths

## Testing Strategy

1. **Reproduction Test**: Create test that moves directories and triggers the issue
2. **Cache Invalidation Test**: Verify cache clears appropriately
3. **Integration Test**: Test full Python extension workflow after directory changes
4. **Regression Test**: Ensure existing functionality still works

## Acceptance Criteria

- [ ] Python extensions work after moving project directories
- [ ] Cache invalidation mechanism in place
- [ ] No regression in existing Python extension functionality
- [ ] Clear error messages if temp directory issues persist
- [ ] Documentation updated with troubleshooting steps

## Immediate User Workarounds

Until fixed, users can:

1. **Kill processes**: `pkill -f node && npx promptfoo@0.117.11 redteam eval -c config.yaml`
2. **Set explicit temp**: `TMPDIR=/tmp npx promptfoo@0.117.11 redteam eval -c config.yaml`
3. **Temporarily disable**: Comment out Python extensions in config

## Priority

**High** - Breaks core functionality for users who move projects, which is a common workflow.
