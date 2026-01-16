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

  it('shows quick action picker by default', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Quick action picker should be visible by default
    expect(screen.getByText('Add assertion')).toBeInTheDocument();
    expect(screen.getByText('Contains text')).toBeInTheDocument();
    expect(screen.getByText('Is valid JSON')).toBeInTheDocument();
  });

  it('adds assertion when quick action is clicked', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Contains text" quick action
    fireEvent.click(screen.getByText('Contains text'));

    expect(onChange).toHaveBeenCalledWith([{ type: 'icontains', value: '' }]);
  });

  it('adds assertion via "Browse all" button', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Browse all 40+ assertion types"
    fireEvent.click(screen.getByRole('button', { name: /Browse all 40\+ assertion types/i }));

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

  it('keeps picker visible after adding an assertion', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Is valid JSON" quick action
    fireEvent.click(screen.getByText('Is valid JSON'));

    // Picker should still be visible for adding more assertions
    expect(screen.getByText('Add assertion')).toBeInTheDocument();
    expect(screen.getByText('Contains text')).toBeInTheDocument();
  });
});
