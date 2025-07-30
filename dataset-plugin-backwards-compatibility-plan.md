# Dataset Plugin Backwards Compatibility Plan

## Overview
We are prefixing dataset plugins with `dataset:` to clearly distinguish them from other plugin types. This change needs to be fully backwards compatible so existing configurations and scripts continue to work.

## Current State
- Dataset plugins are being prefixed with `dataset:` (e.g., `beavertails` → `dataset:beavertails`)
- Legacy names are defined in `LEGACY_DATASET_PLUGINS` constant
- Both new and legacy names are included in `ALL_PLUGINS`

## Backwards Compatibility Requirements

### 1. Plugin Resolution
- When users specify a legacy name (e.g., `beavertails`), it should automatically resolve to the new name (`dataset:beavertails`)
- This mapping should happen transparently without user intervention

### 2. Configuration Files
- Existing configuration files using legacy names should continue to work
- New configurations should use the prefixed names
- Documentation should recommend the new format

### 3. CLI Commands
- CLI commands accepting plugin names should accept both formats
- Help text should show the new format but mention legacy names are supported

### 4. API Compatibility
- Any APIs that accept plugin names should handle both formats
- Response data should prefer the new format but may need to support legacy format for backwards compatibility

## Implementation Plan

### Step 1: Create Plugin Name Mapping
Create a mapping function that converts legacy names to new names:
```typescript
export function normalizePluginName(pluginName: string): string {
  if (LEGACY_DATASET_PLUGINS.includes(pluginName as LegacyDatasetPlugin)) {
    return `dataset:${pluginName}`;
  }
  return pluginName;
}
```

### Step 2: Update Plugin Loading
- Modify plugin loading code to use the normalization function
- Ensure all plugin references go through this normalization

### Step 3: Update Plugin Discovery
- Update `getPlugins()` and similar functions to handle both formats
- Ensure plugin metadata uses the new format internally

### Step 4: Update Tests
- Add tests for backwards compatibility
- Ensure all existing tests pass with the new naming
- Add new tests that verify both formats work

### Step 5: Update Documentation
- Update docs to show new format
- Add migration guide for users
- Keep examples of legacy format with deprecation notice

### Step 6: Add Deprecation Warnings (Future)
- In a future version, add console warnings when legacy names are used
- Provide clear migration path

## Files to Update

### Core Files
1. `src/redteam/plugins/index.ts` - Plugin loading and discovery
2. `src/redteam/commands/plugins.ts` - CLI plugin commands
3. `src/commands/generate/dataset.ts` - Dataset generation
4. `src/redteam/constants/plugins.ts` - Plugin constants (already updated)

### Test Files
1. `test/redteam/plugins/index.test.ts` - Plugin loading tests
2. `test/redteam/commands/plugins.test.ts` - CLI tests
3. All individual plugin test files

### Documentation
1. Plugin documentation
2. Migration guide
3. CLI help text

## Testing Strategy

### Unit Tests
- Test normalization function with all legacy names
- Test plugin loading with both formats
- Test CLI commands with both formats

### Integration Tests
- Test full evaluation flow with legacy plugin names
- Test configuration parsing with mixed formats
- Test API endpoints with both formats

### Regression Tests
- Run all existing tests to ensure nothing breaks
- Test with real-world configuration files

## Rollout Plan

1. Implement backwards compatibility layer
2. Update all tests
3. Run full test suite
4. Update documentation
5. Create migration guide
6. Deploy with clear communication about the change

## Success Criteria

- All existing configurations continue to work without modification
- New configurations can use the cleaner `dataset:` prefix
- Clear migration path for users
- No breaking changes for existing users
- All tests pass