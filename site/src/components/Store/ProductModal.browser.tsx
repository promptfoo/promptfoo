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

it.each([
  { attribute: 'Size', value: 'Large', image: 'large', count: 1 },
  { attribute: 'Color', value: 'Red', image: 'product-1', count: 2 },
])(
  'resets the image when changing $attribute to $value',
  async ({ attribute, value, image, count }) => {
    const makeImage = (name: string) => ({
      ...shirt.images[0],
      url: `${shirt.images[0].url}#${name}`,
    });
    const product: FourthwallProduct = {
      ...shirt,
      description: 'A shirt with variant-specific images.',
      images: [makeImage('product-1'), makeImage('product-2')],
      variants: [
        {
          ...shirt.variants[0],
          attributes: { size: 'Small', color: 'Blue' },
          images: [makeImage('small-1'), makeImage('small-2'), makeImage('small-3')],
        },
        {
          ...shirt.variants[0],
          id: 'shirt-large',
          attributes: { size: 'Large', color: 'Blue' },
          images: [makeImage('large')],
        },
        {
          ...shirt.variants[0],
          id: 'shirt-red',
          attributes: { size: 'Large', color: 'Red' },
          images: [],
        },
      ],
    };
    await page.viewport(1280, 900);
    render(
      <CartProvider>
        <ProductGrid products={[product]} isLoading={false} error={null} />
        <ProductModal />
      </CartProvider>,
    );

    await page.getByRole('button', { name: 'View Shirt' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next image' }).click();
    await dialog.getByRole('button', { name: 'Next image' }).click();
    await expect.element(dialog.getByRole('img', { name: 'Shirt - Image 3' })).toBeVisible();
    await expect.element(dialog.getByText('3 / 3', { exact: true })).toBeVisible();

    await dialog.getByRole('combobox', { name: attribute }).click();
    await page.getByRole('option', { name: value, exact: true }).click();

    const photo = dialog.getByRole('img', { name: 'Shirt - Image 1' });
    await expect.element(photo).toBeVisible();
    await expect.element(photo).toHaveAttribute('src', makeImage(image).url);
    if (count > 1) {
      await expect.element(dialog.getByText(`1 / ${count}`, { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Next image' }).click();
      await expect.element(dialog.getByRole('img', { name: 'Shirt - Image 2' })).toBeVisible();
      await expect.element(dialog.getByText('2 / 2', { exact: true })).toBeVisible();
    } else {
      await expect
        .element(dialog.getByRole('button', { name: 'Next image' }))
        .not.toBeInTheDocument();
    }
  },
);
