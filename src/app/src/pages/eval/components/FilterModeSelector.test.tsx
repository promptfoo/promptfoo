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

    // Check that "Show different outputs" option is not present
    expect(screen.queryByText('Show different outputs')).not.toBeInTheDocument();
  });

  it('shows different option when showDifferentOption is true', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption />);

    // Open the dropdown
    const select = screen.getByRole('combobox');
    await user.click(select);

    // Check that "Show different outputs" option is present
    expect(screen.getByText('Show different outputs')).toBeInTheDocument();
  });

  it('includes passes option', async () => {
    const user = userEvent.setup();
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    expect(screen.getByText('Show passes only')).toBeInTheDocument();
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

    expect(screen.getByRole('option', { name: 'Show highlights only' })).toBeInTheDocument();
  });

  it('should call onChange when a different filter mode is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterModeSelector filterMode="all" onChange={onChange} />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    const failuresOption = screen.getByText('Show failures only');
    await user.click(failuresOption);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('failures');
  });
});
