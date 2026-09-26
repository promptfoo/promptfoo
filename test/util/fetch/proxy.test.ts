import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { getProxyEnvironment, getProxyForUrl } from '../../../src/util/fetch/proxy';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../utils';

let restore = () => {};

beforeEach(() => {
  restore = mockProcessEnv(Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])));
});

afterEach(() => restore());

describe('effective proxy environment', () => {
  it('resolves suite > file > shell across uppercase and lowercase aliases', () => {
    mockProcessEnv({ https_proxy: 'http://shell.example:8080' });
    cliState.withEnvFileOverrides({ HTTPS_PROXY: 'http://file.example:8080' }, () => {
      expect(getProxyForUrl('https://example.com')).toBe('http://file.example:8080');
      cliState.withEnv({ HTTPS_PROXY: 'http://suite.example:8080' }, () => {
        expect(getProxyForUrl('https://example.com')).toBe('http://suite.example:8080');
      });
      expect(getProxyForUrl('https://example.com')).toBe('http://file.example:8080');
    });
    expect(getProxyForUrl('https://example.com')).toBe('http://shell.example:8080');
  });

  it('preserves lowercase precedence within a layer and supports explicit empty overrides', () => {
    mockProcessEnv({ HTTPS_PROXY: 'http://shell.example:8080' });
    cliState.withEnv(
      { https_proxy: 'http://lower.example', HTTPS_PROXY: 'http://upper.example' },
      () => {
        expect(getProxyForUrl('https://example.com')).toBe('http://lower.example');
      },
    );
    cliState.withEnv({ HTTPS_PROXY: '' }, () => {
      expect(getProxyForUrl('https://example.com')).toBe('');
    });
  });

  it('keeps captured SDK proxy settings stable after leaving their scope', () => {
    const env = cliState.withEnvFileOverrides(
      { ALL_PROXY: 'http://file.example:8080', NO_PROXY: 'internal.example' },
      getProxyEnvironment,
    );
    cliState.withEnv({ HTTPS_PROXY: 'http://other.example:8080' }, () => {
      expect(getProxyForUrl('https://example.com', env)).toBe('http://file.example:8080');
      expect(getProxyForUrl('https://internal.example', env)).toBe('');
    });
  });

  it('isolates simultaneous invocations without modifying the host proxy', async () => {
    mockProcessEnv({ HTTPS_PROXY: 'http://shell.example:8080' });
    const values = await Promise.all(
      ['one', 'two'].map((id) =>
        cliState.withEnvFileOverrides({ HTTPS_PROXY: `http://${id}.example:8080` }, async () => {
          await Promise.resolve();
          return getProxyForUrl('https://example.com');
        }),
      ),
    );
    expect(values).toEqual(['http://one.example:8080', 'http://two.example:8080']);
    expect(getProxyForUrl('https://example.com')).toBe('http://shell.example:8080');
  });
});

describe('proxy routing compatibility', () => {
  it.each([
    ['example.com', 'https://example.com', false],
    ['example.com', 'https://other.example.com', true],
    ['.example.com', 'https://other.example.com', false],
    ['.example.com', 'https://example.com', true],
    ['*.example.com', 'https://other.example.com', false],
    ['*', 'https://other.example.com', false],
    ['example.com:443', 'https://example.com', false],
    ['example.com:80', 'https://example.com', true],
    ['localhost, EXAMPLE.COM internal.test', 'https://example.com', false],
    ['[::1]:443', 'https://[::1]', false],
    ['[::1]:80', 'https://[::1]', true],
    ['[::1]', 'https://[::1]:8443', false],
  ])('resolves NO_PROXY=%s for %s', (no_proxy, url, proxied) => {
    expect(getProxyForUrl(url, { https_proxy: 'http://proxy.example', no_proxy })).toBe(
      proxied ? 'http://proxy.example' : '',
    );
  });

  it('uses protocol settings before ALL_PROXY and supplies a missing scheme', () => {
    const env = {
      http_proxy: 'http-proxy.example:8080',
      all_proxy: 'socks://fallback.example:1080',
    };
    expect(getProxyForUrl('http://example.com', env)).toBe('http://http-proxy.example:8080');
    expect(getProxyForUrl('https://example.com', env)).toBe('socks://fallback.example:1080');
    expect(getProxyForUrl('not a url', env)).toBe('');
    expect(getProxyForUrl('file:///tmp/example', env)).toBe('');
  });
});
