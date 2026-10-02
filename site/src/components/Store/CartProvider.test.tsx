import React from 'react';

import { useHistory, useLocation } from '@docusaurus/router';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartProvider, useCartContext } from './CartProvider';

// Use the same router instance as Docusaurus, not the app workspace's router.
const router = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  return createRequire(require.resolve('@docusaurus/core/package.json'))('react-router-dom');
});
vi.mock('@docusaurus/router', () => router);
vi.mock('./useFourthwall', () => ({
  useCart: () => ({
    cart: null,
    isLoading: false,
    error: null,
    itemCount: 0,
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
  }),
}));

const { BrowserRouter } = router;
const originalPush = window.history.pushState;
const originalReplace = window.history.replaceState;
const couponKey = 'promptfoo_coupon_code';

beforeEach(() => {
  localStorage.clear();
  originalReplace.call(window.history, {}, '', '/store');
});

afterEach(() => {
  cleanup();
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
  vi.restoreAllMocks();
  localStorage.clear();
});

function setup(reactStrictMode = false) {
  return renderHook(
    () => ({ cart: useCartContext(), history: useHistory(), location: useLocation() }),
    {
      reactStrictMode,
      wrapper: ({ children }) => (
        <BrowserRouter>
          <CartProvider>{children}</CartProvider>
        </BrowserRouter>
      ),
    },
  );
}

describe('cart coupon routing', () => {
  it.each([false, true])(
    'preserves anchor, other parameters and router state (StrictMode: %s)',
    (strict) => {
      originalReplace.call(
        window.history,
        { key: 'initial', state: { campaign: 'fixture' } },
        '',
        '/store?utm=first&coupon=%20hello%20&coupon=ignored&tag=a&tag=b#details',
      );
      localStorage.setItem(couponKey, 'OLD');
      const length = window.history.length;
      const { result } = setup(strict);
      expect(result.current.cart.couponCode).toBe('HELLO');
      expect(localStorage.getItem(couponKey)).toBe('HELLO');
      expect(window.location.pathname).toBe('/store');
      expect(window.location.hash).toBe('#details');
      expect(window.location.search).toBe('?utm=first&tag=a&tag=b');
      expect(result.current.location.search).toBe('?utm=first&tag=a&tag=b');
      expect(result.current.location.state).toEqual({ campaign: 'fixture' });
      expect(window.history.length).toBe(length);
    },
  );

  it('ingests push and replace navigations without adding a cleanup entry', () => {
    const { result } = setup();
    const length = window.history.length;
    act(() => result.current.history.push('/store?coupon=next&utm=x#items', { step: 2 }));
    expect(result.current.cart.couponCode).toBe('NEXT');
    expect(window.location.href).toContain('/store?utm=x#items');
    expect(result.current.location.state).toEqual({ step: 2 });
    expect(window.history.length).toBe(length + 1);
    act(() => result.current.history.replace('/store?coupon=final#cart', { step: 3 }));
    expect(result.current.cart.couponCode).toBe('FINAL');
    expect(window.location.hash).toBe('#cart');
    expect(result.current.location.state).toEqual({ step: 3 });
    expect(window.history.length).toBe(length + 1);
  });

  it.each(['push', 'replace'] as const)(
    'captures a coupon before a batched %s navigation replaces it',
    (method) => {
      const { result } = setup();
      act(() => {
        result.current.history.push('/store?coupon=welcome#offer');
        result.current.history[method]('/docs/intro?utm=next#start', { redirected: true });
      });
      expect(result.current.cart.couponCode).toBe('WELCOME');
      expect(localStorage.getItem(couponKey)).toBe('WELCOME');
      expect(window.location.pathname).toBe('/docs/intro');
      expect(window.location.search).toBe('?utm=next');
      expect(window.location.hash).toBe('#start');
      expect(result.current.location.state).toEqual({ redirected: true });
    },
  );

  it('uses the last coupon when several navigations are batched', () => {
    const { result } = setup();
    act(() => {
      result.current.history.push('/store?coupon=first');
      result.current.history.replace('/store?coupon=second');
      result.current.history.push('/docs/intro');
    });
    expect(result.current.cart.couponCode).toBe('SECOND');
    expect(localStorage.getItem(couponKey)).toBe('SECOND');
  });

  it('stops observing router navigation after unmount', () => {
    const { result, unmount } = setup();
    const history = result.current.history;
    unmount();
    history.push('/store?coupon=after#offer');
    expect(localStorage.getItem(couponKey)).toBeNull();
    expect(window.location.search).toBe('?coupon=after');
    expect(window.location.hash).toBe('#offer');
  });

  it('keeps the coupon when navigating back and forward through cleaned URLs', async () => {
    const { result } = setup();
    act(() => result.current.history.push('/store?coupon=code#items'));
    act(() => result.current.history.push('/docs/intro#next'));
    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location.pathname).toBe('/store'));
    expect(window.location.hash).toBe('#items');
    expect(window.location.search).toBe('');
    expect(result.current.cart.couponCode).toBe('CODE');
    act(() => result.current.history.goForward());
    await waitFor(() => expect(result.current.location.pathname).toBe('/docs/intro'));
    expect(window.location.hash).toBe('#next');
    expect(result.current.cart.couponCode).toBe('CODE');
  });

  it('leaves browser history methods unchanged and preserves later instrumenters on unmount', () => {
    const { unmount } = setup();
    expect(window.history.pushState).toBe(originalPush);
    expect(window.history.replaceState).toBe(originalReplace);
    const laterPush = vi.fn(originalPush);
    const laterReplace = vi.fn(originalReplace);
    window.history.pushState = laterPush;
    window.history.replaceState = laterReplace;
    unmount();
    expect(window.history.pushState).toBe(laterPush);
    expect(window.history.replaceState).toBe(laterReplace);
  });

  it('reads stored coupon only on mount and does not adopt other-tab changes on navigation', () => {
    localStorage.setItem(couponKey, 'ORIGINAL');
    const { result } = setup();
    expect(result.current.cart.couponCode).toBe('ORIGINAL');
    localStorage.setItem(couponKey, 'OTHER-TAB');
    act(() => result.current.history.push('/store?utm=next'));
    expect(result.current.cart.couponCode).toBe('ORIGINAL');
  });

  it('does not resurrect a cleared coupon when storage removal fails', () => {
    localStorage.setItem(couponKey, 'OLD');
    const { result } = setup();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    act(() => result.current.cart.clearCoupon());
    act(() => result.current.history.push('/store?utm=next'));
    expect(result.current.cart.couponCode).toBeNull();
    expect(localStorage.getItem(couponKey)).toBe('OLD');
  });

  it('accepts URL coupons and preserves anchors when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    originalReplace.call(window.history, {}, '', '/store?coupon=hello#details');
    const { result } = setup();
    expect(result.current.cart.couponCode).toBe('HELLO');
    expect(window.location.hash).toBe('#details');
    act(() => result.current.history.push('/store?utm=next'));
    expect(result.current.cart.couponCode).toBe('HELLO');
  });

  it('leaves an empty coupon query alone and falls back to stored coupon', () => {
    localStorage.setItem(couponKey, 'OLD');
    originalReplace.call(window.history, {}, '', '/store?coupon=#details');
    const { result } = setup();
    expect(result.current.cart.couponCode).toBe('OLD');
    expect(window.location.search).toBe('?coupon=');
    expect(window.location.hash).toBe('#details');
  });

  it('preserves whitespace-coupon normalization and removes the parameter', () => {
    originalReplace.call(window.history, {}, '', '/store?coupon=%20%20#details');
    const { result } = setup();
    expect(result.current.cart.couponCode).toBe('');
    expect(localStorage.getItem(couponKey)).toBe('');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#details');
  });
});
