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
      { apiKey: 'configured-token' },
      undefined,
      'us-east-1',
    );

    await expect(provider.getToken()).resolves.toBe('configured-token');
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

  it('rejects partial static credentials with an actionable error', async () => {
    const provider = new BedrockTokenProvider({}, { AWS_ACCESS_KEY_ID: 'access-key' }, 'us-east-1');

    await expect(provider.getToken()).rejects.toThrow(/AWS_SECRET_ACCESS_KEY/);
    expect(getTokenProvider).not.toHaveBeenCalled();
  });
});
