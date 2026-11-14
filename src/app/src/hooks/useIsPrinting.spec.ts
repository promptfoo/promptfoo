import { mockMatchMedia } from '@app/tests/browserMocks';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsPrinting } from './useIsPrinting';

describe('useIsPrinting', () => {
  let matchMedia: ReturnType<typeof mockMatchMedia>;
  const getMediaQueryList = () => matchMedia.mock.results[0].value;

  beforeEach(() => {
    // Reset the mock before each test
    matchMedia = mockMatchMedia();
  });

  it('should return false when not in print mode', () => {
    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledExactlyOnceWith('print');
  });

  it('should return true when in print mode', () => {
    matchMedia = mockMatchMedia({ matches: (query) => query === 'print' });
    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(true);
  });

  it('should add event listener on mount', () => {
    renderHook(() => useIsPrinting());

    expect(getMediaQueryList().addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should remove event listener on unmount', () => {
    const { unmount } = renderHook(() => useIsPrinting());
    const mediaQuery = getMediaQueryList();
    const listener = vi.mocked(mediaQuery.addEventListener).mock.calls[0][1];

    unmount();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('should update when print mode changes', () => {
    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);

    // Get the media query list that owns the change listener
    const mediaQuery = getMediaQueryList();

    // Simulate entering print mode
    act(() => mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent));
    expect(result.current).toBe(true);

    // Simulate exiting print mode
    act(() => mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent));
    expect(result.current).toBe(false);
  });

  it('should handle MediaQueryList object in handleChange', () => {
    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);

    // Get the change handler that was registered
    const changeHandler = vi.mocked(getMediaQueryList().addEventListener).mock.calls[0][1] as (
      event: MediaQueryListEvent | MediaQueryList,
    ) => void;

    // Simulate change with MediaQueryList object (not MediaQueryListEvent)
    act(() => changeHandler({ matches: true } as MediaQueryList));
    expect(result.current).toBe(true);
  });
});
