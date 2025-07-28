import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
});
