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

  it('shows quick action picker when Add Assertion is clicked', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }));

    // Quick action picker should appear
    expect(screen.getByText('What do you want to check?')).toBeInTheDocument();
    expect(screen.getByText('Contains text')).toBeInTheDocument();
    expect(screen.getByText('Is valid JSON')).toBeInTheDocument();
  });

  it('adds assertion when quick action is clicked', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Open quick action picker
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }));

    // Click "Contains text" quick action
    fireEvent.click(screen.getByText('Contains text'));

    expect(onChange).toHaveBeenCalledWith([{ type: 'icontains', value: '' }]);
  });

  it('adds assertion via "All assertion types" button', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Open quick action picker
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }));

    // Click "All assertion types"
    fireEvent.click(screen.getByRole('button', { name: /All assertion types/i }));

    expect(onChange).toHaveBeenCalledWith([{ type: 'contains', value: '' }]);
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

  it('can cancel the quick action picker', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Open quick action picker
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }));
    expect(screen.getByText('What do you want to check?')).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Picker should be hidden, Add Assertion button should be back
    expect(screen.queryByText('What do you want to check?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Assertion' })).toBeInTheDocument();
  });
});
