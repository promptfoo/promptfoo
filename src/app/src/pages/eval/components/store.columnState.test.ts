import { act } from '@testing-library/react';
import { describe, beforeEach, it, expect } from 'vitest';
import { useResultsViewSettingsStore } from './store';
import type { ColumnState } from './store';

describe('useResultsViewSettingsStore - Column State Management', () => {
  beforeEach(() => {
    act(() => {
      // Reset store to initial state
      const initialState = useResultsViewSettingsStore.getState();
      useResultsViewSettingsStore.setState({
        ...initialState,
        columnStates: {},
        lastUsedColumnSettings: null,
      });
    });
  });

  describe('setColumnState', () => {
    it('should set column state for specific eval ID', () => {
      const evalId = 'test-eval-1';
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false, col3: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, columnState);
      });

      const state = useResultsViewSettingsStore.getState();
      expect(state.columnStates[evalId]).toEqual(columnState);
    });

    it('should update lastUsedColumnSettings when setting column state', () => {
      const evalId = 'test-eval-1';
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, columnState);
      });

      const state = useResultsViewSettingsStore.getState();
      expect(state.lastUsedColumnSettings).toEqual(columnState);
    });

    it('should allow setting column state for multiple eval IDs', () => {
      const evalId1 = 'test-eval-1';
      const evalId2 = 'test-eval-2';

      const columnState1: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false },
      };

      const columnState2: ColumnState = {
        selectedColumns: ['col3', 'col4'],
        columnVisibility: { col3: false, col4: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId1, columnState1);
        useResultsViewSettingsStore.getState().setColumnState(evalId2, columnState2);
      });

      const state = useResultsViewSettingsStore.getState();
      expect(state.columnStates[evalId1]).toEqual(columnState1);
      expect(state.columnStates[evalId2]).toEqual(columnState2);
      expect(state.lastUsedColumnSettings).toEqual(columnState2);
    });

    it('should overwrite existing column state for the same eval ID', () => {
      const evalId = 'test-eval-1';

      const initialState: ColumnState = {
        selectedColumns: ['col1'],
        columnVisibility: { col1: true },
      };

      const updatedState: ColumnState = {
        selectedColumns: ['col1', 'col2', 'col3'],
        columnVisibility: { col1: false, col2: true, col3: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, initialState);
      });

      let state = useResultsViewSettingsStore.getState();
      expect(state.columnStates[evalId]).toEqual(initialState);

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, updatedState);
      });

      state = useResultsViewSettingsStore.getState();
      expect(state.columnStates[evalId]).toEqual(updatedState);
      expect(state.lastUsedColumnSettings).toEqual(updatedState);
    });
  });

  describe('getColumnState', () => {
    it('should return column state for specific eval ID when it exists', () => {
      const evalId = 'test-eval-1';
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, columnState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(evalId);
      expect(retrievedState).toEqual(columnState);
    });

    it('should return lastUsedColumnSettings when eval ID does not exist', () => {
      const evalId1 = 'test-eval-1';
      const evalId2 = 'test-eval-2';
      const evalId3 = 'nonexistent-eval';

      const columnState1: ColumnState = {
        selectedColumns: ['col1'],
        columnVisibility: { col1: true },
      };

      const columnState2: ColumnState = {
        selectedColumns: ['col2', 'col3'],
        columnVisibility: { col2: true, col3: false },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId1, columnState1);
        useResultsViewSettingsStore.getState().setColumnState(evalId2, columnState2);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(evalId3);
      expect(retrievedState).toEqual(columnState2); // Should be the last used settings
    });

    it('should return null when no column state exists and no last used settings', () => {
      const evalId = 'nonexistent-eval';

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(evalId);
      expect(retrievedState).toBeNull();
    });

    it('should prioritize specific eval column state over last used settings', () => {
      const evalId1 = 'test-eval-1';
      const evalId2 = 'test-eval-2';

      const columnState1: ColumnState = {
        selectedColumns: ['col1'],
        columnVisibility: { col1: true },
      };

      const columnState2: ColumnState = {
        selectedColumns: ['col2', 'col3'],
        columnVisibility: { col2: true, col3: false },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId1, columnState1);
        useResultsViewSettingsStore.getState().setColumnState(evalId2, columnState2);
      });

      // Should return specific state for evalId1, not the last used settings
      const retrievedState1 = useResultsViewSettingsStore.getState().getColumnState(evalId1);
      expect(retrievedState1).toEqual(columnState1);
    });
  });

  describe('column state persistence behavior', () => {
    it('should persist column visibility settings across different evaluations', () => {
      const evalId1 = 'test-eval-1';
      const evalId2 = 'test-eval-2';

      const sharedSettings: ColumnState = {
        selectedColumns: ['Variable 1', 'Prompt 1', 'Output'],
        columnVisibility: {
          'Variable 1': true,
          'Prompt 1': false,
          Output: true,
          Score: false,
        },
      };

      // Set settings for first eval
      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId1, sharedSettings);
      });

      // New eval should get the last used settings
      const newEvalSettings = useResultsViewSettingsStore.getState().getColumnState(evalId2);
      expect(newEvalSettings).toEqual(sharedSettings);
    });

    it('should handle empty selectedColumns and columnVisibility', () => {
      const evalId = 'test-eval-1';
      const emptyState: ColumnState = {
        selectedColumns: [],
        columnVisibility: {},
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, emptyState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(evalId);
      expect(retrievedState).toEqual(emptyState);
    });

    it('should handle complex column visibility states', () => {
      const evalId = 'test-eval-1';
      const complexState: ColumnState = {
        selectedColumns: ['Variable 1', 'Variable 2', 'Prompt 1', 'Output', 'Score'],
        columnVisibility: {
          'Variable 1': true,
          'Variable 2': false,
          'Variable with spaces and special chars!@#': true,
          'Prompt 1': true,
          'Prompt 2': false,
          Output: true,
          Score: false,
          'Very long column name that might be problematic in some contexts': true,
        },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(evalId, complexState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(evalId);
      expect(retrievedState).toEqual(complexState);
    });
  });
});
