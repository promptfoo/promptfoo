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
  getCallerSuppliedBaseUrl,
  isPrivateIpAddress,
  isPrivateRangeBlockingEnabled,
  PrivateRangeBlockedError,
} from '../../src/util/privateNetwork';

const mockedLookup = vi.mocked(
  lookup as unknown as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>,
);

afterEach(() => {
  vi.resetAllMocks();
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
  ])('flags private IPv4 %s', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '192.167.255.255', '11.0.0.1'])(
    'allows public IPv4 %s',
    (ip) => {
      expect(isPrivateIpAddress(ip)).toBe(false);
    },
  );

  it.each(['::1', 'fe80::1', 'fe80::abcd', 'fc00::1', 'fd00::1234', '::ffff:10.0.0.1'])(
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

describe('getCallerSuppliedBaseUrl', () => {
  it('prefers config.apiBaseUrl', () => {
    expect(
      getCallerSuppliedBaseUrl({
        id: 'http://10.0.0.1/v1',
        config: { apiBaseUrl: 'http://192.168.1.10/v1' },
      }),
    ).toBe('http://192.168.1.10/v1');
  });

  it('falls back to a bare http(s) provider id', () => {
    expect(getCallerSuppliedBaseUrl({ id: 'http://169.254.169.254/' })).toBe(
      'http://169.254.169.254/',
    );
    expect(getCallerSuppliedBaseUrl({ id: 'https://example.com/v1' })).toBe(
      'https://example.com/v1',
    );
  });

  it('returns undefined for named providers without overrides', () => {
    expect(getCallerSuppliedBaseUrl({ id: 'openai:gpt-4o-mini' })).toBeUndefined();
    expect(getCallerSuppliedBaseUrl({ id: 'openai:gpt-4o-mini', config: {} })).toBeUndefined();
    expect(getCallerSuppliedBaseUrl({})).toBeUndefined();
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
});
