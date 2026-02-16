import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from './InfoBox';

describe('InfoBox', () => {
  it.each([
    ['info', 'bg-blue-50', 'border-blue-200', 'text-blue-700'],
    ['tip', 'bg-amber-50', 'border-amber-200', 'text-amber-700'],
    ['help', 'bg-purple-50', 'border-purple-200', 'text-purple-700'],
  ] as const)('renders %s variant with correct styling', (variant, bgClass, borderClass, textClass) => {
    render(<InfoBox variant={variant}>Test message</InfoBox>);

    const container = screen.getByText('Test message').closest('div')?.parentElement;
    expect(container).toHaveClass(bgClass, borderClass, textClass);
    expect(container?.querySelector('svg')).toBeInTheDocument();
  });

  it('defaults to info variant when no variant is provided', () => {
    render(<InfoBox>Default message</InfoBox>);

    const container = screen.getByText('Default message').closest('div')?.parentElement;
    expect(container).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-700');
  });

  it('renders complex JSX children', () => {
    render(
      <InfoBox variant="tip">
        <div>
          <strong>Bold text</strong> and <em>italic text</em>
        </div>
      </InfoBox>,
    );

    expect(screen.getByText('Bold text')).toBeInTheDocument();
    expect(screen.getByText('italic text')).toBeInTheDocument();
  });

  it('applies custom className along with default classes', () => {
    render(
      <InfoBox variant="info" className="custom-class">
        Custom styled
      </InfoBox>,
    );

    const container = screen.getByText('Custom styled').closest('div')?.parentElement;
    expect(container).toHaveClass('custom-class', 'bg-blue-50', 'border-blue-200');
  });

  it('has correct base structure', () => {
    render(<InfoBox variant="info">Test content</InfoBox>);

    const container = screen.getByText('Test content').closest('div')?.parentElement;
    expect(container).toHaveClass('rounded-lg', 'border', 'p-4', 'flex', 'gap-3');

    const icon = container?.querySelector('svg');
    expect(icon).toHaveClass('size-5', 'shrink-0', 'mt-0.5');

    const contentDiv = screen.getByText('Test content');
    expect(contentDiv).toHaveClass('text-sm', 'leading-relaxed', 'flex-1');
  });
});
