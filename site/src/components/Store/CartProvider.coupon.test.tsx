import React from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartProvider, useCartContext } from './CartProvider';

function Coupon() {
  const { couponCode } = useCartContext();
  return <output aria-label="Coupon">{couponCode}</output>;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

function renderCoupon() {
  return render(
    <CartProvider>
      <Coupon />
    </CartProvider>,
  );
}

describe('coupon URL cleanup', () => {
  it.each([
    ['/store?coupon=save10#size-guide', '/store#size-guide'],
    ['/store?coupon=save10&utm_source=mail#size-guide', '/store?utm_source=mail#size-guide'],
  ])('preserves the fragment when consuming %s on mount', (entry, expected) => {
    const historyState = { position: 'store-entry' };
    window.history.replaceState(historyState, '', entry);
    const historyLength = window.history.length;

    renderCoupon();

    expect(screen.getByLabelText('Coupon')).toHaveTextContent('SAVE10');
    expect(localStorage.getItem('promptfoo_coupon_code')).toBe('SAVE10');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(expected);
    expect(window.history.state).toEqual(historyState);
    expect(window.history.length).toBe(historyLength);
  });

  it('preserves encoded fragments and unrelated query values after client-side navigation', () => {
    renderCoupon();
    const historyState = { position: 'new-route' };

    act(() => {
      window.history.pushState(
        historyState,
        '',
        '/store?coupon=save20&campaign=summer#size%20guide',
      );
    });

    expect(screen.getByLabelText('Coupon')).toHaveTextContent('SAVE20');
    expect(window.location.search).toBe('?campaign=summer');
    expect(window.location.hash).toBe('#size%20guide');
    expect(window.history.state).toEqual(historyState);
  });

  it('preserves the fragment even when coupon storage is unavailable', () => {
    window.history.replaceState(null, '', '/store?coupon=save10#size-guide');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });

    renderCoupon();

    expect(screen.getByLabelText('Coupon')).toHaveTextContent('SAVE10');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#size-guide');
  });
});
