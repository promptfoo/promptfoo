import React from 'react';

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { commands, page } from 'vitest/browser';
import { CartProvider } from './CartProvider';
import { ProductGrid } from './ProductGrid';
import { ProductModal } from './ProductModal';

import type { FourthwallProduct } from './types';

const shirt: FourthwallProduct = {
  id: 'shirt',
  type: 'PRODUCT',
  name: 'Shirt',
  slug: 'shirt',
  description: 'A cotton shirt with an embroidered logo. '.repeat(100),
  state: { type: 'AVAILABLE' },
  access: { type: 'PUBLIC' },
  images: [
    {
      url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"/>',
      width: 160,
      height: 160,
    },
  ],
  variants: [
    {
      id: 'shirt-small',
      name: 'Small',
      sku: 'S',
      unitPrice: { value: 25, currency: 'USD' },
      attributes: { size: 'Small' },
      stock: { type: 'UNLIMITED' },
      images: [],
    },
  ],
};

afterEach(cleanup);

it('keeps Close within reach after scrolling through a product on mobile', async () => {
  await page.viewport(320, 568);
  render(
    <CartProvider>
      <ProductGrid products={[shirt]} isLoading={false} error={null} />
      <ProductModal />
    </CartProvider>,
  );

  await commands.tap(page.getByRole('button', { name: 'View Shirt' }).selector);
  const dialog = page.getByRole('dialog');
  const photo = dialog.getByRole('img', { name: 'Shirt - Image 1' });
  const addToCart = dialog.getByRole('button', { name: /Add to Cart/i });
  const close = dialog.getByRole('button', { name: 'Close', exact: true });

  await expect.element(photo).toBeInViewport();
  await expect.element(addToCart).not.toBeInViewport();
  addToCart.element().scrollIntoView({ block: 'end' });
  await expect.element(addToCart).toBeInViewport({ ratio: 0.95 });
  await expect.element(photo).not.toBeInViewport();
  await expect.element(close).toBeInViewport({ ratio: 1 });

  await commands.tap(close.selector);
  await expect.element(dialog).not.toBeInTheDocument();
});
