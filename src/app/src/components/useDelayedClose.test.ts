import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Directly import the function from the component file
import { useDelayedClose } from './Navigation';

describe('useDelayedClose', () => {
  const DROPDOWN_CLOSE_DELAY = 150; // This constant is internal to Navigation.tsx, so we'll hardcode it for the test
  let setActiveMenu: vi.Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    setActiveMenu = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should schedule a close after the delay', () => {
    const { result } = renderHook(() => useDelayedClose('create', setActiveMenu));

    act(() => {
      result.current.scheduleClose();
    });

    vi.advanceTimersByTime(DROPDOWN_CLOSE_DELAY - 1);
    expect(setActiveMenu).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setActiveMenu).toHaveBeenCalledWith(null);
  });

  it('should cancel a scheduled close', () => {
    const { result } = renderHook(() => useDelayedClose('create', setActiveMenu));

    act(() => {
      result.current.scheduleClose();
      result.current.cancelClose();
    });

    vi.advanceTimersByTime(DROPDOWN_CLOSE_DELAY);
    expect(setActiveMenu).not.toHaveBeenCalled();
  });

  it('should clear the timer on unmount', () => {
    const { result, unmount } = renderHook(() => useDelayedClose('create', setActiveMenu));

    act(() => {
      result.current.scheduleClose();
    });

    unmount();

    vi.advanceTimersByTime(DROPDOWN_CLOSE_DELAY);
    expect(setActiveMenu).not.toHaveBeenCalled();
  });

  it('should not close if active menu is different', () => {
    // Simulate a different menu being active
    setActiveMenu.mockImplementation((callback) => {
      if (typeof callback === 'function') {
        const newState = callback('evals'); // Current active menu is 'evals'
        if (newState !== null) {
          // Only call if it's actually changing to null
          setActiveMenu.mock.results[0].value = newState; // Update the internal state of the mock
        }
      } else {
        setActiveMenu.mock.results[0].value = callback;
      }
    });

    const { result } = renderHook(() => useDelayedClose('create', setActiveMenu));

    act(() => {
      result.current.scheduleClose();
    });

    vi.advanceTimersByTime(DROPDOWN_CLOSE_DELAY);
    expect(setActiveMenu).not.toHaveBeenCalledWith(null); // Should not set to null because 'evals' is active
  });
});
