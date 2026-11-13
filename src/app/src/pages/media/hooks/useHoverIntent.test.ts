import { mockBrowserProperty, mockMatchMedia, restoreBrowserMocks } from '@app/tests/browserMocks';
import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHoverIntent } from './useHoverIntent';

describe('useHoverIntent', () => {
  let timers: TestTimers;

  beforeEach(() => {
    timers = useTestTimers();

    mockMatchMedia({ matches: (query) => query === '(hover: hover)' });
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useHoverIntent());

    expect(result.current.isIntentional).toBe(false);
    expect(result.current.hoverProps).toHaveProperty('onMouseEnter');
    expect(result.current.hoverProps).toHaveProperty('onMouseLeave');
    expect(result.current.hoverProps).toHaveProperty('onFocus');
    expect(result.current.hoverProps).toHaveProperty('onBlur');
  });

  it('should set isIntentional after delay', () => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
    });

    expect(result.current.isIntentional).toBe(false);

    act(() => {
      timers.advanceBy(300);
    });

    expect(result.current.isIntentional).toBe(true);
  });

  it('should reset state on mouse leave', () => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
      timers.advanceBy(300);
    });

    expect(result.current.isIntentional).toBe(true);

    act(() => {
      result.current.hoverProps.onMouseLeave();
    });

    expect(result.current.isIntentional).toBe(false);
  });

  it('should cancel timer on early mouse leave', () => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
      timers.advanceBy(100); // Only 100ms, not full 300ms
      result.current.hoverProps.onMouseLeave();
    });

    expect(result.current.isIntentional).toBe(false);

    // Even after more time, should not become intentional
    act(() => {
      timers.advanceBy(300);
    });

    expect(result.current.isIntentional).toBe(false);
  });

  describe('keyboard focus support', () => {
    it('should set isIntentional after half delay for keyboard users', () => {
      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps.onFocus();
        timers.advanceBy(150); // Half of 300ms
      });

      expect(result.current.isIntentional).toBe(true);
    });

    it('should reset state on blur', () => {
      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps.onFocus();
        timers.advanceBy(150);
      });

      expect(result.current.isIntentional).toBe(true);

      act(() => {
        result.current.hoverProps.onBlur();
      });

      expect(result.current.isIntentional).toBe(false);
    });
  });

  describe('prefers-reduced-motion', () => {
    it('should not activate when the user prefers reduced motion', () => {
      mockMatchMedia({
        matches: (query) =>
          query === '(prefers-reduced-motion: reduce)' || query === '(hover: hover)',
      });

      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps.onMouseEnter();
        timers.advanceBy(500);
      });

      expect(result.current.isIntentional).toBe(false);
    });
  });

  describe('touch devices', () => {
    it('should not activate on touch-only devices', () => {
      mockMatchMedia();

      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps.onMouseEnter();
        timers.advanceBy(500);
      });

      expect(result.current.isIntentional).toBe(false);
    });
  });

  it.each([
    ['onMouseEnter', 'onFocus', 200, 100],
    ['onMouseEnter', 'onFocus', 50, 150],
    ['onFocus', 'onMouseEnter', 50, 100],
  ] as const)(
    'honors the earliest deadline when %s precedes %s by %i ms',
    (first, second, gap, remaining) => {
      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps[first]();
        timers.advanceBy(gap);
        result.current.hoverProps[second]();
        timers.advanceBy(remaining - 1);
      });
      expect(result.current.isIntentional).toBe(false);
      act(() => {
        timers.advanceBy(1);
      });
      expect(result.current.isIntentional).toBe(true);
    },
  );

  it.each(['onMouseLeave', 'onBlur'] as const)('cancels pending hover and focus on %s', (exit) => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
      result.current.hoverProps.onFocus();
      result.current.hoverProps[exit]();
      timers.advanceBy(300);
    });

    expect(result.current.isIntentional).toBe(false);
  });

  it('cancels overlapping hover and focus on unmount', () => {
    const { result, unmount } = renderHook(() => useHoverIntent());
    const idleTimers = timers.getTimerCount();

    act(() => {
      result.current.hoverProps.onMouseEnter();
      result.current.hoverProps.onFocus();
    });
    unmount();

    expect(timers.getTimerCount()).toBe(idleTimers);
  });

  it('should ignore delayed hover work after the browser window tears down', () => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
    });

    mockBrowserProperty(globalThis, 'window', undefined);

    expect(() => {
      timers.advanceBy(300);
    }).not.toThrow();

    restoreBrowserMocks();
    expect(result.current.isIntentional).toBe(false);
  });
});
