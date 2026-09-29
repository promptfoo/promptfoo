import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCartContext } from './CartProvider';
import { ProductModal } from './ProductModal';

import type { FourthwallProduct } from './types';

vi.mock('./CartProvider', () => ({
  useCartContext: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

const mockProduct: FourthwallProduct = {
  id: 'prod-1',
  slug: 'test-product',
  name: 'Test Product',
  description: '',
  state: { type: 'AVAILABLE' },
  access: { type: 'PUBLIC' },
  images: [{ url: 'https://example.com/product.jpg', width: 800, height: 800 }],
  variants: [
    {
      id: 'var-1',
      name: 'Default',
      sku: 'TEST-001',
      unitPrice: { value: 29.99, currency: 'USD' },
      stock: { type: 'UNLIMITED' },
      images: [],
      attributes: {},
    },
  ],
};

function renderModal(product: FourthwallProduct, addToCart = vi.fn()) {
  vi.mocked(useCartContext).mockReturnValue({
    selectedProduct: product,
    closeProductModal: vi.fn(),
    addToCart,
    isLoading: false,
    cart: null,
    error: null,
    itemCount: 0,
    removeFromCart: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
    isCartOpen: false,
    openCart: vi.fn(),
    closeCart: vi.fn(),
    openProductModal: vi.fn(),
    couponCode: null,
    clearCoupon: vi.fn(),
  });

  render(<ProductModal />);
  return addToCart;
}

describe('ProductModal', () => {
  it('prevents purchases for products Fourthwall marks sold out', async () => {
    const addToCart = renderModal({ ...mockProduct, state: { type: 'SOLD_OUT' } });
    const button = await screen.findByRole('button', { name: 'Sold Out' });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('allows purchases when limited inventory remains', async () => {
    const addToCart = vi.fn().mockResolvedValue(undefined);
    renderModal(
      {
        ...mockProduct,
        variants: [
          {
            ...mockProduct.variants[0],
            stock: { type: 'LIMITED', inStock: 2 },
          },
        ],
      },
      addToCart,
    );

    const button = await screen.findByRole('button', { name: 'Add to Cart' });
    expect(button).toBeEnabled();

    await userEvent.setup().click(button);
    expect(addToCart).toHaveBeenCalledWith('var-1', 1);
  });

  it('selects a purchasable variant when the first variant is unavailable', async () => {
    const addToCart = vi.fn().mockResolvedValue(undefined);
    renderModal(
      {
        ...mockProduct,
        variants: [
          {
            ...mockProduct.variants[0],
            stock: { type: 'LIMITED', inStock: 0 },
          },
          {
            ...mockProduct.variants[0],
            id: 'var-2',
            name: 'Available option',
            sku: 'TEST-002',
            stock: { type: 'LIMITED', inStock: 2 },
          },
        ],
      },
      addToCart,
    );

    const button = await screen.findByRole('button', { name: 'Add to Cart' });
    expect(button).toBeEnabled();

    await userEvent.setup().click(button);
    expect(addToCart).toHaveBeenCalledWith('var-2', 1);
  });

  it('blocks a selected out-of-stock variant while another variant is available', async () => {
    const addToCart = renderModal({
      ...mockProduct,
      variants: [
        { ...mockProduct.variants[0], attributes: { size: 'Small' } },
        {
          ...mockProduct.variants[0],
          id: 'var-2',
          attributes: { size: 'Large' },
          stock: { type: 'LIMITED', inStock: 0 },
        },
      ],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Large' }));
    expect(screen.getByRole('button', { name: 'Out of Stock' })).toBeDisabled();
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('disables purchases when the product has no variants', async () => {
    const addToCart = renderModal({ ...mockProduct, variants: [] });
    expect(await screen.findByRole('button', { name: 'Sold Out' })).toBeDisabled();
    expect(addToCart).not.toHaveBeenCalled();
  });
});
