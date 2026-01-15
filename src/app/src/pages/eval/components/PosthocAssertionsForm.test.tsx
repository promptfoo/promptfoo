import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PosthocAssertionsForm from './PosthocAssertionsForm';
import type { Assertion } from '@promptfoo/types';

// Mock APIs needed for Radix Select
HTMLElement.prototype.hasPointerCapture = vi.fn();
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

describe('PosthocAssertionsForm', () => {
  let onChange: (assertions: Assertion[]) => void;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('adds a new assertion when Add Assertion is clicked', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }));

    expect(onChange).toHaveBeenCalledWith([{ type: 'equals', value: '' }]);
  });

  it('updates the assertion value when edited', () => {
    render(
      <PosthocAssertionsForm
        assertions={[{ type: 'equals', value: 'initial value' }]}
        onChange={onChange}
      />,
    );

    const valueInput = screen.getByRole('textbox', { name: 'Value' });
    fireEvent.change(valueInput, { target: { value: 'updated value' } });

    expect(onChange).toHaveBeenCalledWith([{ type: 'equals', value: 'updated value' }]);
  });

  it('removes an assertion when the delete button is clicked', () => {
    render(
      <PosthocAssertionsForm
        assertions={[{ type: 'equals', value: 'initial value' }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove assertion' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
