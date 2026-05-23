import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useCartContext } from './CartProvider';
import { ProductModal } from './ProductModal';

import type { FourthwallProduct } from './types';

vi.mock('./CartProvider', () => ({
  useCartContext: vi.fn(),
}));

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
  } as ReturnType<typeof useCartContext>);

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
});
