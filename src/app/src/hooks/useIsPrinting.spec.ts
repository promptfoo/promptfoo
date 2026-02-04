import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsPrinting } from './useIsPrinting';

describe('useIsPrinting', () => {
  let mockMediaQueryList: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset the mock before each test
    mockMediaQueryList = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query === 'print') {
        return mockMediaQueryList;
      }
      return {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    });
  });

  it('should return false when not in print mode', () => {
    mockMediaQueryList.matches = false;

    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);
  });

  it('should return true when in print mode', () => {
    mockMediaQueryList.matches = true;

    const { result } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(true);
  });

  it('should add event listener on mount', () => {
    renderHook(() => useIsPrinting());

    expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should remove event listener on unmount', () => {
    const { unmount } = renderHook(() => useIsPrinting());

    unmount();

    expect(mockMediaQueryList.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should update when print mode changes', () => {
    mockMediaQueryList.matches = false;

    const { result, rerender } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);

    // Get the change handler that was registered
    const changeHandler = mockMediaQueryList.addEventListener.mock.calls[0][1];

    // Simulate entering print mode
    mockMediaQueryList.matches = true;
    changeHandler({ matches: true } as MediaQueryListEvent);

    rerender();

    expect(result.current).toBe(true);

    // Simulate exiting print mode
    mockMediaQueryList.matches = false;
    changeHandler({ matches: false } as MediaQueryListEvent);

    rerender();

    expect(result.current).toBe(false);
  });

  it('should handle MediaQueryList object in handleChange', () => {
    mockMediaQueryList.matches = false;

    const { result, rerender } = renderHook(() => useIsPrinting());

    expect(result.current).toBe(false);

    // Get the change handler that was registered
    const changeHandler = mockMediaQueryList.addEventListener.mock.calls[0][1];

    // Simulate change with MediaQueryList object (not MediaQueryListEvent)
    const mediaQueryListObj = { matches: true };
    changeHandler(mediaQueryListObj as MediaQueryList);

    rerender();

    expect(result.current).toBe(true);
  });
});
