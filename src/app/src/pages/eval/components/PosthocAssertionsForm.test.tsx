import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PosthocAssertionsForm from './PosthocAssertionsForm';
import type { Assertion } from '@promptfoo/types';

// Mock APIs needed for Radix Select and Popover
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

    // Quick action buttons should be visible
    expect(screen.getByText('LLM evaluates')).toBeInTheDocument();
    expect(screen.getByText('Contains text')).toBeInTheDocument();
    expect(screen.getByText('Is valid JSON')).toBeInTheDocument();
    expect(screen.getByText('Equals exactly')).toBeInTheDocument();
  });

  it('adds assertion when quick action is clicked', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Contains text" quick action
    fireEvent.click(screen.getByText('Contains text'));

    expect(onChange).toHaveBeenCalledWith([{ type: 'icontains', value: '' }]);
  });

  it('adds assertion via "Browse all" popover', async () => {
    const user = userEvent.setup();
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Browse all" link to open popover
    await user.click(screen.getByText(/Browse all \d+\+ assertion types/));

    // Click on "regex" in the popover list (unique, not in quick actions)
    const regexButton = await screen.findByText('regex');
    await user.click(regexButton);

    expect(onChange).toHaveBeenCalledWith([{ type: 'regex', value: '' }]);
  });

  it('updates the assertion value when edited', () => {
    render(
      <PosthocAssertionsForm
        assertions={[{ type: 'equals', value: 'initial value' }]}
        onChange={onChange}
      />,
    );

    // Find the textarea by its placeholder
    const valueInput = screen.getByPlaceholderText('Expected exact output...');
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

  it('keeps quick actions visible after adding an assertion', () => {
    render(<PosthocAssertionsForm assertions={[]} onChange={onChange} />);

    // Click "Is valid JSON" quick action
    fireEvent.click(screen.getByText('Is valid JSON'));

    // Quick actions should still be visible for adding more assertions
    expect(screen.getByText('LLM evaluates')).toBeInTheDocument();
    expect(screen.getByText('Contains text')).toBeInTheDocument();
  });

  it('shows LLM cost warning when LLM assertions are added with targetCount', () => {
    render(
      <PosthocAssertionsForm
        assertions={[{ type: 'llm-rubric', value: 'test criteria' }]}
        onChange={onChange}
        targetCount={50}
      />,
    );

    // Should show the LLM API call warning
    expect(screen.getByText(/1 LLM assertion × 50 test cases/)).toBeInTheDocument();
    expect(screen.getByText(/50 API calls/)).toBeInTheDocument();
  });

  it('does not show LLM cost warning without LLM assertions', () => {
    render(
      <PosthocAssertionsForm
        assertions={[{ type: 'icontains', value: 'test' }]}
        onChange={onChange}
        targetCount={50}
      />,
    );

    // Should not show the LLM API call warning
    expect(screen.queryByText(/API calls/)).not.toBeInTheDocument();
  });
});
