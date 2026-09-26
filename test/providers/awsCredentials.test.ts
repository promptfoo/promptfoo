import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@aws-sdk/credential-provider-sso');
  vi.resetModules();
});

describe('explicit AWS SSO profiles', () => {
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
