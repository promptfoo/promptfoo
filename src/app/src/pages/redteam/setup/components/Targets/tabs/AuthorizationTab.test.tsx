import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuthorizationTab from './AuthorizationTab';

import type { HttpProviderOptions } from '../../../types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const secretFields: Array<{
  label: string;
  config: NonNullable<HttpProviderOptions['config']>;
  group: 'auth' | 'signatureAuth';
  field: string;
  required: boolean;
}> = [
  {
    label: 'Client Secret',
    config: {
      auth: {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'client',
        clientSecret: 'fixture-secret',
        tokenUrl: 'https://example.test/token',
      },
    },
    group: 'auth',
    field: 'clientSecret',
    required: true,
  },
  {
    label: 'Password',
    config: {
      auth: {
        type: 'oauth',
        grantType: 'password',
        username: 'user',
        password: 'fixture-secret',
        tokenUrl: 'https://example.test/token',
      },
    },
    group: 'auth',
    field: 'password',
    required: true,
  },
  {
    label: 'Password',
    config: { auth: { type: 'basic', username: 'user', password: 'fixture-secret' } },
    group: 'auth',
    field: 'password',
    required: true,
  },
  {
    label: 'Token',
    config: { auth: { type: 'bearer', token: 'fixture-secret' } },
    group: 'auth',
    field: 'token',
    required: true,
  },
  {
    label: 'API Key Value',
    config: {
      auth: { type: 'api_key', value: 'fixture-secret', placement: 'header', keyName: 'X-Key' },
    },
    group: 'auth',
    field: 'value',
    required: true,
  },
  {
    label: 'Keystore Password',
    config: {
      signatureAuth: {
        enabled: true,
        certificateType: 'jks',
        keystorePath: '/tmp/fixture.jks',
        keystorePassword: 'fixture-secret',
      },
    },
    group: 'signatureAuth',
    field: 'keystorePassword',
    required: false,
  },
  {
    label: 'PFX Password',
    config: {
      signatureAuth: {
        enabled: true,
        certificateType: 'pfx',
        pfxPath: '/tmp/fixture.pfx',
        pfxPassword: 'fixture-secret',
      },
    },
    group: 'signatureAuth',
    field: 'pfxPassword',
    required: false,
  },
];

function StatefulAuthorization({ config }: { config: HttpProviderOptions['config'] }) {
  const [provider, setProvider] = useState<HttpProviderOptions>({ id: 'http', config });
  return (
    <AuthorizationTab
      selectedTarget={provider}
      updateCustomTarget={(field, value) =>
        setProvider((current) => ({
          ...current,
          config: { ...current.config, [field]: value },
        }))
      }
    />
  );
}

describe('AuthorizationTab secret fields', () => {
  it.each(secretFields)(
    'keeps $label accessible and preserves other $group fields when editing',
    async ({ label, config, group, field, required }) => {
      const user = userEvent.setup();
      const updateCustomTarget = vi.fn();
      render(
        <AuthorizationTab
          selectedTarget={{ id: 'http', config }}
          updateCustomTarget={updateCustomTarget}
        />,
      );
      const input = screen.getByLabelText(new RegExp(`^${label}\\s*\\*?$`));
      expect(input).toHaveAccessibleName(label);
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toHaveAttribute('autocomplete', 'new-password');
      expect(input).toHaveAttribute('spellcheck', 'false');
      if (required) {
        expect(input).toBeRequired();
      } else {
        expect(input).not.toBeRequired();
      }

      await user.click(screen.getByRole('button', { name: new RegExp(`^Show ${label}$`, 'i') }));
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveValue('fixture-secret');
      expect(updateCustomTarget).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: 'replacement-secret' } });
      expect(updateCustomTarget).toHaveBeenLastCalledWith(group, {
        ...config[group],
        [field]: 'replacement-secret',
      });
    },
  );

  it('links optional client-secret guidance for the OAuth password grant', () => {
    render(
      <AuthorizationTab
        selectedTarget={{
          id: 'http',
          config: {
            auth: {
              type: 'oauth',
              grantType: 'password',
              tokenUrl: 'https://example.test/token',
              username: 'user',
              password: '',
            },
          },
        }}
        updateCustomTarget={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Client Secret');
    expect(input).not.toBeRequired();
    expect(input).toHaveAccessibleDescription('Optional for password grant');
  });

  it('starts the next authentication type masked without carrying over the previous value', async () => {
    const user = userEvent.setup();
    render(
      <StatefulAuthorization
        config={{ auth: { type: 'basic', username: 'user', password: 'fixture-secret' } }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText(/^Password\s*\*?$/)).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('combobox', { name: 'Authentication Type' }));
    await user.click(screen.getByRole('option', { name: 'Bearer' }));
    const token = screen.getByLabelText(/^Token\s*\*?$/);
    expect(token).toHaveValue('');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAccessibleDescription(
      'This token will be sent in the Authorization header as: Bearer {token}',
    );
    await user.type(token, 'new-token');
    expect(token).toHaveValue('new-token');
  });

  it('labels inline private keys and explains their configuration and export handling', () => {
    render(
      <AuthorizationTab
        selectedTarget={{
          id: 'http',
          config: {
            signatureAuth: { enabled: true, certificateType: 'pem', keyInputType: 'base64' },
          },
        }}
        updateCustomTarget={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Private Key' });
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('data-1p-ignore');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAccessibleDescription(/included in this provider configuration/);
    expect(input).toHaveAccessibleDescription(/copied or downloaded YAML/);
  });
});
