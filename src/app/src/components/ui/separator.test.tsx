import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders horizontal separator by default', () => {
    const { container } = render(<Separator />);
    const separator = container.firstChild;
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('renders vertical separator', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstChild;
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
  });

  it('applies correct horizontal styles', () => {
    const { container } = render(<Separator orientation="horizontal" />);
    const separator = container.firstChild;
    expect(separator).toHaveClass('h-px', 'w-full');
  });

  it('applies correct vertical styles', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstChild;
    expect(separator).toHaveClass('h-full', 'w-px');
  });

  it('is decorative by default', () => {
    const { container } = render(<Separator />);
    const separator = container.firstChild;
    expect(separator).toHaveAttribute('role', 'none');
  });

  it('can be non-decorative', () => {
    const { container } = render(<Separator decorative={false} />);
    const separator = container.firstChild;
    expect(separator).toHaveAttribute('role', 'separator');
  });

  it('applies custom className', () => {
    const { container } = render(<Separator className="custom-separator" />);
    const separator = container.firstChild;
    expect(separator).toHaveClass('custom-separator');
  });

  it('applies bg-border class for horizontal orientation', () => {
    const { container } = render(<Separator orientation="horizontal" />);
    const separator = container.firstChild;
    expect(separator).toHaveClass('bg-border');
  });

  it('applies bg-border class for vertical orientation', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstChild;
    expect(separator).toHaveClass('bg-border');
  });
});
