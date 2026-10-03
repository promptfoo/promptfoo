import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BedrockTokenProvider } from '../../../src/providers/bedrock/tokenProvider';
import { mockProcessEnv } from '../../util/utils';

const { generateToken, getTokenProvider } = vi.hoisted(() => ({
  generateToken: vi.fn<() => Promise<string>>(),
  getTokenProvider: vi.fn(),
}));

vi.mock('@aws/bedrock-token-generator', () => ({
  getTokenProvider,
}));

describe('BedrockTokenProvider', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      AWS_ACCESS_KEY_ID: undefined,
      AWS_BEARER_TOKEN_BEDROCK: undefined,
      AWS_PROFILE: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      AWS_SESSION_TOKEN: undefined,
    });
    generateToken.mockReset().mockResolvedValue('generated-token');
    getTokenProvider.mockReset().mockReturnValue(generateToken);
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.resetAllMocks();
  });

  it('prefers a configured bearer token without loading the generator', async () => {
    const provider = new BedrockTokenProvider(
      { apiKey: 'configured-token', profile: 'unused-profile' },
      { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' },
      'us-east-1',
    );

    await expect(provider.getToken()).resolves.toBe('configured-token');
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  it('does not generate credentials for a no-auth custom endpoint', async () => {
    const provider = new BedrockTokenProvider({ apiKeyRequired: false }, undefined, 'us-east-1');
    await expect(provider.getToken()).resolves.toBeUndefined();
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  describe.each([undefined, { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' }])(
    'with bearer token overrides %j',
    (env) => {
      beforeEach(() => {
        const restoreBase = restoreEnv;
        const restoreToken = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'process-token' });
        restoreEnv = () => {
          restoreToken();
          restoreBase?.();
        };
      });

      it.each([
        { profile: 'selected-profile' },
        { accessKeyId: 'selected-key', secretAccessKey: 'selected-secret' },
        {
          accessKeyId: 'selected-key',
          secretAccessKey: 'selected-secret',
          sessionToken: 'selected-session',
        },
      ])('prefers explicit AWS configuration %j over environment tokens', async (config) => {
        const provider = new BedrockTokenProvider(config, env, 'us-east-1');
        await expect(provider.getToken()).resolves.toBe('generated-token');
        expect(getTokenProvider).toHaveBeenCalledExactlyOnceWith({
          region: 'us-east-1',
          ...('profile' in config ? config : { credentials: config }),
        });
      });

      it.each([
        { accessKeyId: 'selected-key' },
        { secretAccessKey: 'selected-secret' },
        { sessionToken: 'selected-session' },
      ])(
        'rejects incomplete explicit credentials %j instead of using an environment token',
        async (config) => {
          const provider = new BedrockTokenProvider(config, env, 'us-east-1');
          await expect(provider.getToken()).rejects.toThrow(/incomplete/);
          expect(getTokenProvider).not.toHaveBeenCalled();
        },
      );

      it.each([undefined, '', '   ', '{{ env.MISSING }}'])(
        'keeps environment fallback for unconfigured AWS fields (%s)',
        async (value) => {
          const provider = new BedrockTokenProvider(
            { profile: value, accessKeyId: value, secretAccessKey: value, sessionToken: value },
            env,
            'us-east-1',
          );
          await expect(provider.getToken()).resolves.toBe(
            env?.AWS_BEARER_TOKEN_BEDROCK ?? 'process-token',
          );
          expect(getTokenProvider).not.toHaveBeenCalled();
        },
      );

      it('does not fall back to an environment token when explicit credentials fail', async () => {
        generateToken.mockRejectedValueOnce(new Error('selected profile expired'));
        const provider = new BedrockTokenProvider(
          { profile: 'selected-profile' },
          env,
          'us-east-1',
        );
        await expect(provider.getToken()).rejects.toThrow('selected profile expired');
      });
    },
  );

  it.each([undefined, '', '{{ env.MISSING_TOKEN }}'])(
    'ignores environment bearer tokens when auth is optional and apiKey is %s',
    async (apiKey) => {
      const restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'process-token' });
      try {
        for (const env of [undefined, { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' }]) {
          const provider = new BedrockTokenProvider(
            { apiKeyRequired: false, apiKey, profile: 'unused-profile' },
            env,
            'us-east-1',
          );
          await expect(provider.getToken()).resolves.toBeUndefined();
        }
        expect(getTokenProvider).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    },
  );

  it('preserves an explicit key when auth is optional', async () => {
    const provider = new BedrockTokenProvider(
      { apiKeyRequired: false, apiKey: 'explicit-token' },
      { AWS_BEARER_TOKEN_BEDROCK: 'provider-token' },
      'us-east-1',
    );
    await expect(provider.getToken()).resolves.toBe('explicit-token');
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  it.each(['config', 'provider'] as const)(
    'prefers a %s profile over ambient credentials',
    async (scope) => {
      const restore = mockProcessEnv({
        AWS_ACCESS_KEY_ID: 'ambient',
        AWS_SECRET_ACCESS_KEY: 'ambient-secret',
        AWS_SESSION_TOKEN: 'ambient-session',
      });
      try {
        const provider = new BedrockTokenProvider(
          scope === 'config' ? { profile: 'selected' } : {},
          scope === 'provider' ? { AWS_PROFILE: 'selected' } : undefined,
          'us-west-2',
        );
        await provider.getToken();
        expect(getTokenProvider).toHaveBeenCalledWith({ region: 'us-west-2', profile: 'selected' });
      } finally {
        restore();
      }
    },
  );

  it('never combines explicit keys with an ambient session token', async () => {
    const provider = new BedrockTokenProvider(
      { accessKeyId: 'explicit', secretAccessKey: 'explicit-secret' },
      { AWS_SESSION_TOKEN: 'other-account-session' },
      'us-east-1',
    );
    await provider.getToken();
    expect(getTokenProvider).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: { accessKeyId: 'explicit', secretAccessKey: 'explicit-secret' },
    });
  });

  it('passes the selected process profile instead of ambient key credentials', async () => {
    const restore = mockProcessEnv({
      AWS_PROFILE: 'selected',
      AWS_ACCESS_KEY_ID: 'ambient',
      AWS_SECRET_ACCESS_KEY: 'ambient-secret',
    });
    try {
      await new BedrockTokenProvider({}, undefined, 'us-east-1').getToken();
      expect(getTokenProvider).toHaveBeenCalledWith({ profile: 'selected', region: 'us-east-1' });
    } finally {
      restore();
    }
  });

  it('passes process credentials as a complete tuple', async () => {
    const restore = mockProcessEnv({
      AWS_ACCESS_KEY_ID: 'access',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'session',
    });
    try {
      await new BedrockTokenProvider({}, undefined, 'us-east-1').getToken();
      expect(getTokenProvider).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: 'access', secretAccessKey: 'secret', sessionToken: 'session' },
      });
    } finally {
      restore();
    }
  });

  it('rejects a partial config tuple instead of filling it from another source', async () => {
    const provider = new BedrockTokenProvider(
      { accessKeyId: 'explicit' },
      { AWS_SECRET_ACCESS_KEY: 'other-account-secret' },
      'us-east-1',
    );
    await expect(provider.getToken()).rejects.toThrow(/incomplete/);
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  it('cancels one credential wait without cancelling a concurrent caller', async () => {
    let resolveToken!: (value: string) => void;
    generateToken.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');
    const abort = new AbortController();
    const first = provider.getToken(abort.signal);
    const second = provider.getToken();
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await rejected;
    resolveToken('valid-token');
    await expect(second).resolves.toBe('valid-token');
    expect(generateToken).toHaveBeenCalledTimes(1);
  });

  it('does not discover credentials for an already cancelled request', async () => {
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');
    await expect(provider.getToken(AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  it('uses a provider env bearer token without loading the generator', async () => {
    const provider = new BedrockTokenProvider(
      {},
      { AWS_BEARER_TOKEN_BEDROCK: 'team-secret-token' },
      'us-east-1',
    );

    await expect(provider.getToken()).resolves.toBe('team-secret-token');
    expect(getTokenProvider).not.toHaveBeenCalled();
  });

  it('passes standard AWS credential env vars to the token generator', async () => {
    const provider = new BedrockTokenProvider(
      {},
      {
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        AWS_SESSION_TOKEN: 'session-token',
      },
      'us-west-2',
    );

    await expect(provider.getToken()).resolves.toBe('generated-token');
    expect(getTokenProvider).toHaveBeenCalledWith({
      region: 'us-west-2',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'session-token',
      },
    });
  });

  it('passes an AWS profile when static credentials are absent', async () => {
    const provider = new BedrockTokenProvider({}, { AWS_PROFILE: 'bedrock-prod' }, 'us-east-2');

    await provider.getToken();

    expect(getTokenProvider).toHaveBeenCalledWith({
      region: 'us-east-2',
      profile: 'bedrock-prod',
    });
  });

  it('uses the default AWS credential chain when no explicit credentials are present', async () => {
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');

    await provider.getToken();

    expect(getTokenProvider).toHaveBeenCalledWith({ region: 'us-east-1' });
  });

  it('shares one in-flight generation and generates a fresh token for a later request', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    generateToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');

    const first = provider.getToken();
    const second = provider.getToken();
    await vi.waitFor(() => expect(generateToken).toHaveBeenCalledTimes(1));
    expect(generateToken).toHaveBeenCalledTimes(1);
    resolveFirst?.('first-token');
    await expect(Promise.all([first, second])).resolves.toEqual(['first-token', 'first-token']);

    await provider.getToken();
    expect(generateToken).toHaveBeenCalledTimes(2);
  });

  it('releases the generation lock after a failure so the next request can retry', async () => {
    generateToken
      .mockRejectedValueOnce(new Error('expired role'))
      .mockResolvedValueOnce('retry-token');
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');

    await expect(provider.getToken()).rejects.toThrow(/expired role/);
    await expect(provider.getToken()).resolves.toBe('retry-token');
    expect(generateToken).toHaveBeenCalledTimes(2);
  });

  it('retries generator construction after a recoverable failure', async () => {
    // A cached rejection would pin every later request to the first error, so a user who
    // installs the optional package (or fixes their credential chain) would still be broken
    // until the process restarted.
    getTokenProvider.mockImplementationOnce(() => {
      throw new Error('transient construction failure');
    });
    getTokenProvider.mockReturnValue(generateToken);
    const provider = new BedrockTokenProvider({}, undefined, 'us-east-1');

    await expect(provider.getToken()).rejects.toThrow(
      'Unable to load Amazon Bedrock token generation support',
    );
    await expect(provider.getToken()).resolves.toBe('generated-token');
  });

  it('rejects partial static credentials with an actionable error', async () => {
    const provider = new BedrockTokenProvider({}, { AWS_ACCESS_KEY_ID: 'access-key' }, 'us-east-1');

    await expect(provider.getToken()).rejects.toThrow(/AWS_SECRET_ACCESS_KEY/);
    expect(getTokenProvider).not.toHaveBeenCalled();
  });
});
