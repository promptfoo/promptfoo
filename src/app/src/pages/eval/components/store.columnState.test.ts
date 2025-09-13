import { act } from '@testing-library/react';
import { describe, beforeEach, it, expect } from 'vitest';
import { useResultsViewSettingsStore } from './store';
import type { ColumnState } from './store';

describe('useResultsViewSettingsStore - Global Column State Management', () => {
  beforeEach(() => {
    act(() => {
      // Reset store to initial state
      const initialState = useResultsViewSettingsStore.getState();
      useResultsViewSettingsStore.setState({
        ...initialState,
        globalColumnSettings: null,
      });
    });
  });

  describe('setColumnState', () => {
    it('should set global column state', () => {
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false, col3: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(columnState);
      });

      const state = useResultsViewSettingsStore.getState();
      expect(state.globalColumnSettings).toEqual(columnState);
    });

    it('should overwrite existing global column state', () => {
      const initialState: ColumnState = {
        selectedColumns: ['col1'],
        columnVisibility: { col1: true },
      };

      const updatedState: ColumnState = {
        selectedColumns: ['col1', 'col2', 'col3'],
        columnVisibility: { col1: false, col2: true, col3: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(initialState);
      });

      let state = useResultsViewSettingsStore.getState();
      expect(state.globalColumnSettings).toEqual(initialState);

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(updatedState);
      });

      state = useResultsViewSettingsStore.getState();
      expect(state.globalColumnSettings).toEqual(updatedState);
    });
  });

  describe('getColumnState', () => {
    it('should return global column state when it exists', () => {
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(columnState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState();
      expect(retrievedState).toEqual(columnState);
    });

    it('should return null when no global column state exists', () => {
      const retrievedState = useResultsViewSettingsStore.getState().getColumnState();
      expect(retrievedState).toBeNull();
    });

    it('should filter out columns that do not exist in validColumns', () => {
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2', 'nonExistentColumn'],
        columnVisibility: { col1: true, col2: false, nonExistentColumn: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(columnState);
      });

      const validColumns = ['col1', 'col2'];
      const retrievedState = useResultsViewSettingsStore.getState().getColumnState(validColumns);

      expect(retrievedState).toEqual({
        selectedColumns: ['col1', 'col2'],
        columnVisibility: { col1: true, col2: false },
      });
      expect(retrievedState?.selectedColumns).not.toContain('nonExistentColumn');
    });

    it('should return unfiltered state when validColumns is not provided', () => {
      const columnState: ColumnState = {
        selectedColumns: ['col1', 'col2', 'col3'],
        columnVisibility: { col1: true, col2: false, col3: true },
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(columnState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState();
      expect(retrievedState).toEqual(columnState);
    });
  });

  describe('global column state behavior', () => {
    it('should share column visibility settings across all evaluations', () => {
      const sharedSettings: ColumnState = {
        selectedColumns: ['Variable 1', 'Prompt 1', 'Output'],
        columnVisibility: {
          'Variable 1': true,
          'Prompt 1': false,
          Output: true,
          Score: false,
        },
      };

      // Set global settings
      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(sharedSettings);
      });

      // Any call to getColumnState should return the same global settings
      const settings1 = useResultsViewSettingsStore.getState().getColumnState();
      const settings2 = useResultsViewSettingsStore.getState().getColumnState();

      expect(settings1).toEqual(sharedSettings);
      expect(settings2).toEqual(sharedSettings);
      expect(settings1).toBe(settings2); // Same reference
    });

    it('should handle empty selectedColumns and columnVisibility', () => {
      const emptyState: ColumnState = {
        selectedColumns: [],
        columnVisibility: {},
      };

      act(() => {
        useResultsViewSettingsStore.getState().setColumnState(emptyState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState();
      expect(retrievedState).toEqual(emptyState);
    });

    it('should handle complex column visibility states', () => {
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
        useResultsViewSettingsStore.getState().setColumnState(complexState);
      });

      const retrievedState = useResultsViewSettingsStore.getState().getColumnState();
      expect(retrievedState).toEqual(complexState);
    });
  });
});
