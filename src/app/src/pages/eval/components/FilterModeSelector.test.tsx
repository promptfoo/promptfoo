import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterModeSelector } from './FilterModeSelector';

const noop = () => {};

describe('FilterModeSelector', () => {
  it('hides different option when showDifferentOption is false', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption={false} />);

    // Open the dropdown
    const select = screen.getByRole('combobox');
    await user.click(select);

    // Check that "Different outputs" option is not present
    expect(screen.queryByText('Different outputs')).not.toBeInTheDocument();
  });

  it('shows different option when showDifferentOption is true', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption />);

    // Open the dropdown
    const select = screen.getByRole('combobox');
    await user.click(select);

    // Check that "Different outputs" option is present
    expect(screen.getByText('Different outputs')).toBeInTheDocument();
  });

  it('includes passes option', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    expect(screen.getByText('Passes only')).toBeInTheDocument();
  });

  it('handles invalid filterMode value', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<FilterModeSelector filterMode="all" onChange={noop} />);

    const select = screen.getByRole('combobox');

    expect(select).toBeInTheDocument();

    expect(select).not.toHaveValue('invalid-mode');

    consoleSpy.mockRestore();
  });

  it('handles empty string filterMode', () => {
    render(<FilterModeSelector filterMode="all" onChange={noop} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('displays a valid filterMode value that is not in BASE_OPTIONS', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="highlights" onChange={noop} />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    expect(screen.getByRole('option', { name: 'Highlights only' })).toBeInTheDocument();
  });

  it('should call onChange when a different filter mode is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterModeSelector filterMode="all" onChange={onChange} />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    const failuresOption = screen.getByText('Failures only');
    await user.click(failuresOption);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('failures');
  });
});
