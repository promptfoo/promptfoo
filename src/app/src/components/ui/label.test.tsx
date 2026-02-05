import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './label';

describe('Label', () => {
  it('renders label', () => {
    render(<Label>Label text</Label>);
    const label = screen.getByText('Label text');
    expect(label).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    render(<Label>Label</Label>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('text-sm', 'font-medium');
  });

  it('applies custom className', () => {
    render(<Label className="custom-label">Label</Label>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('custom-label');
  });

  it('associates with input using htmlFor', () => {
    render(
      <>
        <Label htmlFor="test-input">Test Label</Label>
        <input id="test-input" />
      </>,
    );
    const label = screen.getByText('Test Label');
    const input = screen.getByRole('textbox');
    expect(label).toHaveAttribute('for', 'test-input');
    expect(input).toHaveAttribute('id', 'test-input');
  });
});
