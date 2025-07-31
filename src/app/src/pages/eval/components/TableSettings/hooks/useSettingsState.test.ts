import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsState } from './useSettingsState';

const mockStore = {
  maxTextLength: 500,
  setMaxTextLength: vi.fn(),
  wordBreak: 'break-word',
  setWordBreak: vi.fn(),
  showInferenceDetails: true,
  setShowInferenceDetails: vi.fn(),
  renderMarkdown: true,
  setRenderMarkdown: vi.fn(),
  prettifyJson: true,
  setPrettifyJson: vi.fn(),
  showPrompts: false,
  setShowPrompts: vi.fn(),
  showPassFail: true,
  setShowPassFail: vi.fn(),
  stickyHeader: true,
  setStickyHeader: vi.fn(),
  maxImageWidth: 500,
  setMaxImageWidth: vi.fn(),
  maxImageHeight: 300,
  setMaxImageHeight: vi.fn(),
};

describe('useSettingsState', () => {
  beforeEach(() => {
    vi.mock('../../store', () => ({
      useResultsViewSettingsStore: () => mockStore,
    }));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with correct values', () => {
    const { result } = renderHook(() => useSettingsState(false));

    expect(result.current.localMaxTextLength).toBe(500);
    expect(result.current.hasChanges).toBe(false);
  });

  it('should handle infinite maxTextLength', () => {
    const infiniteStore = {
      ...mockStore,
      maxTextLength: Number.POSITIVE_INFINITY,
    };
    vi.mocked(mockStore).maxTextLength = infiniteStore.maxTextLength;

    const { result } = renderHook(() => useSettingsState(false));
    expect(result.current.localMaxTextLength).toBe(1001);
  });

  it('should track changes correctly', () => {
    const { result, rerender } = renderHook(({ isOpen }) => useSettingsState(isOpen), {
      initialProps: { isOpen: true },
    });

    act(() => {
      mockStore.maxTextLength = 600;
    });

    rerender({ isOpen: false });
    expect(result.current.hasChanges).toBe(true);
  });

  it('should handle slider changes', () => {
    const { result } = renderHook(() => useSettingsState(false));

    act(() => {
      result.current.handleSliderChange(750);
    });

    expect(result.current.localMaxTextLength).toBe(750);
  });

  it('should handle slider change committed', () => {
    const { result } = renderHook(() => useSettingsState(false));

    act(() => {
      result.current.handleSliderChangeCommitted(1001);
    });

    expect(mockStore.setMaxTextLength).toHaveBeenCalledWith(Number.POSITIVE_INFINITY);
  });

  it('should reset to defaults', () => {
    const { result } = renderHook(() => useSettingsState(false));

    act(() => {
      result.current.resetToDefaults();
    });

    expect(mockStore.setStickyHeader).toHaveBeenCalledWith(true);
    expect(mockStore.setWordBreak).toHaveBeenCalledWith('break-word');
    expect(mockStore.setRenderMarkdown).toHaveBeenCalledWith(true);
    expect(mockStore.setPrettifyJson).toHaveBeenCalledWith(true);
    expect(mockStore.setShowPrompts).toHaveBeenCalledWith(false);
    expect(mockStore.setShowPassFail).toHaveBeenCalledWith(true);
    expect(mockStore.setShowInferenceDetails).toHaveBeenCalledWith(true);
    expect(mockStore.setMaxTextLength).toHaveBeenCalledWith(500);
    expect(mockStore.setMaxImageWidth).toHaveBeenCalledWith(500);
    expect(mockStore.setMaxImageHeight).toHaveBeenCalledWith(300);
  });
});
