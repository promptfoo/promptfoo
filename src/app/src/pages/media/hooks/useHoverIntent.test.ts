import { mockMatchMedia } from '@app/tests/browserMocks';
import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoverIntent } from './useHoverIntent';

describe('useHoverIntent', () => {
  let timers: TestTimers;

  beforeEach(() => {
    timers = useTestTimers();

    mockMatchMedia({ matches: (query) => query === '(hover: hover)' });
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useHoverIntent());

    expect(result.current.isHovering).toBe(false);
    expect(result.current.isIntentional).toBe(false);
    expect(result.current.hoverProps).toHaveProperty('onMouseEnter');
    expect(result.current.hoverProps).toHaveProperty('onMouseLeave');
    expect(result.current.hoverProps).toHaveProperty('onFocus');
    expect(result.current.hoverProps).toHaveProperty('onBlur');
  });

  it('should set isHovering immediately on mouse enter', () => {
    const { result } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
    });

    expect(result.current.isHovering).toBe(true);
    expect(result.current.isIntentional).toBe(false);
  });

  it('should set isIntentional after delay', () => {
    const { result } = renderHook(() => useHoverIntent({ delay: 300 }));

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
    const { result } = renderHook(() => useHoverIntent({ delay: 300 }));

    act(() => {
      result.current.hoverProps.onMouseEnter();
      timers.advanceBy(300);
    });

    expect(result.current.isHovering).toBe(true);
    expect(result.current.isIntentional).toBe(true);

    act(() => {
      result.current.hoverProps.onMouseLeave();
    });

    expect(result.current.isHovering).toBe(false);
    expect(result.current.isIntentional).toBe(false);
  });

  it('should cancel timer on early mouse leave', () => {
    const { result } = renderHook(() => useHoverIntent({ delay: 300 }));

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

  it('should support custom delay', () => {
    const { result } = renderHook(() => useHoverIntent({ delay: 500 }));

    act(() => {
      result.current.hoverProps.onMouseEnter();
      timers.advanceBy(300);
    });

    expect(result.current.isIntentional).toBe(false);

    act(() => {
      timers.advanceBy(200);
    });

    expect(result.current.isIntentional).toBe(true);
  });

  describe('keyboard focus support', () => {
    it('should set isHovering on focus', () => {
      const { result } = renderHook(() => useHoverIntent());

      act(() => {
        result.current.hoverProps.onFocus();
      });

      expect(result.current.isHovering).toBe(true);
    });

    it('should set isIntentional after half delay for keyboard users', () => {
      const { result } = renderHook(() => useHoverIntent({ delay: 300 }));

      act(() => {
        result.current.hoverProps.onFocus();
        timers.advanceBy(150); // Half of 300ms
      });

      expect(result.current.isIntentional).toBe(true);
    });

    it('should reset state on blur', () => {
      const { result } = renderHook(() => useHoverIntent({ delay: 300 }));

      act(() => {
        result.current.hoverProps.onFocus();
        timers.advanceBy(150);
      });

      expect(result.current.isIntentional).toBe(true);

      act(() => {
        result.current.hoverProps.onBlur();
      });

      expect(result.current.isHovering).toBe(false);
      expect(result.current.isIntentional).toBe(false);
    });
  });

  describe('enabled option', () => {
    it('should not activate when enabled is false', () => {
      const { result } = renderHook(() => useHoverIntent({ enabled: false }));

      act(() => {
        result.current.hoverProps.onMouseEnter();
        timers.advanceBy(500);
      });

      expect(result.current.isHovering).toBe(false);
      expect(result.current.isIntentional).toBe(false);
    });
  });

  describe('prefers-reduced-motion', () => {
    it('should not activate when user prefers reduced motion and respectReducedMotion is true', () => {
      mockMatchMedia({
        matches: (query) =>
          query === '(prefers-reduced-motion: reduce)' || query === '(hover: hover)',
      });

      const { result } = renderHook(() => useHoverIntent({ respectReducedMotion: true }));

      act(() => {
        result.current.hoverProps.onMouseEnter();
        timers.advanceBy(500);
      });

      expect(result.current.isIntentional).toBe(false);
    });

    it('should activate when respectReducedMotion is false even with reduced motion preference', () => {
      mockMatchMedia({
        matches: (query) =>
          query === '(prefers-reduced-motion: reduce)' || query === '(hover: hover)',
      });

      const { result } = renderHook(() => useHoverIntent({ respectReducedMotion: false }));

      act(() => {
        result.current.hoverProps.onMouseEnter();
        timers.advanceBy(500);
      });

      expect(result.current.isIntentional).toBe(true);
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

  it('should cleanup timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { result, unmount } = renderHook(() => useHoverIntent());

    act(() => {
      result.current.hoverProps.onMouseEnter();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
