import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SensitiveTextField from './SensitiveTextField';

describe('SensitiveTextField', () => {
  it('keeps multiple fields independently labeled and retains an explicit id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <SensitiveTextField
          label="First secret"
          helperText="First guidance"
          value="one"
          onChange={onChange}
        />
        <SensitiveTextField
          id="second-secret"
          label="Second secret"
          helperText="Second guidance"
          value="two"
          onChange={onChange}
        />
      </>,
    );

    const first = screen.getByLabelText('First secret');
    const second = screen.getByLabelText('Second secret');
    expect(first.id).not.toBe(second.id);
    expect(second.id).toBe('second-secret');
    expect(first).toHaveAccessibleDescription('First guidance');
    expect(second).toHaveAccessibleDescription('Second guidance');
    await user.click(screen.getByRole('button', { name: 'Show first secret' }));
    expect(first).toHaveAttribute('type', 'text');
    expect(second).toHaveAttribute('type', 'password');
    await user.type(second, '3');
    expect(onChange).toHaveBeenCalledOnce();
  });

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

    await user.click(screen.getByRole('button', { name: 'Show pfx passphrase' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide pfx passphrase' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide pfx passphrase' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('sets autofill and spelling hints for secret values', () => {
    render(<SensitiveTextField label="Keystore Passphrase" value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Keystore Passphrase');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('data-1p-ignore');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAttribute('data-form-type', 'other');
  });
});
