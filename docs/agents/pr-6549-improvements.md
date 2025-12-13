# PR #6549 Improvement Plan

## Overview

This document outlines specific improvements for the "ability to change plugin for strategy test case generation" PR.

## Critical Bug Fixes

### 1. Fix Plugin Configuration Loss

**Problem**: When switching plugins via `handleRegenerate(newPluginId)`, the plugin config is lost:

```typescript
// Current (broken)
const targetPlugin = newPluginId
  ? { id: newPluginId as Plugin, config: {}, isStatic: true }
  : plugin!;
```

**Solution**: Look up plugin config from `redTeamConfig.plugins` in the provider:

```typescript
const handleRegenerate = useCallback(
  (newPluginId?: string) => {
    if (!newPluginId || newPluginId === plugin?.id) {
      handleStart(plugin!, strategy!);
      return;
    }

    const pluginFromConfig = redTeamConfig.plugins?.find(
      (p) => (typeof p === 'string' ? p === newPluginId : p.id === newPluginId)
    );
    const pluginConfig =
      typeof pluginFromConfig === 'object' ? pluginFromConfig.config ?? {} : {};

    handleStart(
      { id: newPluginId as Plugin, config: pluginConfig, isStatic: false },
      strategy!
    );
  },
  [handleStart, plugin, strategy, redTeamConfig.plugins],
);
```

### 2. Fix `isStatic` Value

**Problem**: `isStatic: true` is hardcoded, but plugins from user config should be `isStatic: false`.

**Solution**: Set `isStatic: false` since we're selecting from `availablePlugins` (user's configured plugins).

## UX Improvements

### 3. Auto-Regenerate on Plugin Selection

**Problem**: Current two-step flow creates friction:
1. Click chip → Open popover
2. Select plugin → Popover closes
3. Click "Regenerate" button

**Solution**: Call `onRegenerate(newValue)` directly in the Autocomplete's `onChange`. This:
- Reduces clicks from 3 to 2
- Provides immediate feedback
- Matches user expectation (selecting = applying)

### 4. Remove Unnecessary State

**Problem**: `selectedPlugin` state + `useEffect` sync is an anti-pattern that can cause state drift.

**Solution**: Since we auto-regenerate on selection, remove:
- `selectedPlugin` state
- `useEffect` that syncs with `pluginName`
- Color change logic for "pending" state

### 5. Add Visual Affordance for Interactivity

**Problem**: Chip doesn't visually indicate it's clickable until hover.

**Solution**: Add a dropdown icon to the chip:

```tsx
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

<Chip
  label={`Plugin: ${pluginDisplayName}`}
  onClick={...}
  deleteIcon={<ArrowDropDownIcon />}
  onDelete={(e) => setPluginPopoverAnchor(e.currentTarget)}
/>
```

Or use a custom icon in the label itself for cleaner appearance.

## Implementation Checklist

- [ ] Fix plugin config lookup in `handleRegenerate`
- [ ] Set correct `isStatic: false` for config-based plugins
- [ ] Auto-regenerate on plugin selection in Autocomplete
- [ ] Remove `selectedPlugin` state and sync effect
- [ ] Add dropdown icon to plugin chip
- [ ] Clean up unused imports and code
- [ ] Add test coverage for plugin switching

## Files to Modify

1. `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx`
   - Fix `handleRegenerate` to look up plugin config
   - Pass `redTeamConfig.plugins` dependency

2. `src/app/src/pages/redteam/setup/components/TestCaseDialog.tsx`
   - Auto-regenerate on selection
   - Remove `selectedPlugin` state and sync effect
   - Add dropdown icon to chip
   - Simplify component

## Testing Considerations

- Test switching to a plugin with custom config (e.g., policy plugin with policy text)
- Test switching back to original plugin
- Test with no plugins configured (edge case)
- Test that regeneration actually uses the new plugin
