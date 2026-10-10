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

  it('separates the heading from the page number on paginated pages', () => {
    render(<BlogPostGrid posts={[]} title="Archive" pageNumber={2} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Archive 2' })).toHaveAttribute(
      'data-is-paginated',
      'true',
    );
  });

  it('renders a custom heading without a page number', () => {
    render(<BlogPostGrid posts={[]} title="Older Posts" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Older Posts' })).toBeInTheDocument();
  });

  it('leaves the title unparsed when the page is not paginated', () => {
    render(<BlogPostGrid posts={[]} title="Older Posts • Page 2" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Older Posts • Page 2' })).toHaveAttribute(
      'data-is-paginated',
      'false',
    );
  });
});
