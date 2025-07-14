import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { UnifiedConfig } from '../../../types';
import { useStore as useEvalConfigStore, type EvalConfigState } from './evalConfig';

interface HistoryEntry {
  config: Partial<UnifiedConfig>;
  timestamp: number;
  description: string;
}

interface EvalConfigHistoryState {
  history: HistoryEntry[];
  currentIndex: number;
  maxHistorySize: number;

  // Track if we can undo/redo
  canUndo: boolean;
  canRedo: boolean;

  // Get description of what will be undone/redone
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;

  // History actions
  pushToHistory: (config: Partial<UnifiedConfig>, description: string) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<EvalConfigHistoryState>()(
  subscribeWithSelector((set, get) => ({
    history: [],
    currentIndex: -1,
    maxHistorySize: 50,
    canUndo: false,
    canRedo: false,

    getUndoDescription: () => {
      const state = get();
      if (state.currentIndex > 0) {
        return state.history[state.currentIndex].description;
      }
      return null;
    },

    getRedoDescription: () => {
      const state = get();
      if (state.currentIndex < state.history.length - 1) {
        return state.history[state.currentIndex + 1].description;
      }
      return null;
    },

    pushToHistory: (config, description) => {
      set((state) => {
        // Remove any entries after the current index (redo history)
        const newHistory = state.history.slice(0, state.currentIndex + 1);

        // Add the new entry
        newHistory.push({
          config: JSON.parse(JSON.stringify(config)), // Deep clone
          timestamp: Date.now(),
          description,
        });

        // Limit history size
        if (newHistory.length > state.maxHistorySize) {
          newHistory.shift();
        }

        const newIndex = newHistory.length - 1;

        return {
          history: newHistory,
          currentIndex: newIndex,
          canUndo: newIndex > 0,
          canRedo: false,
        };
      });
    },

    undo: () => {
      const state = get();
      if (state.currentIndex > 0) {
        const newIndex = state.currentIndex - 1;
        const historyEntry = state.history[newIndex];

        // Apply the config from history without triggering a new history entry
        const evalConfigStore = useEvalConfigStore.getState();
        evalConfigStore.setConfig(historyEntry.config);

        set({
          currentIndex: newIndex,
          canUndo: newIndex > 0,
          canRedo: true,
        });
      }
    },

    redo: () => {
      const state = get();
      if (state.currentIndex < state.history.length - 1) {
        const newIndex = state.currentIndex + 1;
        const historyEntry = state.history[newIndex];

        // Apply the config from history without triggering a new history entry
        const evalConfigStore = useEvalConfigStore.getState();
        evalConfigStore.setConfig(historyEntry.config);

        set({
          currentIndex: newIndex,
          canUndo: true,
          canRedo: newIndex < state.history.length - 1,
        });
      }
    },

    clearHistory: () => {
      set({
        history: [],
        currentIndex: -1,
        canUndo: false,
        canRedo: false,
      });
    },
  })),
);

// Helper to get a description of what changed
export function getChangeDescription(
  oldConfig: Partial<UnifiedConfig>,
  newConfig: Partial<UnifiedConfig>,
): string {
  const changes: string[] = [];

  // Check prompts
  if (JSON.stringify(oldConfig.prompts) !== JSON.stringify(newConfig.prompts)) {
    const oldCount = Array.isArray(oldConfig.prompts) ? oldConfig.prompts.length : 0;
    const newCount = Array.isArray(newConfig.prompts) ? newConfig.prompts.length : 0;
    if (oldCount !== newCount) {
      changes.push(`prompts (${oldCount} → ${newCount})`);
    } else {
      changes.push('prompts');
    }
  }

  // Check providers
  if (JSON.stringify(oldConfig.providers) !== JSON.stringify(newConfig.providers)) {
    const oldCount = Array.isArray(oldConfig.providers) ? oldConfig.providers.length : 0;
    const newCount = Array.isArray(newConfig.providers) ? newConfig.providers.length : 0;
    if (oldCount !== newCount) {
      changes.push(`providers (${oldCount} → ${newCount})`);
    } else {
      changes.push('providers');
    }
  }

  // Check tests
  if (JSON.stringify(oldConfig.tests) !== JSON.stringify(newConfig.tests)) {
    const oldCount = Array.isArray(oldConfig.tests) ? oldConfig.tests.length : 0;
    const newCount = Array.isArray(newConfig.tests) ? newConfig.tests.length : 0;
    if (oldCount !== newCount) {
      changes.push(`test cases (${oldCount} → ${newCount})`);
    } else {
      changes.push('test cases');
    }
  }

  // Check description
  if (oldConfig.description !== newConfig.description) {
    changes.push('description');
  }

  // Check other fields
  const otherFields = ['env', 'defaultTest', 'scenarios', 'evaluateOptions'] as const;
  for (const field of otherFields) {
    if (JSON.stringify(oldConfig[field]) !== JSON.stringify(newConfig[field])) {
      changes.push(field);
    }
  }

  if (changes.length === 0) {
    return 'Unknown change';
  } else if (changes.length === 1) {
    return `Changed ${changes[0]}`;
  } else if (changes.length === 2) {
    return `Changed ${changes[0]} and ${changes[1]}`;
  } else {
    return `Changed ${changes.slice(0, -1).join(', ')} and ${changes[changes.length - 1]}`;
  }
}

// Track if we're applying history to avoid infinite loops
let isApplyingHistory = false;

// Enhanced undo/redo functions that prevent history tracking during application
export const undoWithoutTracking = () => {
  const state = useHistoryStore.getState();
  if (state.currentIndex > 0) {
    isApplyingHistory = true;
    const newIndex = state.currentIndex - 1;
    const historyEntry = state.history[newIndex];

    // Apply the config from history
    const evalConfigStore = useEvalConfigStore.getState();
    evalConfigStore.setConfig(historyEntry.config);

    useHistoryStore.setState({
      currentIndex: newIndex,
      canUndo: newIndex > 0,
      canRedo: true,
    });

    // Reset flag after a tick to ensure the config update is processed
    setTimeout(() => {
      isApplyingHistory = false;
    }, 0);
  }
};

export const redoWithoutTracking = () => {
  const state = useHistoryStore.getState();
  if (state.currentIndex < state.history.length - 1) {
    isApplyingHistory = true;
    const newIndex = state.currentIndex + 1;
    const historyEntry = state.history[newIndex];

    // Apply the config from history
    const evalConfigStore = useEvalConfigStore.getState();
    evalConfigStore.setConfig(historyEntry.config);

    useHistoryStore.setState({
      currentIndex: newIndex,
      canUndo: true,
      canRedo: newIndex < state.history.length - 1,
    });

    // Reset flag after a tick to ensure the config update is processed
    setTimeout(() => {
      isApplyingHistory = false;
    }, 0);
  }
};

// Override the store's undo/redo methods
useHistoryStore.setState({
  undo: undoWithoutTracking,
  redo: redoWithoutTracking,
});

// Subscribe to changes in the eval config store
let lastConfig: Partial<UnifiedConfig> | null = null;

useEvalConfigStore.subscribe((state) => {
  const config = state.config;

  // Don't track history when applying history changes
  if (isApplyingHistory) {
    return;
  }

  // Don't track if config hasn't actually changed
  if (lastConfig && JSON.stringify(lastConfig) === JSON.stringify(config)) {
    return;
  }

  const description = lastConfig ? getChangeDescription(lastConfig, config) : 'Initial state';
  useHistoryStore.getState().pushToHistory(config, description);
  lastConfig = JSON.parse(JSON.stringify(config));
});
