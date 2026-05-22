import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SensitiveTextField from './SensitiveTextField';

describe('SensitiveTextField', () => {
  it('associates its label and helper guidance when no explicit id is provided', () => {
    render(
      <SensitiveTextField
        label="Credential"
        helperText="Stored in provider configuration."
        required
        value=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/^Credential\s*\*?$/);
    expect(input).toHaveAccessibleName('Credential');
    expect(input).toHaveAccessibleDescription('Stored in provider configuration.');
    expect(input).toBeRequired();
  });

  it('names the visibility control for the specific protected value', async () => {
    const user = userEvent.setup();
    render(<SensitiveTextField label="PFX Passphrase" value="secret" onChange={vi.fn()} />);

    const input = screen.getByLabelText('PFX Passphrase');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show PFX Passphrase' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide PFX Passphrase' })).toBeInTheDocument();
  });
});
