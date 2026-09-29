import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BedrockAuthentication from './BedrockAuthentication';

import type { ProviderOptions } from '../../types';

type Config = NonNullable<ProviderOptions['config']>;

function Editor({ initial }: { initial: Config }) {
  const [config, setConfig] = useState(initial);
  return (
    <>
      <BedrockAuthentication
        config={config}
        isHttpApi
        updateCustomTarget={(field, value) => {
          setConfig((previous) =>
            field === 'config' ? (value as Config) : { ...previous, [field]: value },
          );
        }}
      />
      <output data-testid="saved-config">{JSON.stringify(config)}</output>
    </>
  );
}

describe('BedrockAuthentication', () => {
  it.each([
    [{}, 'default'],
    [{ profile: 'work' }, 'profile'],
    [{ accessKeyId: 'key', secretAccessKey: 'secret' }, 'keys'],
    [{ sessionToken: 'partial-session' }, 'keys'],
    [{ apiKey: 'token' }, 'bearer'],
    [{ apiKey: 'token', profile: 'work' }, 'bearer'],
    [{ apiKey: '', profile: 'work' }, 'profile'],
    [{ apiKey: '{{ env.MISSING }}', profile: 'work' }, 'profile'],
    [{ apiKeyRequired: false, profile: 'unused' }, 'custom'],
    [{ apiKeyRequired: false, apiKey: 'explicit' }, 'bearer'],
  ] as const)('infers authentication from %j without modifying it', (config, method) => {
    const update = vi.fn();
    render(<BedrockAuthentication config={config} isHttpApi updateCustomTarget={update} />);
    expect(screen.getByLabelText('Authentication')).toHaveValue(method);
    expect(update).not.toHaveBeenCalled();
  });

  it('switches methods, clears conflicting credentials, and preserves unrelated settings', async () => {
    const user = userEvent.setup();
    const rest = { region: 'us-east-1', temperature: 0.3, headers: { 'X-Custom': 'value' } };
    render(
      <Editor
        initial={{
          ...rest,
          apiKey: 'old-token',
          profile: 'old-profile',
          accessKeyId: 'old-key',
          secretAccessKey: 'old-secret',
          sessionToken: 'old-session',
        }}
      />,
    );
    const saved = () => JSON.parse(screen.getByTestId('saved-config').textContent!);
    await user.selectOptions(screen.getByLabelText('Authentication'), 'keys');
    expect(saved()).toEqual({ ...rest, accessKeyId: '', secretAccessKey: '' });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter both');
    await user.type(screen.getByLabelText('AWS Access Key ID'), 'new-key');
    await user.type(screen.getByLabelText('AWS Secret Access Key'), 'new-secret');
    await user.type(screen.getByLabelText('AWS Session Token (optional)'), 'new-session');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saved()).toEqual({
      ...rest,
      accessKeyId: 'new-key',
      secretAccessKey: 'new-secret',
      sessionToken: 'new-session',
    });
    expect(screen.getByLabelText('AWS Secret Access Key')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('AWS Session Token (optional)')).toHaveAttribute(
      'type',
      'password',
    );

    await user.selectOptions(screen.getByLabelText('Authentication'), 'profile');
    expect(saved()).toEqual({ ...rest, profile: '' });
    await user.type(screen.getByLabelText('AWS Profile'), 'work');
    expect(saved()).toEqual({ ...rest, profile: 'work' });
    await user.clear(screen.getByLabelText('AWS Profile'));
    expect(screen.getByLabelText('Authentication')).toHaveValue('profile');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an AWS profile name');

    await user.selectOptions(screen.getByLabelText('Authentication'), 'bearer');
    await user.type(screen.getByLabelText('Bedrock Bearer Token'), 'new-token');
    expect(saved()).toEqual({ ...rest, apiKey: 'new-token' });
    expect(screen.getByLabelText('Bedrock Bearer Token')).toHaveAttribute('type', 'password');
    await user.selectOptions(screen.getByLabelText('Authentication'), 'default');
    expect(saved()).toEqual(rest);
  });

  it('reflects externally loaded credentials instead of keeping a stale method', () => {
    const update = vi.fn();
    const { rerender } = render(
      <BedrockAuthentication config={{ profile: 'work' }} isHttpApi updateCustomTarget={update} />,
    );
    rerender(
      <BedrockAuthentication config={{ apiKey: 'token' }} isHttpApi updateCustomTarget={update} />,
    );
    expect(screen.getByLabelText('Authentication')).toHaveValue('bearer');
    expect(screen.getByLabelText('Bedrock Bearer Token')).toHaveValue('token');
    expect(screen.queryByLabelText('AWS Profile')).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('preserves custom headers and removes the no-auth flag only on explicit method changes', async () => {
    const user = userEvent.setup();
    const initial = {
      apiKeyRequired: false,
      apiBaseUrl: 'http://localhost:1234',
      headers: { Authorization: 'Bearer custom' },
    };
    render(<Editor initial={initial} />);
    expect(screen.getByTestId('saved-config')).toHaveTextContent(JSON.stringify(initial));
    expect(screen.getByLabelText('Authentication')).toHaveValue('custom');
    expect(screen.getByText(/explicit authentication headers, which override/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Authentication'), 'profile');
    expect(JSON.parse(screen.getByTestId('saved-config').textContent!)).toEqual({
      apiBaseUrl: initial.apiBaseUrl,
      headers: initial.headers,
      profile: '',
    });
  });

  it.each(['profile', 'keys'] as const)('explains native API precedence for %s', (method) => {
    render(
      <BedrockAuthentication
        config={
          method === 'profile'
            ? { profile: 'work' }
            : { accessKeyId: 'key', secretAccessKey: 'secret' }
        }
        isHttpApi={false}
        updateCustomTarget={vi.fn()}
      />,
    );
    expect(screen.getByText(/Unset AWS_BEARER_TOKEN_BEDROCK/)).toBeInTheDocument();
  });

  it('does not describe native APIs as unauthenticated when a saved HTTP flag is present', () => {
    const update = vi.fn();
    render(
      <BedrockAuthentication
        config={{ profile: 'work', apiKeyRequired: false }}
        isHttpApi={false}
        updateCustomTarget={update}
      />,
    );
    expect(screen.getByLabelText('Authentication')).toHaveValue('profile');
    expect(screen.queryByText(/Automatic authentication is disabled/)).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
