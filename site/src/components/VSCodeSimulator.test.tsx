import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import VSCodeSimulator from '../../blog/unicode-threats/components/VSCodeSimulator';

describe('VSCodeSimulator', () => {
  it('shows malicious code after generating a registration route with hidden threats enabled', async () => {
    const user = userEvent.setup();

    render(<VSCodeSimulator />);

    await user.selectOptions(screen.getByRole('combobox'), 'route');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findAllByText(/Create a user registration route/i)).not.toHaveLength(0);
    expect(
      await screen.findByText(/global\.latestAuthToken/i, undefined, {
        timeout: 2500,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This file contains malicious code that wouldn't be visible/i),
    ).toBeInTheDocument();
  });

  it('renders the safe password-strength version when hidden threats are disabled', async () => {
    const user = userEvent.setup();

    render(<VSCodeSimulator />);

    await user.click(screen.getByLabelText('Show hidden threats'));
    await user.selectOptions(screen.getByRole('combobox'), 'security');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/Password should be at least 12 characters/i, undefined, {
        timeout: 2500,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/following best security practices/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/This file contains malicious code that wouldn't be visible/i),
    ).toBeNull();
  });
});
