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

    // Image should have opacity 0 initially
    const image = screen.getByRole('img');
    expect(image).toHaveStyle({ opacity: 0 });
  });

  it('shows image after loading', () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const image = screen.getByRole('img');
    fireEvent.load(image);

    expect(image).toHaveStyle({ opacity: 1 });
  });

  it('changes image on hover when multiple images exist', async () => {
    render(<ProductCard product={mockProduct} onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    const image = screen.getByRole('img');

    // Initially shows first image
    expect(image).toHaveAttribute('src', mockProduct.images[0].url);

    // Hover shows second image
    fireEvent.mouseEnter(button);
    expect(image).toHaveAttribute('src', mockProduct.images[1].url);

    // Mouse leave returns to first image
    fireEvent.mouseLeave(button);
    expect(image).toHaveAttribute('src', mockProduct.images[0].url);
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
