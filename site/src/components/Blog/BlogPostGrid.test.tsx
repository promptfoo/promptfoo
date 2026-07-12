import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BlogPostGrid from './BlogPostGrid';

vi.mock('./BlogPostCard', () => ({
  default: () => null,
}));

describe('BlogPostGrid', () => {
  it('renders the latest posts heading on the first page', () => {
    render(<BlogPostGrid posts={[]} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Latest Posts' })).toBeInTheDocument();
  });

  it('separates the older posts heading from the page number', () => {
    render(<BlogPostGrid posts={[]} title="Older Posts • Page 2" />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Older Posts 2');
  });
});
