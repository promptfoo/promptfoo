import { StrictMode } from 'react';

import { mockBrowserProperty } from '@app/tests/browserMocks';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeaderCollapse } from './useHeaderCollapse';

beforeEach(() => {
  mockBrowserProperty(globalThis, 'CSS', { supports: vi.fn(() => false) });
  mockBrowserProperty(window, 'scrollY', 0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function scrollTo(y: number, event = 'scroll') {
  act(() => {
    mockBrowserProperty(window, 'scrollY', y);
    window.dispatchEvent(new Event(event));
  });
}

describe('results header fallback', () => {
  it('leaves native scroll animations in control without registering listeners', () => {
    vi.mocked(CSS.supports).mockReturnValue(true);
    const add = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useHeaderCollapse(true));
    expect(result.current).toBeUndefined();
    expect(add.mock.calls.filter(([event]) => event === 'scroll' || event === 'resize')).toEqual(
      [],
    );
  });

  it('disables native collapse while sticky mode is off and restores it on re-enable', () => {
    vi.mocked(CSS.supports).mockReturnValue(true);
    mockBrowserProperty(window, 'scrollY', 100);
    const add = vi.spyOn(window, 'addEventListener');
    const { result, rerender } = renderHook(({ sticky }) => useHeaderCollapse(sticky), {
      initialProps: { sticky: false },
    });
    expect(result.current).toBe(false);
    rerender({ sticky: true });
    expect(result.current).toBeUndefined();
    rerender({ sticky: false });
    expect(result.current).toBe(false);
    expect(add.mock.calls.filter(([event]) => event === 'scroll' || event === 'resize')).toEqual(
      [],
    );
  });

  it('starts expanded and collapses at the measured native threshold in either direction', () => {
    const { result } = renderHook(() => useHeaderCollapse(true));
    expect(result.current).toBe(false);
    scrollTo(14);
    expect(result.current).toBe(false);
    scrollTo(15);
    expect(result.current).toBe(true);
    scrollTo(100);
    expect(result.current).toBe(true);
    scrollTo(0);
    expect(result.current).toBe(false);
  });

  it.each([undefined, {}])('handles a missing CSS feature-detection API (%s)', (css) => {
    mockBrowserProperty(globalThis, 'CSS', css);
    const { result } = renderHook(() => useHeaderCollapse(true));
    expect(result.current).toBe(false);
  });

  it('samples restored scroll on mount and remount', () => {
    mockBrowserProperty(window, 'scrollY', 100);
    const first = renderHook(() => useHeaderCollapse(true));
    expect(first.result.current).toBe(true);
    first.unmount();
    mockBrowserProperty(window, 'scrollY', 0);
    const second = renderHook(() => useHeaderCollapse(true));
    expect(second.result.current).toBe(false);
  });

  it('expands while sticky behavior is dismissed and resamples on re-enable', () => {
    mockBrowserProperty(window, 'scrollY', 100);
    const { result, rerender } = renderHook(({ sticky }) => useHeaderCollapse(sticky), {
      initialProps: { sticky: true },
    });
    expect(result.current).toBe(true);
    rerender({ sticky: false });
    expect(result.current).toBe(false);
    scrollTo(0);
    rerender({ sticky: true });
    expect(result.current).toBe(false);
    scrollTo(100);
    expect(result.current).toBe(true);
  });

  it('resamples when resizing or filtering clamps the document scroll position', () => {
    mockBrowserProperty(window, 'scrollY', 100);
    const { result } = renderHook(() => useHeaderCollapse(true));
    scrollTo(0, 'resize');
    expect(result.current).toBe(false);
    scrollTo(100);
    expect(result.current).toBe(true);
    scrollTo(1);
    expect(result.current).toBe(false);
  });

  it('owns only its listeners through StrictMode, toggles and unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = renderHook(({ sticky }) => useHeaderCollapse(sticky), {
      initialProps: { sticky: true },
      wrapper: StrictMode,
    });
    rerender({ sticky: false });
    rerender({ sticky: true });
    unmount();
    for (const [event, callback] of add.mock.calls.filter(
      ([event]) => event === 'scroll' || event === 'resize',
    )) {
      expect(remove).toHaveBeenCalledWith(event, callback);
    }
  });
});
