import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './search-input';

describe('SearchInput', () => {
  it('exposes an explicit accessible label and contextual clear action', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SearchInput
        value="needle"
        onChange={handleChange}
        aria-label="Search evaluation results"
        clearLabel="Clear evaluation results search"
      />,
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search evaluation results' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Clear evaluation results search' }),
    );

    expect(handleChange).toHaveBeenCalledWith('');
  });
});
