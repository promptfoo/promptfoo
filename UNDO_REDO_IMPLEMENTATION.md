# Undo/Redo Implementation for Eval Creator

## Overview

This implementation adds comprehensive undo/redo functionality to the eval creator interface, allowing users to navigate through their configuration changes with keyboard shortcuts and UI buttons.

## Features

### 1. History Tracking

- Tracks all configuration changes with descriptive labels
- Maintains a history of up to 50 changes to prevent memory issues
- Automatically describes what changed (e.g., "Changed prompts (2 → 3)")

### 2. Keyboard Shortcuts

- **Undo**: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
- **Redo**: Ctrl+Y or Ctrl+Shift+Z (Windows/Linux) or Cmd+Shift+Z (Mac)

### 3. UI Integration

- Undo/Redo buttons in the toolbar with tooltips
- Buttons show disabled state when no actions are available
- Tooltips display what will be undone/redone

### 4. Smart History Management

- History is cleared when resetting the configuration
- History is cleared when clearing saved data
- Prevents duplicate history entries for identical states
- Initializes history when loading saved configurations

## Implementation Details

### Files Created/Modified

1. **`src/app/src/stores/evalConfigWithHistory.ts`**
   - New Zustand store for managing history
   - Subscribes to evalConfig changes
   - Implements undo/redo logic with proper state management

2. **`src/app/src/pages/eval-creator/components/UndoRedoButtons.tsx`**
   - React component for undo/redo UI buttons
   - Handles keyboard shortcuts
   - Shows tooltips with action descriptions

3. **`src/app/src/pages/eval-creator/hooks/useHistoryInitialization.ts`**
   - Hook to initialize history when component mounts
   - Ensures proper history state on page load

4. **`src/app/src/pages/eval-creator/components/EvaluateTestSuiteCreator.tsx`**
   - Integrated UndoRedoButtons component
   - Added history initialization hook
   - Clear history on reset

5. **`src/app/src/pages/eval-creator/components/SavedDataManager.tsx`**
   - Clear history when clearing saved data

### Key Design Decisions

1. **Separate History Store**: History is managed in a separate Zustand store that subscribes to the main evalConfig store. This separation keeps concerns isolated and makes the implementation cleaner.

2. **Change Descriptions**: The system automatically generates human-readable descriptions of changes (e.g., "Changed prompts and providers") to show in tooltips.

3. **Prevention of Infinite Loops**: A flag (`isApplyingHistory`) prevents history tracking during undo/redo operations.

4. **Memory Management**: History is limited to 50 entries to prevent excessive memory usage.

5. **Deep Cloning**: Configuration states are deep cloned when stored in history to prevent mutation issues.

## Usage

### For End Users

1. Make changes to your evaluation configuration
2. Press Ctrl/Cmd+Z to undo the last change
3. Press Ctrl/Cmd+Y to redo a change
4. Use the undo/redo buttons in the toolbar
5. Hover over buttons to see what will be undone/redone

### For Developers

To integrate with other configuration changes:

```typescript
// Any updates through updateConfig are automatically tracked
updateConfig({
  prompts: newPrompts,
  providers: newProviders,
});

// To clear history programmatically
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';
useHistoryStore.getState().clearHistory();

// To check history state
const { canUndo, canRedo, getUndoDescription } = useHistoryStore();
```

## Testing

The implementation includes a demo component (`UndoRedoDemo.tsx`) that can be used to test the functionality:

```typescript
// Add to any page for testing
import { UndoRedoDemo } from './components/UndoRedoDemo';

// In your component
<UndoRedoDemo />
```

## Future Enhancements

1. **Persistent History**: Save history to localStorage to maintain undo/redo across sessions
2. **Grouped Actions**: Group related changes into single undo/redo operations
3. **Visual History**: Show a timeline or list of all history entries
4. **Selective Undo**: Allow jumping to specific points in history
5. **Conflict Resolution**: Handle conflicts when multiple users edit the same configuration
