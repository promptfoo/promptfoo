import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';

import type { FourthwallProduct } from './types';

const mockProduct: FourthwallProduct = {
  id: 'prod-1',
  slug: 'test-product',
  name: 'Test Product',
  description: '<p>A test product description</p>',
  images: [
    { id: 'img-1', url: 'https://example.com/image1.jpg', width: 800, height: 800 },
    { id: 'img-2', url: 'https://example.com/image2.jpg', width: 800, height: 800 },
  ],
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

describe('ProductCard', () => {
  it('renders product image', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const image = screen.getByRole('img', { name: mockProduct.name });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', mockProduct.images[0].url);
  });

  it('has accessible label', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: `View ${mockProduct.name}` });
    expect(button).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<ProductCard product={mockProduct} onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledWith(mockProduct);
  });

  it('shows skeleton while image loads', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    // Primary image should have opacity 0 initially
    const primaryImage = screen.getByRole('img', { name: mockProduct.name });
    expect(primaryImage).toHaveStyle({ opacity: 0 });
  });

  it('shows image after loading', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const primaryImage = screen.getByRole('img', { name: mockProduct.name });
    fireEvent.load(primaryImage);

    expect(primaryImage).toHaveStyle({ opacity: 1 });
  });

  it('crossfades to hover image on hover when both images loaded', async () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    const primaryImage = screen.getByRole('img', { name: mockProduct.name });
    const hoverImage = screen.getByRole('img', { name: `${mockProduct.name} alternate view` });

    // Load both images
    fireEvent.load(primaryImage);
    fireEvent.load(hoverImage);

    // Initially primary is visible, hover is hidden
    expect(primaryImage).toHaveStyle({ opacity: 1 });
    expect(hoverImage).toHaveStyle({ opacity: 0 });

    // Hover shows second image, hides primary
    fireEvent.mouseEnter(button);
    expect(primaryImage).toHaveStyle({ opacity: 0 });
    expect(hoverImage).toHaveStyle({ opacity: 1 });

    // Mouse leave returns to primary
    fireEvent.mouseLeave(button);
    expect(primaryImage).toHaveStyle({ opacity: 1 });
    expect(hoverImage).toHaveStyle({ opacity: 0 });
  });

  it('displays product name', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });

  it('displays product price', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);
    expect(screen.getByText('$29.99')).toBeInTheDocument();
  });

  it('displays the lowest price when multiple variants exist', () => {
    const multiVariantProduct = {
      ...mockProduct,
      variants: [
        { ...mockProduct.variants[0], id: 'v1', unitPrice: { value: 49.99, currency: 'USD' } },
        { ...mockProduct.variants[0], id: 'v2', unitPrice: { value: 19.99, currency: 'USD' } },
        { ...mockProduct.variants[0], id: 'v3', unitPrice: { value: 39.99, currency: 'USD' } },
      ],
    };

    render(<ProductCard product={multiVariantProduct} onClick={vi.fn()} />);
    expect(screen.getByText('$19.99')).toBeInTheDocument();
  });

  it('handles product with single image', () => {
    const singleImageProduct = {
      ...mockProduct,
      images: [mockProduct.images[0]],
    };

    render(<ProductCard product={singleImageProduct} onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    const image = screen.getByRole('img');

    // Hover should not change image
    fireEvent.mouseEnter(button);
    expect(image).toHaveAttribute('src', singleImageProduct.images[0].url);
  });
});
