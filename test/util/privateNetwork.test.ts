import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './utils';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

import {
  assertProviderTargetPublic,
  assertUrlResolvesPublic,
  getCallerSuppliedBaseUrls,
  isPrivateIpAddress,
  isPrivateRangeBlockedMessage,
  isPrivateRangeBlockingEnabled,
  PrivateRangeBlockedError,
} from '../../src/util/privateNetwork';

const mockedLookup = vi.mocked(
  lookup as unknown as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>,
);

afterEach(() => {
  vi.resetAllMocks();
});

describe('isPrivateRangeBlockedMessage', () => {
  it.each([
    'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "noresolve.example.com" could not be resolved: getaddrinfo ENOTFOUND',
    'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "internal.example.com" resolves to a private address',
    'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL with private address "10.1.2.3"',
  ])('matches a guard failure message: %s', (message) => {
    expect(isPrivateRangeBlockedMessage(message)).toBe(true);
  });

  it('matches a guard message wrapped by another layer', () => {
    expect(
      isPrivateRangeBlockedMessage(
        'Provider returned error: PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "internal.example.com" resolves to a private address',
      ),
    ).toBe(true);
  });

  it.each(['Request failed after 4 retries: socket hang up', '', undefined, 42])(
    'does not match a non-guard message: %s',
    (message) => {
      expect(isPrivateRangeBlockedMessage(message)).toBe(false);
    },
  );
});

describe('isPrivateIpAddress', () => {
  it.each([
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    '127.0.0.1',
    '127.0.0.2',
    '169.254.169.254',
    '169.254.0.1',
    '0.0.0.0',
    '100.64.0.1',
    '100.100.100.200',
    '100.127.255.255',
  ])('flags private IPv4 %s', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '172.32.0.1',
    '192.167.255.255',
    '11.0.0.1',
    '100.63.255.255',
    '100.128.0.1',
  ])('allows public IPv4 %s', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(false);
  });

  it.each(['::1', '::', 'fe80::1', 'fe80::abcd', 'fc00::1', 'fd00::1234', '::ffff:10.0.0.1'])(
    'flags private IPv6 %s',
    (ip) => {
      expect(isPrivateIpAddress(ip)).toBe(true);
    },
  );

  it.each(['2001:db8::1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '[::1]'])(
    'handles IPv6 %s',
    (ip) => {
      // [::1] keeps brackets after URL parsing; ::ffff:8.8.8.8 embeds public v4.
      expect(isPrivateIpAddress(ip)).toBe(ip === '[::1]');
    },
  );

  it('returns false for non-IP input', () => {
    expect(isPrivateIpAddress('not-an-ip')).toBe(false);
    expect(isPrivateIpAddress('')).toBe(false);
  });
});

describe('getCallerSuppliedBaseUrls', () => {
  it('returns every config URL instead of letting one mask another', () => {
    // HttpProvider requests `config.url || id` and never reads apiBaseUrl, so
    // a public apiBaseUrl must not mask a private id.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'http://169.254.169.254/latest',
        config: { apiBaseUrl: 'https://8.8.8.8' },
      }),
    ).toEqual(['https://8.8.8.8', 'http://169.254.169.254/latest']);
  });

  it('falls back to a bare http(s) provider id', () => {
    expect(getCallerSuppliedBaseUrls({ id: 'http://169.254.169.254/' })).toEqual([
      'http://169.254.169.254/',
    ]);
    expect(getCallerSuppliedBaseUrls({ id: 'https://example.com/v1' })).toEqual([
      'https://example.com/v1',
    ]);
  });

  it('catches non-canonical http(s) provider ids accepted by the registry', () => {
    // The registry accepts any `http:` prefix; Node canonicalizes these to
    // loopback before HttpProvider fetches them.
    expect(getCallerSuppliedBaseUrls({ id: 'http:127.0.0.1' })).toEqual(['http:127.0.0.1']);
    expect(getCallerSuppliedBaseUrls({ id: 'http:\\\\127.0.0.1\\x' })).toEqual([
      'http:\\\\127.0.0.1\\x',
    ]);
    expect(getCallerSuppliedBaseUrls({ id: 'HTTP://169.254.169.254/' })).toEqual([
      'HTTP://169.254.169.254/',
    ]);
  });

  it('unwraps webhook: provider ids before returning the inner URL', () => {
    expect(getCallerSuppliedBaseUrls({ id: 'webhook:http://169.254.169.254/latest' })).toEqual([
      'http://169.254.169.254/latest',
    ]);
  });

  it('unwraps n8n: and a2a: provider ids before returning the inner URL', () => {
    // createN8nProvider strips the n8n: prefix for the webhook URL and
    // A2AProvider stores the a2a: remainder as config.url, so the inner
    // URL is the fetched target in both cases.
    expect(
      getCallerSuppliedBaseUrls({ id: 'n8n:http://169.254.169.254/latest/meta-data' }),
    ).toEqual(['http://169.254.169.254/latest/meta-data']);
    expect(getCallerSuppliedBaseUrls({ id: 'a2a:http://127.0.0.1:8080' })).toEqual([
      'http://127.0.0.1:8080',
    ]);
  });

  it('returns ws:/wss: provider ids for validation', () => {
    expect(getCallerSuppliedBaseUrls({ id: 'ws://169.254.169.254/socket' })).toEqual([
      'ws://169.254.169.254/socket',
    ]);
    expect(getCallerSuppliedBaseUrls({ id: 'wss://example.com/socket' })).toEqual([
      'wss://example.com/socket',
    ]);
  });

  it('reads config.url (the HttpProvider request URL)', () => {
    expect(
      getCallerSuppliedBaseUrls({ id: 'http', config: { url: 'http://127.0.0.1:8080/hook' } }),
    ).toEqual(['http://127.0.0.1:8080/hook']);
  });

  it('derives the target of a raw request from its Host header', () => {
    expect(
      getCallerSuppliedBaseUrls({
        id: 'http',
        config: { request: 'GET /latest/meta-data HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n' },
      }),
    ).toEqual(['http://169.254.169.254']);
  });

  it('uses the Host header as the effective authority for an absolute request target', () => {
    expect(
      getCallerSuppliedBaseUrls({
        id: 'http',
        config: {
          request: 'GET http://169.254.169.254/latest HTTP/1.1\r\nHost: example.com\r\n\r\n',
        },
      }),
    ).toEqual(['http://example.com']);
  });

  it('validates the Host header behind a public absolute request target', () => {
    expect(
      getCallerSuppliedBaseUrls({
        id: 'http',
        config: {
          request: 'GET https://8.8.8.8/latest HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n',
        },
      }),
    ).toEqual(['http://169.254.169.254']);
  });

  it('uses the last Host header when several are present', () => {
    expect(
      getCallerSuppliedBaseUrls({
        id: 'http',
        config: {
          request: 'GET /latest HTTP/1.1\r\nHost: example.com\r\nHost: 169.254.169.254\r\n\r\n',
        },
      }),
    ).toEqual(['http://169.254.169.254']);
  });

  it('resolves named providers with local default endpoints', () => {
    expect(getCallerSuppliedBaseUrls({ id: 'ollama:chat:llama3' })).toEqual([
      'http://localhost:11434',
    ]);
    expect(getCallerSuppliedBaseUrls({ id: 'llama:chat' })).toEqual(['http://localhost:8080']);
    expect(getCallerSuppliedBaseUrls({ id: 'localai:chat' })).toEqual(['http://localhost:8080/v1']);
  });

  it('drops the local default when an apiBaseUrl override wins for that provider', () => {
    // localai resolves config.apiBaseUrl ahead of the local default, so the
    // default is never fetched and must not be validated.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'localai:chat',
        config: { apiBaseUrl: 'https://models.example.com/v1' },
      }),
    ).toEqual(['https://models.example.com/v1']);
  });

  it('validates helicone against the effective config.baseUrl, not the overwritten apiBaseUrl', () => {
    // HeliconeGatewayProvider derives its endpoint from config.baseUrl and
    // overwrites config.apiBaseUrl with `${baseUrl}/ai`, so a public
    // apiBaseUrl must not mask a private baseUrl.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'helicone:openai/gpt-4o',
        config: { apiBaseUrl: 'https://8.8.8.8', baseUrl: 'http://169.254.169.254' },
      }),
    ).toEqual(['https://8.8.8.8', 'http://169.254.169.254']);
    expect(
      getCallerSuppliedBaseUrls({
        id: 'helicone:openai/gpt-4o',
        config: { baseUrl: 'http://169.254.169.254' },
      }),
    ).toEqual(['http://169.254.169.254']);
    // With no baseUrl the provider falls back to its local default, which
    // stays validated even when an (ignored) apiBaseUrl is configured.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'helicone:gpt-4o',
        config: { apiBaseUrl: 'https://helicone.example.com' },
      }),
    ).toEqual(['https://helicone.example.com', 'http://localhost:8080']);
    expect(getCallerSuppliedBaseUrls({ id: 'helicone:gpt-4o' })).toEqual(['http://localhost:8080']);
  });

  it('validates elevenlabs against the effective config.baseUrl', () => {
    // Every ElevenLabs provider hands config.baseUrl to ElevenLabsClient,
    // which posts `${baseUrl}${endpoint}` through fetchWithProxy. The
    // client-side guard validates redirects, not the initial hop, so a
    // private config.baseUrl must be preflighted here.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'elevenlabs:tts',
        config: { baseUrl: 'http://169.254.169.254' },
      }),
    ).toEqual(['http://169.254.169.254']);
    // With no baseUrl the provider falls back to its public default, which
    // resolves publicly and needs no exception.
    expect(getCallerSuppliedBaseUrls({ id: 'elevenlabs:tts' })).toEqual([
      'https://api.elevenlabs.io/v1',
    ]);
  });

  it('validates litellm against its local proxy default unless apiBaseUrl wins', () => {
    // createLiteLLMProvider resolves config.apiBaseUrl, then
    // LITELLM_API_BASE, then the local proxy default, so with no override
    // the default is the fetched target.
    expect(getCallerSuppliedBaseUrls({ id: 'litellm:chat:gpt-4o' })).toEqual([
      'http://0.0.0.0:4000',
    ]);
    expect(
      getCallerSuppliedBaseUrls({
        id: 'litellm:chat:gpt-4o',
        config: { apiBaseUrl: 'https://models.example.com/v1' },
      }),
    ).toEqual(['https://models.example.com/v1']);
  });

  it('validates openclaw against its local gateway default unless gateway_url wins', () => {
    // resolveGatewayTransportUrl resolves config.gateway_url, then the
    // gateway env overrides, then the local gateway default, so with no
    // override the default is the fetched target.
    expect(getCallerSuppliedBaseUrls({ id: 'openclaw' })).toEqual(['http://127.0.0.1:18789']);
    expect(getCallerSuppliedBaseUrls({ id: 'openclaw:chat' })).toEqual(['http://127.0.0.1:18789']);
    // The clawdbot alias routes to the same provider and gateway.
    expect(getCallerSuppliedBaseUrls({ id: 'clawdbot' })).toEqual(['http://127.0.0.1:18789']);
    expect(
      getCallerSuppliedBaseUrls({
        id: 'openclaw:chat',
        config: { gateway_url: 'https://gateway.example.com' },
      }),
    ).toEqual(['https://gateway.example.com']);
  });

  it('keeps the local default when the provider ignores config.apiBaseUrl', () => {
    // ollama builds its fetch URL from OLLAMA_BASE_URL or the localhost
    // default and never reads config.apiBaseUrl, so the default remains
    // the effective target and stays validated.
    expect(
      getCallerSuppliedBaseUrls({
        id: 'ollama:chat:llama3',
        config: { apiBaseUrl: 'https://models.example.com' },
      }),
    ).toEqual(['https://models.example.com', 'http://localhost:11434']);
  });

  it('returns an empty list for named providers without overrides', () => {
    expect(getCallerSuppliedBaseUrls({ id: 'openai:gpt-4o-mini' })).toEqual([]);
    expect(getCallerSuppliedBaseUrls({ id: 'openai:gpt-4o-mini', config: {} })).toEqual([]);
    expect(getCallerSuppliedBaseUrls({})).toEqual([]);
  });
});

describe('assertUrlResolvesPublic', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it('throws for a private IP literal without touching DNS', async () => {
    await expect(
      assertUrlResolvesPublic('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('throws for 127.0.0.1', async () => {
    await expect(assertUrlResolvesPublic('http://127.0.0.1:11434/v1')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
  });

  it('passes for a public IP literal', async () => {
    await expect(assertUrlResolvesPublic('https://8.8.8.8/v1')).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('throws when the hostname resolves to a private address', async () => {
    mockedLookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 } as LookupAddress]);
    await expect(assertUrlResolvesPublic('https://internal.example.com/v1')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).toHaveBeenCalledWith('internal.example.com', { all: true });
  });

  it('passes when the hostname resolves to public addresses', async () => {
    mockedLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ] as LookupAddress[]);
    await expect(assertUrlResolvesPublic('https://example.com/v1')).resolves.toBeUndefined();
  });

  it('fails closed when the hostname cannot be resolved', async () => {
    mockedLookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(assertUrlResolvesPublic('https://nonexistent.invalid/v1')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
  });

  it('fails closed for unparseable URLs', async () => {
    await expect(assertUrlResolvesPublic('http://exa mple.com/%')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks shared-address space literals without touching DNS', async () => {
    await expect(assertUrlResolvesPublic('http://100.100.100.200/')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks the unspecified address without touching DNS', async () => {
    await expect(assertUrlResolvesPublic('http://0.0.0.0:8080/')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    await expect(assertUrlResolvesPublic('http://[::]:8080/')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});

describe('assertProviderTargetPublic', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    mockedLookup.mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
  });

  it('is a no-op when the flag is unset', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });
    expect(isPrivateRangeBlockingEnabled()).toBe(false);
    await expect(
      assertProviderTargetPublic({ id: 'http://169.254.169.254/' }),
    ).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks a private target when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    expect(isPrivateRangeBlockingEnabled()).toBe(true);
    await expect(assertProviderTargetPublic({ id: 'http://169.254.169.254/' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
  });

  it('skips named providers with no caller-chosen URL when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(assertProviderTargetPublic({ id: 'openai:gpt-4o-mini' })).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('checks config.apiBaseUrl when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'openai:chat',
        config: { apiBaseUrl: 'http://192.168.1.5/v1' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
  });

  it('checks config.url (HttpProvider request URL) when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'http',
        config: { url: 'http://127.0.0.1:8080/hook' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks non-canonical http: provider ids when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(assertProviderTargetPublic({ id: 'http:127.0.0.1' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks named providers with local default endpoints when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 } as LookupAddress]);
    await expect(assertProviderTargetPublic({ id: 'ollama:chat:llama3' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).toHaveBeenCalledWith('localhost', { all: true });
  });

  it('does not let a public apiBaseUrl mask a private provider id', async () => {
    // HttpProvider requests `config.url || id` and ignores apiBaseUrl.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'http://169.254.169.254/latest',
        config: { apiBaseUrl: 'https://8.8.8.8' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('does not let a public apiBaseUrl mask a private helicone baseUrl', async () => {
    // HeliconeGatewayProvider derives its endpoint from config.baseUrl and
    // overwrites config.apiBaseUrl, so the guard must reject the private
    // effective target even though the apiBaseUrl is public.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'helicone:openai/gpt-4o',
        config: { apiBaseUrl: 'https://8.8.8.8', baseUrl: 'http://169.254.169.254' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks a private elevenlabs config.baseUrl when the flag is set', async () => {
    // ElevenLabsClient posts `${baseUrl}${endpoint}` through fetchWithProxy;
    // the client-side guard validates redirects, not the initial hop, so the
    // preflight must reject a private config.baseUrl outright.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'elevenlabs:tts',
        config: { baseUrl: 'http://169.254.169.254' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('allows elevenlabs with no baseUrl override when the flag is set', async () => {
    // No override: the effective target is the public default, which the
    // preflight resolves publicly instead of rejecting.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 } as LookupAddress]);
    await expect(assertProviderTargetPublic({ id: 'elevenlabs:tts' })).resolves.toBeUndefined();
  });

  it('validates the unwrapped target of webhook: provider ids', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({ id: 'webhook:http://169.254.169.254/latest' }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('validates the unwrapped target of n8n: and a2a: provider ids', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({ id: 'n8n:http://169.254.169.254/latest/meta-data' }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    await expect(assertProviderTargetPublic({ id: 'a2a:http://127.0.0.1:8080' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks litellm and openclaw local defaults when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(assertProviderTargetPublic({ id: 'litellm:chat:gpt-4o' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    await expect(assertProviderTargetPublic({ id: 'openclaw' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('allows litellm and openclaw when an explicit public endpoint wins', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'litellm:chat:gpt-4o',
        config: { apiBaseUrl: 'https://8.8.8.8/v1' },
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertProviderTargetPublic({
        id: 'openclaw:chat',
        config: { gateway_url: 'http://8.8.8.8:18789' },
      }),
    ).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('allows a webhook: id whose inner URL is public', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 } as LookupAddress]);
    await expect(
      assertProviderTargetPublic({ id: 'webhook:https://example.com/hook' }),
    ).resolves.toBeUndefined();
  });

  it('blocks ws:/wss: provider ids pointing at private addresses', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(assertProviderTargetPublic({ id: 'ws://169.254.169.254/socket' })).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks a raw request whose Host header points at a private address', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'http',
        config: { request: 'GET /latest/meta-data HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('blocks a raw request with a public absolute target but a private Host header', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'http',
        config: {
          request: 'GET https://8.8.8.8/latest HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n',
        },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('allows a raw request whose Host header resolves publicly', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 } as LookupAddress]);
    await expect(
      assertProviderTargetPublic({
        id: 'http',
        config: { request: 'GET /hook HTTP/1.1\r\nHost: example.com\r\n\r\n' },
      }),
    ).resolves.toBeUndefined();
    expect(mockedLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('fails closed on a raw request with no verifiable target', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    await expect(
      assertProviderTargetPublic({
        id: 'http',
        config: { request: 'GET /hook HTTP/1.1\r\nX-Custom: yes\r\n\r\n' },
      }),
    ).rejects.toThrow(PrivateRangeBlockedError);
  });
});
