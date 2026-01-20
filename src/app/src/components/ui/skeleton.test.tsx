import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders skeleton', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild;
    expect(skeleton).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('animate-pulse', 'rounded-md', 'bg-muted');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-skeleton" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('custom-skeleton');
  });

  it('supports custom dimensions', () => {
    const { container } = render(<Skeleton className="h-12 w-full" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('h-12', 'w-full');
  });

  it('supports all HTML div attributes', () => {
    const { container } = render(<Skeleton data-testid="test-skeleton" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveAttribute('data-testid', 'test-skeleton');
  });
});
