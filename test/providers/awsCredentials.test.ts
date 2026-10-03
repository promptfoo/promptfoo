import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  getAwsCredentialProviderOptions,
  resolveAwsCredentials,
} from '../../src/providers/awsCredentials';
import { mockProcessEnv } from '../util/utils';

afterEach(() => {
  vi.doUnmock('@aws-sdk/credential-provider-sso');
  vi.resetModules();
});

describe('explicit AWS SSO profiles', () => {
  it('forwards scoped shared/config files directly to the selected SSO provider', async () => {
    const fromSSO = vi.fn().mockReturnValue(vi.fn());
    vi.doMock('@aws-sdk/credential-provider-sso', () => ({ fromSSO }));
    const { resolveAwsCredentials } = await import('../../src/providers/awsCredentials');
    const { default: scopedCliState } = await import('../../src/cliState');
    await scopedCliState.withEnvFileOverrides(
      { AWS_CONFIG_FILE: '/fixture/config', AWS_SHARED_CREDENTIALS_FILE: '/fixture/credentials' },
      () => resolveAwsCredentials({ profile: 'fixture' }),
    );
    expect(fromSSO).toHaveBeenCalledWith({
      profile: 'fixture',
      configFilepath: '/fixture/config',
      filepath: '/fixture/credentials',
      ignoreCache: true,
    });
  });

  it('explains how to install the optional SSO provider when importing it fails', async () => {
    vi.doMock('@aws-sdk/credential-provider-sso', () => {
      throw new Error('Cannot find package @aws-sdk/credential-provider-sso');
    });
    const { resolveAwsCredentials } = await import('../../src/providers/awsCredentials');

    await expect(resolveAwsCredentials({ profile: 'fixture' })).rejects.toThrow(
      'npm install @aws-sdk/credential-provider-sso',
    );
  });

  it('preserves errors raised by the installed credential provider', async () => {
    const failure = new Error('Invalid SSO profile configuration');
    vi.doMock('@aws-sdk/credential-provider-sso', () => ({
      fromSSO: () => {
        throw failure;
      },
    }));
    const { resolveAwsCredentials } = await import('../../src/providers/awsCredentials');

    await expect(resolveAwsCredentials({ profile: 'fixture' })).rejects.toBe(failure);
  });

  it('returns the installed SSO provider without resolving credentials early', async () => {
    const provider = vi.fn();
    const fromSSO = vi.fn().mockReturnValue(provider);
    vi.doMock('@aws-sdk/credential-provider-sso', () => ({ fromSSO }));
    const { resolveAwsCredentials } = await import('../../src/providers/awsCredentials');

    await expect(resolveAwsCredentials({ profile: 'fixture' })).resolves.toBe(provider);
    expect(fromSSO).toHaveBeenCalledWith({ profile: 'fixture' });
    expect(provider).not.toHaveBeenCalled();
  });
});

describe('backwards-compatible AWS env-file handoff', () => {
  it.each(
    ['suite', 'provider'].flatMap((scope) =>
      [
        {
          mode: 'undefined',
          input: {
            AWS_WEB_IDENTITY_TOKEN_FILE: undefined,
            AWS_ROLE_ARN: undefined,
            AWS_ROLE_SESSION_NAME: undefined,
          },
          expected: {
            webIdentityTokenFile: '/fixture/file-token',
            roleArn: 'arn:aws:iam::123456789012:role/File',
            roleSessionName: 'file-session',
          },
        },
        {
          mode: 'override',
          input: {
            AWS_WEB_IDENTITY_TOKEN_FILE: '/fixture/override-token',
            AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/Override',
            AWS_ROLE_SESSION_NAME: 'override-session',
          },
          expected: {
            webIdentityTokenFile: '/fixture/override-token',
            roleArn: 'arn:aws:iam::123456789012:role/Override',
            roleSessionName: 'override-session',
          },
        },
        {
          mode: 'empty',
          input: {
            AWS_WEB_IDENTITY_TOKEN_FILE: '',
            AWS_ROLE_ARN: '',
            AWS_ROLE_SESSION_NAME: '',
          },
          expected: { webIdentityTokenFile: '', roleArn: '', roleSessionName: '' },
        },
      ].map((scenario) => ({ scope, ...scenario })),
    ),
  )('forwards web identity options with $scope $mode values', ({ scope, input, expected }) => {
    cliState.withEnvFileOverrides(
      {
        AWS_WEB_IDENTITY_TOKEN_FILE: '/fixture/file-token',
        AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/File',
        AWS_ROLE_SESSION_NAME: 'file-session',
      },
      () =>
        cliState.withEnv(scope === 'suite' ? input : undefined, () => {
          expect(getAwsCredentialProviderOptions(scope === 'provider' ? input : undefined)).toEqual(
            expected,
          );
        }),
    );
  });

  it('combines a file session token with existing host access keys without mutating them', async () => {
    const restore = mockProcessEnv({
      AWS_ACCESS_KEY_ID: 'host-access',
      AWS_SECRET_ACCESS_KEY: 'host-secret',
      AWS_SESSION_TOKEN: 'host-token',
    });
    try {
      await cliState.withEnvFileOverrides({ AWS_SESSION_TOKEN: 'file-token' }, async () => {
        expect(await resolveAwsCredentials()).toEqual({
          accessKeyId: 'host-access',
          secretAccessKey: 'host-secret',
          sessionToken: 'file-token',
        });
        expect(process.env.AWS_SESSION_TOKEN).toBe('host-token');
      });
    } finally {
      restore();
    }
  });

  it.each(['', ' \t '])('treats a blank optional session token %j as absent', async (token) => {
    await cliState.withEnvFileOverrides(
      {
        AWS_ACCESS_KEY_ID: 'file-access',
        AWS_SECRET_ACCESS_KEY: 'file-secret',
        AWS_SESSION_TOKEN: token,
      },
      async () => {
        expect(await resolveAwsCredentials()).toEqual({
          accessKeyId: 'file-access',
          secretAccessKey: 'file-secret',
        });
      },
    );
  });
});
