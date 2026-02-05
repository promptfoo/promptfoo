import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './spinner';

describe('Spinner', () => {
  it('renders spinner with default size', () => {
    const { container } = render(<Spinner />);
    const spinner = container.firstChild;
    expect(spinner).toBeInTheDocument();
  });

  it('renders with small size', () => {
    const { container } = render(<Spinner size="sm" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-4', 'w-4');
  });

  it('renders with medium size', () => {
    const { container } = render(<Spinner size="md" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-6', 'w-6');
  });

  it('renders with large size', () => {
    const { container } = render(<Spinner size="lg" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-8', 'w-8');
  });

  it('has spinning animation', () => {
    const { container } = render(<Spinner />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('animate-spin');
  });

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom-spinner" />);
    const spinner = container.firstChild;
    expect(spinner).toHaveClass('custom-spinner');
  });

  it('centers content by default', () => {
    const { container } = render(<Spinner />);
    const spinner = container.firstChild;
    expect(spinner).toHaveClass('flex', 'items-center', 'justify-center');
  });
});
