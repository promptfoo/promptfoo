# Dataset Plugin Merge Conflict Resolution Plan

## Overview

We have 36 merge conflicts after merging main into the dataset plugin namespacing branch. The conflicts are primarily in:

1. Plugin files (adding dataset: prefix)
2. Test files (updating plugin names in tests)
3. Command files (handling plugin discovery and loading)
4. Constants files (plugin definitions)

## Conflict Resolution Strategy

### 1. Plugin Constants (`src/redteam/constants/plugins.ts`)

- Keep both the new dataset: prefixed names AND legacy names
- Ensure LEGACY_DATASET_PLUGINS and DATASET_PLUGINS arrays are properly maintained
- Update ALL_PLUGINS to include both

### 2. Individual Plugin Files

For each dataset plugin file (e.g., `beavertails.ts`, `pliny.ts`, etc.):

- Update the plugin ID to use `dataset:` prefix
- Keep the rest of the plugin logic unchanged
- Ensure the plugin exports the correct ID

### 3. Plugin Index (`src/redteam/plugins/index.ts`)

- Update plugin loading to handle both legacy and new names
- Implement the normalizePluginName function
- Ensure getPlugins() returns plugins with new names but accepts legacy names

### 4. Command Files

- Update generate.ts, init.ts, and plugins.ts to handle both formats
- Add deprecation warnings for legacy names (commented out for now)

### 5. Test Files

- Update test files to use the new dataset: prefix
- Add tests for backwards compatibility
- Ensure both formats work in tests

## Resolution Order

1. **Core Infrastructure**
   - src/redteam/constants/plugins.ts ✓
   - src/redteam/plugins/index.ts
   - src/redteam/index.ts

2. **Plugin Files** (update each to use dataset: prefix)
   - src/redteam/plugins/aegis.ts
   - src/redteam/plugins/beavertails.ts
   - src/redteam/plugins/cyberseceval.ts
   - src/redteam/plugins/donotanswer.ts
   - src/redteam/plugins/harmbench.ts
   - src/redteam/plugins/pliny.ts
   - src/redteam/plugins/toxicChat.ts
   - src/redteam/plugins/unsafebench.ts
   - src/redteam/plugins/xstest.ts

3. **Command Files**
   - src/redteam/commands/generate.ts
   - src/redteam/commands/init.ts
   - src/redteam/commands/plugins.ts

4. **Test Files**
   - Update all plugin test files
   - Add backwards compatibility tests

5. **Other Files**
   - src/redteam/util.ts
   - src/util/cloud.ts
   - src/validators/redteam.ts

## Key Principles

1. **No Breaking Changes**: All existing configurations must continue to work
2. **Internal Consistency**: Use new format internally, translate at boundaries
3. **Clear Migration Path**: Document how to update to new format
4. **Test Coverage**: Both formats must be tested

## Implementation Notes

### Plugin Name Normalization

```typescript
export function normalizePluginName(pluginName: string): string {
  // Convert legacy names to new format
  if (LEGACY_DATASET_PLUGINS.includes(pluginName as LegacyDatasetPlugin)) {
    return `dataset:${pluginName}`;
  }
  return pluginName;
}
```

### Backwards Compatibility in Plugin Loading

```typescript
// In getPlugins()
const requestedName = normalizePluginName(pluginName);
// Load plugin using normalized name
```

### Test Both Formats

```typescript
// Test legacy format
expect(await getPlugin('beavertails')).toBeDefined();
// Test new format
expect(await getPlugin('dataset:beavertails')).toBeDefined();
// Both should return the same plugin
```
