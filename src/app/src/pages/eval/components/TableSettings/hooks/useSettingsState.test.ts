import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResultsViewSettingsStore } from '../../store';
import { useSettingsState } from './useSettingsState';

// Preserve the Reset button's existing values and order, which differ from initial store defaults.
const resets = [
  ['setStickyHeader', true],
  ['setWordBreak', 'break-word'],
  ['setRenderMarkdown', true],
  ['setPrettifyJson', true],
  ['setShowPrompts', false],
  ['setShowPassFail', true],
  ['setShowPassReasons', false],
  ['setShowMetricPills', true],
  ['setShowInferenceDetails', true],
  ['setMaxTextLength', 500],
  ['setMaxImageWidth', 500],
  ['setMaxImageHeight', 300],
] as const;
const initialState = { ...useResultsViewSettingsStore.getState() };

beforeEach(() => {
  useResultsViewSettingsStore.setState(initialState, true);
});
afterEach(() => {
  vi.restoreAllMocks();
  useResultsViewSettingsStore.setState(initialState, true);
});

describe('useSettingsState', () => {
  it('resets the real store with the same ordered setter calls after a mounted update', () => {
    const setters = resets.map(([name]) => vi.spyOn(useResultsViewSettingsStore.getState(), name));
    const { result } = renderHook(() => useSettingsState());
    const reset = result.current.resetToDefaults;
    act(() => useResultsViewSettingsStore.setState({ maxTextLength: 900, showPrompts: true }));
    expect(result.current.resetToDefaults).toBe(reset);

    act(() => result.current.resetToDefaults());

    setters.forEach((setter, index) => {
      expect(setter).toHaveBeenCalledExactlyOnceWith(resets[index][1]);
    });
    const callOrder = setters.map((setter) => setter.mock.invocationCallOrder[0]);
    expect(callOrder).toEqual([...callOrder].sort((a, b) => a - b));
    expect(useResultsViewSettingsStore.getState()).toMatchObject({
      maxTextLength: 500,
      showPrompts: false,
      renderMarkdown: true,
      prettifyJson: true,
    });
  });

  it('refreshes the reset callback when a setter changes', () => {
    const { result } = renderHook(() => useSettingsState());
    const originalReset = result.current.resetToDefaults;
    const setMaxTextLength = vi.fn();
    act(() => useResultsViewSettingsStore.setState({ setMaxTextLength }));

    expect(result.current.resetToDefaults).not.toBe(originalReset);
    act(() => result.current.resetToDefaults());
    expect(setMaxTextLength).toHaveBeenCalledExactlyOnceWith(500);
  });
});
