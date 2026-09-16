import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useResultsViewSettingsStore } from './store';

describe('useResultsViewSettingsStore column state', () => {
  beforeEach(() => {
    act(() => {
      useResultsViewSettingsStore.setState({
        columnStates: {},
        hiddenVarNamesBySchema: {},
      });
    });
  });

  it('stores non-variable column visibility per evaluation', () => {
    const evalOneState = {
      selectedColumns: ['description', 'Variable 1'],
      columnVisibility: { description: true, 'Variable 1': true, 'Prompt 1': false },
    };
    const evalTwoState = {
      selectedColumns: ['Variable 1', 'Prompt 1'],
      columnVisibility: { description: false, 'Variable 1': true, 'Prompt 1': true },
    };

    act(() => {
      useResultsViewSettingsStore.getState().setColumnState('eval-one', evalOneState);
      useResultsViewSettingsStore.getState().setColumnState('eval-two', evalTwoState);
    });

    expect(useResultsViewSettingsStore.getState().columnStates).toEqual({
      'eval-one': evalOneState,
      'eval-two': evalTwoState,
    });
  });

  it('stores hidden variable names by schema so reruns with the same variables share settings', () => {
    act(() => {
      useResultsViewSettingsStore
        .getState()
        .setHiddenVarNamesForSchema('customer|question|tier', ['tier']);
      useResultsViewSettingsStore.getState().setHiddenVarNamesForSchema('city|question', ['city']);
    });

    expect(useResultsViewSettingsStore.getState().hiddenVarNamesBySchema).toEqual({
      'customer|question|tier': ['tier'],
      'city|question': ['city'],
    });
  });

  it('overwrites only the matching variable schema', () => {
    act(() => {
      useResultsViewSettingsStore
        .getState()
        .setHiddenVarNamesForSchema('customer|question|tier', ['tier']);
      useResultsViewSettingsStore.getState().setHiddenVarNamesForSchema('city|question', ['city']);
      useResultsViewSettingsStore
        .getState()
        .setHiddenVarNamesForSchema('customer|question|tier', ['customer', 'tier']);
    });

    expect(useResultsViewSettingsStore.getState().hiddenVarNamesBySchema).toEqual({
      'customer|question|tier': ['customer', 'tier'],
      'city|question': ['city'],
    });
  });
});
