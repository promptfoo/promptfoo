# Plugins State Management Refactor Implementation Plan

## Overview

Refactor `Plugins.tsx` to remove interstitial state management between `PluginsTab.tsx` and the Zustand store. The current implementation maintains duplicate local state (`selectedPlugins`, `pluginConfig`, `hasUserInteracted`) with bi-directional sync effects. This refactor will derive state directly from the store and update the store directly on user interactions.

## Current State Analysis

### Three-Layer Architecture (to be simplified)

1. **Global State**: Zustand store (`useRedTeamConfig.ts`) - source of truth
2. **Local State**: `Plugins.tsx` maintains `selectedPlugins`, `pluginConfig`, `hasUserInteracted`
3. **Props**: `PluginsTab.tsx` receives state via props

### Key Files

- `src/app/src/pages/redteam/setup/components/Plugins.tsx` - Parent component with local state
- `src/app/src/pages/redteam/setup/components/PluginsTab.tsx` - Child component receiving props
- `src/app/src/pages/redteam/setup/hooks/useRedTeamConfig.ts` - Zustand store

### Current State Variables to Remove (Plugins.tsx)

- `const [selectedPlugins, setSelectedPlugins]` - lines 112-118
- `const [hasUserInteracted, setHasUserInteracted]` - line 135
- `const [pluginConfig, setPluginConfig]` - lines 136-144

### Current Sync Effects to Remove (Plugins.tsx)

- Effect 1 (lines 152-168): Syncs store → local state when `!hasUserInteracted`
- Effect 2 (lines 171-199): Syncs local state → store when `hasUserInteracted`

### Store Protection Already Exists

The `updatePlugins` method (useRedTeamConfig.ts:272-311) already:

- Merges new plugin configs with existing configs
- Compares output vs current state to prevent infinite loops
- Only triggers updates when state actually changed

## Desired End State

After this refactor:

1. `Plugins.tsx` derives `selectedPlugins` and `pluginConfig` from `config.plugins` using `useMemo`
2. All plugin mutations go directly to the Zustand store
3. No local state synchronization effects
4. `PluginsTab` has a new `setSelectedPlugins` prop for efficient bulk operations
5. `onUserInteraction` prop is removed from `PluginsTab`

### How to Verify

1. All tests in `PluginsTab.test.tsx` pass
2. Preset selection works (plugins are set correctly in store)
3. Individual plugin toggle works (checkbox toggles update store)
4. Select All/None buttons work correctly
5. Clear All button works correctly
6. Plugin configs (e.g., for `indirect-prompt-injection`) are preserved when toggling

## What We're NOT Doing

- Changing the Zustand store implementation
- Modifying `CustomIntentsTab` or `CustomPoliciesTab`
- Changing how policy/intent plugins are handled
- Refactoring the `PluginConfigDialog` component
- Changing test structure or test helpers

## Implementation Approach

The refactoring follows these principles:

1. **Remove duplicate state** - No local state that mirrors the store
2. **Derive, don't store** - Use `useMemo` to compute `selectedPlugins` and `pluginConfig` from `config.plugins`
3. **Direct store updates** - All mutations go straight to `updatePlugins`
4. **Efficient bulk operations** - Add `setSelectedPlugins` for presets and bulk selection

---

## Phase 1: Refactor `Plugins.tsx`

### Overview

Remove local state and sync effects, replace with derived values and direct store updates.

### Changes Required:

#### 1. Remove Local State Variables

**File**: `src/app/src/pages/redteam/setup/components/Plugins.tsx`

**Remove lines 112-118** (selectedPlugins state):

```tsx
// REMOVE THIS:
const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
  return new Set(
    config.plugins
      .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
      .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
  );
});
```

**Remove line 135** (hasUserInteracted state):

```tsx
// REMOVE THIS:
const [hasUserInteracted, setHasUserInteracted] = useState(false);
```

**Remove lines 136-144** (pluginConfig state):

```tsx
// REMOVE THIS:
const [pluginConfig, setPluginConfig] = useState<LocalPluginConfig>(() => {
  const initialConfig: LocalPluginConfig = {};
  config.plugins.forEach((plugin) => {
    if (typeof plugin === 'object' && plugin.config) {
      initialConfig[plugin.id] = plugin.config;
    }
  });
  return initialConfig;
});
```

#### 2. Add Derived Values

**Add after the store hook calls (after line 108):**

```tsx
// Derive selectedPlugins from config.plugins
const selectedPlugins = useMemo(() => {
  return new Set(
    config.plugins
      .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
      .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
  );
}, [config.plugins]);

// Derive pluginConfig from config.plugins
const pluginConfig = useMemo(() => {
  const configs: LocalPluginConfig = {};
  config.plugins.forEach((plugin) => {
    if (typeof plugin === 'object' && plugin.config) {
      configs[plugin.id] = plugin.config;
    }
  });
  return configs;
}, [config.plugins]);
```

#### 3. Remove Sync Effects

**Remove lines 152-168** (Effect 1 - config → local sync):

```tsx
// REMOVE THIS ENTIRE EFFECT:
useEffect(() => {
  if (!hasUserInteracted) {
    const configPlugins = new Set(
      config.plugins
        .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
        .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
    );
    if (
      configPlugins.size !== selectedPlugins.size ||
      !Array.from(configPlugins).every((plugin) => selectedPlugins.has(plugin))
    ) {
      setSelectedPlugins(configPlugins);
    }
  }
}, [config.plugins, hasUserInteracted, selectedPlugins]);
```

**Remove lines 171-199** (Effect 2 - local → config sync):

```tsx
// REMOVE THIS ENTIRE EFFECT:
useEffect(() => {
  if (hasUserInteracted) {
    const policyPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy');
    const intentPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'intent');
    const regularPlugins = Array.from(selectedPlugins).map((plugin) => {
      const existingConfig = pluginConfig[plugin];
      if (existingConfig && Object.keys(existingConfig).length > 0) {
        return {
          id: plugin,
          config: existingConfig,
        };
      }
      return plugin;
    });
    const allPlugins = [...regularPlugins, ...policyPlugins, ...intentPlugins];
    updatePlugins(allPlugins as Array<string | { id: string; config: any }>);
  }
}, [selectedPlugins, pluginConfig, hasUserInteracted, config.plugins, updatePlugins]);
```

#### 4. Refactor `handlePluginToggle`

**Replace the current implementation (lines 201-236) with:**

```tsx
const handlePluginToggle = useCallback(
  (plugin: Plugin) => {
    // Preserve policy and intent plugins
    const policyPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy');
    const intentPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'intent');

    // Get current regular plugins (excluding policy/intent)
    const currentRegularPlugins = config.plugins.filter((p) => {
      const id = typeof p === 'string' ? p : p.id;
      return id !== 'policy' && id !== 'intent';
    });

    const isCurrentlySelected = selectedPlugins.has(plugin);

    let newRegularPlugins: Config['plugins'];

    if (isCurrentlySelected) {
      // Remove the plugin
      newRegularPlugins = currentRegularPlugins.filter((p) => {
        const id = typeof p === 'string' ? p : p.id;
        return id !== plugin;
      });
    } else {
      // Add the plugin
      addPlugin(plugin); // Add to recently used
      newRegularPlugins = [...currentRegularPlugins, plugin];
    }

    // Combine all plugins and update store
    const allPlugins = [...newRegularPlugins, ...policyPlugins, ...intentPlugins];
    updatePlugins(allPlugins);
  },
  [config.plugins, selectedPlugins, updatePlugins, addPlugin],
);
```

#### 5. Add `setSelectedPlugins` Handler for Bulk Operations

**Add after `handlePluginToggle`:**

```tsx
const setSelectedPlugins = useCallback(
  (newSelectedPlugins: Set<Plugin>) => {
    // Preserve policy and intent plugins
    const policyPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy');
    const intentPlugins = config.plugins.filter((p) => typeof p === 'object' && p.id === 'intent');

    // Create new plugins array, preserving configs from existing plugins
    const newPluginsArray: Config['plugins'] = Array.from(newSelectedPlugins).map((plugin) => {
      const existing = config.plugins.find((p) => (typeof p === 'string' ? p : p.id) === plugin);
      if (existing && typeof existing === 'object' && existing.config) {
        return existing; // Preserve existing config
      }
      return plugin;
    });

    // Combine all plugins and update store
    const allPlugins = [...newPluginsArray, ...policyPlugins, ...intentPlugins];
    updatePlugins(allPlugins);
  },
  [config.plugins, updatePlugins],
);
```

#### 6. Refactor `updatePluginConfig`

**Replace the current implementation (lines 238-257) with:**

```tsx
const updatePluginConfig = useCallback(
  (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => {
    // Build new plugins array with updated config
    const newPlugins = config.plugins.map((p) => {
      const id = typeof p === 'string' ? p : p.id;
      if (id === plugin) {
        const existingConfig = typeof p === 'object' ? p.config || {} : {};
        return {
          id: plugin,
          config: { ...existingConfig, ...newConfig },
        };
      }
      return p;
    });

    updatePlugins(newPlugins);
  },
  [config.plugins, updatePlugins],
);
```

#### 7. Update PluginsTab Props

**Update the PluginsTab component call (around line 431):**

```tsx
<PluginsTab
  selectedPlugins={selectedPlugins}
  handlePluginToggle={handlePluginToggle}
  setSelectedPlugins={setSelectedPlugins} // NEW PROP
  pluginConfig={pluginConfig}
  updatePluginConfig={updatePluginConfig}
  recentlyUsedPlugins={recentlyUsedSnapshot}
  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
/>
```

**Remove** the `onUserInteraction` prop.

### Success Criteria:

#### Automated Verification:

- [x] TypeScript compilation passes: `npm run tsc` from `src/app`
- [x] Linting passes: `npm run lint`
- [x] All PluginsTab tests pass: `npm run test:app -- src/pages/redteam/setup/components/PluginsTab.test.tsx`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Update `PluginsTab.tsx`

### Overview

Update the PluginsTab component to use the new `setSelectedPlugins` prop and remove `onUserInteraction`.

### Changes Required:

#### 1. Update Props Interface

**File**: `src/app/src/pages/redteam/setup/components/PluginsTab.tsx`

**Replace lines 64-72:**

```tsx
export interface PluginsTabProps {
  selectedPlugins: Set<Plugin>;
  handlePluginToggle: (plugin: Plugin) => void;
  setSelectedPlugins: (plugins: Set<Plugin>) => void; // NEW
  pluginConfig: LocalPluginConfig;
  updatePluginConfig: (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => void;
  recentlyUsedPlugins: Plugin[];
  isRemoteGenerationDisabled: boolean;
  // REMOVED: onUserInteraction
}
```

#### 2. Update Component Parameters

**Update lines 74-82:**

```tsx
export default function PluginsTab({
  selectedPlugins,
  handlePluginToggle,
  setSelectedPlugins,  // NEW
  pluginConfig,
  updatePluginConfig,
  recentlyUsedPlugins,
  isRemoteGenerationDisabled,
}: PluginsTabProps): React.ReactElement {
```

#### 3. Refactor `handlePresetSelect`

**Replace the current implementation (around lines 367-392):**

```tsx
const handlePresetSelect = useCallback(
  (preset: { name: string; plugins: Set<Plugin> | ReadonlySet<Plugin> }) => {
    recordEvent('feature_used', {
      feature: 'redteam_config_plugins_preset_selected',
      preset: preset.name,
    });
    if (preset.name === 'Custom') {
      setIsCustomMode(true);
    } else {
      // Use setSelectedPlugins for efficient bulk update
      setSelectedPlugins(new Set(preset.plugins as Set<Plugin>));
      setIsCustomMode(false);
    }
  },
  [recordEvent, setSelectedPlugins],
);
```

#### 4. Refactor "Select All" Button

**Replace lines 485-494:**

```tsx
onClick={() => {
  // Collect all filtered plugins and merge with existing selection
  const newSelected = new Set(selectedPlugins);
  filteredPlugins.forEach(({ plugin }) => {
    newSelected.add(plugin);
  });
  setSelectedPlugins(newSelected);
}}
```

#### 5. Refactor "Select None" Button

**Replace lines 499-508:**

```tsx
onClick={() => {
  // Remove only the filtered plugins from selection
  const filteredPluginIds = new Set(filteredPlugins.map((p) => p.plugin));
  const newSelected = new Set(
    [...selectedPlugins].filter((p) => !filteredPluginIds.has(p)),
  );
  setSelectedPlugins(newSelected);
}}
```

#### 6. Refactor "Clear All" Button

**Replace lines 816-820:**

```tsx
onClick={() => {
  setSelectedPlugins(new Set());
}}
```

### Success Criteria:

#### Automated Verification:

- [x] TypeScript compilation passes: `npm run tsc` from `src/app`
- [x] Linting passes: `npm run lint`
- [x] All PluginsTab tests pass: `npm run test:app -- src/pages/redteam/setup/components/PluginsTab.test.tsx`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Verify and Fix Tests

### Overview

Run the full test suite and fix any test failures. Tests should mostly pass since they test end-to-end behavior (user interaction → store state), not implementation details.

### Changes Required:

#### 1. Run Full Test Suite

```bash
cd src/app
npm run test -- src/pages/redteam/setup/components/PluginsTab.test.tsx
```

#### 2. Potential Test Adjustments

The tests should largely pass as-is because they:

- Verify store state after interactions (still works)
- Use `userEvent` to simulate clicks (still works)
- Don't mock the intermediate state management

However, if any tests reference `onUserInteraction` in expectations or setup, they will need updates.

**If needed, remove references to `onUserInteraction` in test mocks or assertions.**

### Success Criteria:

#### Automated Verification:

- [x] All 30+ tests in `PluginsTab.test.tsx` pass (44 tests passed)
- [x] No TypeScript errors
- [x] No linting errors

#### Manual Verification:

- [x] Start the dev server: `npm run dev:app`
- [x] Navigate to Red Team Setup → Plugins page
- [x] Select a preset (e.g., "Recommended") → verify plugins appear selected
- [x] Toggle individual plugins → verify selection updates
- [x] Use "Select all" → verify all visible plugins are selected
- [x] Use "Select none" → verify filtered plugins are deselected
- [x] Use "Clear All" in sidebar → verify all plugins are cleared
- [x] Select `indirect-prompt-injection`, configure it, then toggle other plugins → verify config is preserved
- [x] Refresh page → verify plugin selection persists (Zustand persistence)

**Implementation Note**: ✅ All automated and manual verification complete. Refactor is complete.

---

## Testing Strategy

### Unit Tests (Existing)

The existing test suite in `PluginsTab.test.tsx` covers:

- Component rendering
- Plugin search filtering
- Category filtering
- Selected plugins list display
- Preset selection → store update
- Plugin list item toggle → store update
- Select All/None → store update
- Clear All → store update

### Key Test Scenarios to Verify

1. **Preset Selection**: Clicking a preset card results in correct plugins in store
2. **Single Plugin Toggle**: Clicking checkbox adds/removes plugin from store
3. **Select All**: All filtered plugins added to store
4. **Select None**: All filtered plugins removed from store (preserving others)
5. **Clear All**: All plugins removed from store
6. **Config Preservation**: Plugin configs survive toggle operations

### Edge Cases

- Toggling a plugin that requires configuration
- Preserving policy/intent plugins during regular plugin operations
- Rapid toggling (React batching)

## Performance Considerations

### Improvements

- **Bulk operations** now update the store once instead of N times (N = number of plugins in operation)
- **No duplicate renders** from local state → store → local state sync cycle
- **Memoized derivation** prevents unnecessary recomputation

### Potential Concerns

- None expected; `useMemo` derivation is O(n) where n = number of plugins
- Store's `updatePlugins` already has JSON comparison optimization

## Migration Notes

- No data migration needed; store format unchanged
- Existing persisted configs will work without changes

## References

- Research document: `docs/research/2026-01-08-redteam-plugins-state-management.md`
- Test file: `src/app/src/pages/redteam/setup/components/PluginsTab.test.tsx`
- Zustand store: `src/app/src/pages/redteam/setup/hooks/useRedTeamConfig.ts`
