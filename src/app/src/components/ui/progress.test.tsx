import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from './progress';

describe('Progress', () => {
  it('renders progress bar', () => {
    const { container } = render(<Progress value={50} />);
    const progress = container.firstChild;
    expect(progress).toBeInTheDocument();
  });

  it('displays correct progress value', () => {
    const { container } = render(<Progress value={75} />);
    const indicator = container.querySelector('[style*="transform"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-25%)' });
  });

  it('handles 0% progress', () => {
    const { container } = render(<Progress value={0} />);
    const indicator = container.querySelector('[style*="transform"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
  });

  it('handles 100% progress', () => {
    const { container } = render(<Progress value={100} />);
    const indicator = container.querySelector('[style*="transform"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('handles undefined value', () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector('[style*="transform"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
  });

  it('applies custom className', () => {
    const { container } = render(<Progress value={50} className="custom-progress" />);
    const progress = container.firstChild;
    expect(progress).toHaveClass('custom-progress');
  });

  it('applies correct default styles', () => {
    const { container } = render(<Progress value={50} />);
    const progress = container.firstChild;
    expect(progress).toHaveClass('h-2', 'w-full', 'rounded-full', 'bg-secondary');
  });
});
