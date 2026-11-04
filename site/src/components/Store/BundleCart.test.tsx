import React from 'react';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartDrawer } from './CartDrawer';
import { CartProvider } from './CartProvider';
import { ProductGrid } from './ProductGrid';
import { ProductModal } from './ProductModal';
import { useCart, useProducts } from './useFourthwall';

import type { FourthwallBundle, FourthwallCart, FourthwallProduct } from './types';

const product: FourthwallProduct = {
  type: 'PRODUCT',
  id: 'shirt',
  name: 'Shirt',
  slug: 'shirt',
  description: 'Shirt',
  state: { type: 'AVAILABLE' },
  access: { type: 'PUBLIC' },
  images: [],
  variants: [
    {
      id: 'shirt-small',
      name: 'Small',
      sku: 'S',
      attributes: { size: 'Small' },
      unitPrice: { value: 25, currency: 'USD' },
      stock: { type: 'UNLIMITED' },
      images: [],
    },
  ],
};
const sticker = {
  ...product,
  id: 'sticker',
  name: 'Sticker',
  slug: 'sticker',
  variants: [
    {
      ...product.variants[0],
      id: 'sticker-small',
      name: 'Small',
      stock: { type: 'LIMITED' as const, inStock: 0 },
    },
    {
      ...product.variants[0],
      id: 'sticker-large',
      name: 'Large',
      attributes: { size: 'Large' },
      stock: { type: 'LIMITED' as const, inStock: 4 },
    },
  ],
};
const bundle: FourthwallBundle = {
  description: 'Choose each item',
  state: { type: 'AVAILABLE' },
  access: { type: 'PUBLIC' },
  images: [],
  type: 'BUNDLE',
  id: 'bundle',
  name: 'Sticker Pack',
  slug: 'sticker-pack',
  price: { value: 30, currency: 'USD' },
  offers: [product, sticker],
  pricingStrategy: { type: 'FIXED_PRICE' },
};
const regularCart: FourthwallCart = {
  id: 'existing-cart',
  items: [{ variant: product.variants[0], quantity: 1 }],
};
const mixedCart: FourthwallCart = {
  id: regularCart.id,
  items: [
    ...regularCart.items,
    ...[product.variants[0], sticker.variants[1]].map((variant) => ({
      variant,
      quantity: 1,
      groupedBy: { type: 'BUNDLE' as const, bundleId: bundle.id, groupedId: 'group-1' },
    })),
  ],
};
const bundleRequest = [
  { variantId: 'shirt-small', quantity: 1, bundleId: 'bundle' },
  { variantId: 'sticker-large', quantity: 1, bundleId: 'bundle' },
];
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function Catalog() {
  const { products, isLoading, error } = useProducts();
  return (
    <>
      <ProductGrid products={products} isLoading={isLoading} error={error} />
      <ProductModal />
      <CartDrawer />
    </>
  );
}
function renderCatalog(
  initialCart: FourthwallCart | null = regularCart,
  entry = bundle,
  failure = false,
) {
  if (initialCart) localStorage.setItem('promptfoo_cart_id', initialCart.id);
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/collections/')) {
      return response({
        results:
          url.searchParams.get('page') === '0'
            ? [product]
            : url.searchParams.get('page') === '1'
              ? [entry]
              : [],
      });
    }
    if (!init?.method) return response(initialCart);
    return response(mixedCart, failure ? 500 : 200);
  });
  return render(
    <CartProvider>
      <Catalog />
    </CartProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetch).mockReset();
});
afterEach(() => {
  localStorage.clear();
  vi.mocked(fetch).mockReset();
});

describe('bundle shopping', () => {
  it.each([true, false])(
    'keeps bundle selections in one cart (existing cart: %s)',
    async (existing) => {
      const user = userEvent.setup();
      renderCatalog(existing ? regularCart : null);
      await user.click(await screen.findByRole('button', { name: 'View Sticker Pack' }));
      expect(screen.getByRole('combobox', { name: 'Sticker' })).toHaveTextContent('Large');
      await user.click(screen.getByRole('combobox', { name: 'Sticker' }));
      expect(screen.getByRole('option', { name: 'Small' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await user.click(screen.getByRole('option', { name: 'Large' }));
      await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
      await screen.findByRole('button', { name: 'Checkout' });
      const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(writes).toHaveLength(1);
      expect(new URL(String(writes[0][0])).pathname).toBe(
        existing ? '/v1/carts/existing-cart/add' : '/v1/carts',
      );
      expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ items: bundleRequest });
      expect(localStorage.getItem('promptfoo_cart_id')).toBe(mixedCart.id);
      // One independent item and one complete bundle, even with the same variant in both.
      expect(screen.getAllByRole('button', { name: 'Remove item' })).toHaveLength(2);
      expect(screen.getByText('Bundle pricing applied at checkout')).toBeInTheDocument();
    },
  );

  it('keeps selections and the original cart when adding fails', async () => {
    const user = userEvent.setup();
    renderCatalog(regularCart, bundle, true);
    await user.click(await screen.findByRole('button', { name: 'View Sticker Pack' }));
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API error: 500');
    expect(screen.getByRole('combobox', { name: 'Sticker' })).toHaveTextContent('Large');
    expect(localStorage.getItem('promptfoo_cart_id')).toBe(regularCart.id);
  });

  it('does not add sold-out bundles', async () => {
    const user = userEvent.setup();
    renderCatalog(null, { ...bundle, state: { type: 'SOLD_OUT' } });
    await user.click(await screen.findByRole('button', { name: 'View Sticker Pack' }));
    expect(screen.getByRole('button', { name: 'Out of Stock' })).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
});

describe('bundle cart edits', () => {
  async function loadCart(cart = mixedCart) {
    localStorage.setItem('promptfoo_cart_id', cart.id);
    vi.mocked(fetch).mockResolvedValueOnce(response(cart));
    const hook = renderHook(() => useCart());
    await waitFor(() => expect(hook.result.current.cart).toEqual(cart));
    return hook;
  }

  it.each([1, 2])(
    'counts a quantity-%s bundle once alongside an independent item',
    async (quantity) => {
      const cart = {
        ...mixedCart,
        items: mixedCart.items.map((item) => ({
          ...item,
          quantity: item.groupedBy ? quantity : 1,
        })),
      };
      const { result } = await loadCart(cart);
      expect(result.current.itemCount).toBe(1 + quantity);
    },
  );

  it('changes the entire bundle and preserves independent items and other bundle configurations', async () => {
    const otherBundleItems = mixedCart.items.slice(1).map((item) => ({
      ...item,
      variant: { ...item.variant, id: `${item.variant.id}-other` },
      groupedBy: { ...item.groupedBy!, groupedId: 'group-2' },
      quantity: 3,
    }));
    const cart = { ...mixedCart, items: [...mixedCart.items, ...otherBundleItems] };
    const { result } = await loadCart(cart);
    expect(result.current.itemCount).toBe(5);
    const updated = {
      ...cart,
      id: 'replacement-cart',
      items: cart.items.map((item) => ({
        ...item,
        quantity: item.groupedBy?.groupedId === 'group-1' ? 2 : item.quantity,
      })),
    };
    vi.mocked(fetch).mockImplementation(async () => response(updated));
    await act(async () => {
      await result.current.updateQuantity(cart.items[1], 2);
    });
    const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v1/carts',
      '/v1/carts/replacement-cart/add',
      '/v1/carts/replacement-cart/add',
    ]);
    expect(writes.map(([, init]) => JSON.parse(String(init?.body)).items)).toEqual([
      [{ variantId: 'shirt-small', quantity: 1 }],
      bundleRequest.map((item) => ({ ...item, quantity: 2 })),
      otherBundleItems.map((item) => ({
        variantId: item.variant.id,
        quantity: 3,
        bundleId: 'bundle',
      })),
    ]);
    expect(result.current.cart).toEqual(updated);
    expect(result.current.itemCount).toBe(6);
    expect(localStorage.getItem('promptfoo_cart_id')).toBe('replacement-cart');
  });

  it('removes every bundle component without removing an independent copy of the same variant', async () => {
    const { result } = await loadCart();
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...regularCart, id: 'replacement-cart' }));
    await act(async () => {
      await result.current.removeFromCart(mixedCart.items[1]);
    });
    expect(JSON.parse(String(vi.mocked(fetch).mock.lastCall?.[1]?.body))).toEqual({
      items: [{ variantId: 'shirt-small', quantity: 1 }],
    });
    expect(result.current.cart?.items).toEqual(regularCart.items);
    expect(result.current.itemCount).toBe(1);
  });

  it('keeps the original cart if a later replacement batch fails', async () => {
    const { result } = await loadCart();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ ...regularCart, id: 'unfinished-cart' }))
      .mockResolvedValueOnce(response({}, 500));
    await act(async () => {
      await expect(result.current.updateQuantity(mixedCart.items[1], 2)).rejects.toThrow(
        'API error: 500',
      );
    });
    expect(result.current.cart).toEqual(mixedCart);
    expect(localStorage.getItem('promptfoo_cart_id')).toBe(mixedCart.id);
    expect(result.current.error).toContain('API error: 500');
  });

  it('clears a cart when its last bundle is removed', async () => {
    const cart = { ...mixedCart, items: mixedCart.items.slice(1) };
    const { result } = await loadCart(cart);
    await act(async () => {
      await result.current.removeFromCart(cart.items[0]);
    });
    expect(result.current.cart).toBeNull();
    expect(result.current.itemCount).toBe(0);
    expect(localStorage.getItem('promptfoo_cart_id')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
