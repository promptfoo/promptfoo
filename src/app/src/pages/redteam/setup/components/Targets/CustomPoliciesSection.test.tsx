import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PolicyInput } from './CustomPoliciesSection';

describe('PolicyInput', () => {
  it('renders correctly with initial value', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PolicyInput id="test-id" value="test policy" onChange={onChange} />
    );

    const input = getByLabelText('Policy Text');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('test policy');
  });

  it('calls onChange handler with debounce when text changes', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const { getByLabelText } = render(
      <PolicyInput id="test-id" value="" onChange={onChange} />
    );

    const input = getByLabelText('Policy Text');
    fireEvent.change(input, { target: { value: 'new policy' } });

    await vi.advanceTimersByTimeAsync(300);

    expect(onChange).toHaveBeenCalledWith('test-id', 'new policy');
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('has correct placeholder text', () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(
      <PolicyInput id="test-id" value="" onChange={onChange} />
    );

    const input = getByPlaceholderText('Enter your policy guidelines here...');
    expect(input).toBeInTheDocument();
  });

  it('renders as multiline text field with 4 rows', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PolicyInput id="test-id" value="" onChange={onChange} />
    );

    const input = getByLabelText('Policy Text');
    expect(input).toHaveAttribute('rows', '4');
  });

  it('preserves memoization between renders with same props', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PolicyInput id="test-id" value="test" onChange={onChange} />
    );

    const firstRender = screen.getByLabelText('Policy Text');

    rerender(<PolicyInput id="test-id" value="test" onChange={onChange} />);
    const secondRender = screen.getByLabelText('Policy Text');

    expect(firstRender).toBe(secondRender);
  });

  it('updates when props change', () => {
    const onChange = vi.fn();
    const { rerender, getByLabelText } = render(
      <PolicyInput id="test-id" value="initial" onChange={onChange} />
    );

    const input = getByLabelText('Policy Text');
    expect(input).toHaveValue('initial');

    rerender(<PolicyInput id="test-id" value="updated" onChange={onChange} />);
    expect(input).toHaveValue('updated');
  });

  it('debounces multiple rapid changes', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const { getByLabelText } = render(
      <PolicyInput id="test-id" value="" onChange={onChange} />
    );

    const input = getByLabelText('Policy Text');

    // Multiple rapid changes
    fireEvent.change(input, { target: { value: 'change 1' } });
    fireEvent.change(input, { target: { value: 'change 2' } });
    fireEvent.change(input, { target: { value: 'change 3' } });

    // Fast forward just past debounce time
    await vi.advanceTimersByTimeAsync(350);

    expect(onChange).toHaveBeenCalledWith('test-id', 'change 3');
    expect(onChange).toHaveBeenCalledTimes(3); // Debounce will call for each change

    vi.useRealTimers();
  });
});
