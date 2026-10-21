import dns from 'node:dns/promises';
import http, { createServer } from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { gzipSync } from 'node:zlib';
import type { LookupAddress } from 'node:dns';
import type { AddressInfo, LookupFunction } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceConfig } from '../../../src/util/config/load';

import type { UnifiedConfig } from '../../../src/types/index';

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});

describe('dereferenceConfig local references', () => {
  it('resolves an own property without reading inherited properties', async () => {
    const definitions = Object.assign(Object.create({ inherited: 'inherited prompt' }), {
      own: 'own prompt',
    });
    const config = {
      definitions,
      prompts: [{ $ref: '#/definitions/own' }],
      providers: ['echo'],
      tests: [],
    } as unknown as UnifiedConfig;

    expect((await dereferenceConfig(config)).prompts).toEqual(['own prompt']);
  });

  it('keeps literal percent escapes distinct from decoded pointer keys', async () => {
    const config = {
      definitions: { '%41': 'literal percent prompt', A: 'letter prompt', 'a/b': 'slash prompt' },
      prompts: [
        { $ref: '#/definitions/%2541' },
        { $ref: '#/definitions/A' },
        { $ref: '#/definitions/a~1b' },
      ],
      providers: ['echo'],
      tests: [],
    } as unknown as UnifiedConfig;

    expect((await dereferenceConfig(config)).prompts).toEqual([
      'literal percent prompt',
      'letter prompt',
      'slash prompt',
    ]);
  });

  it('rejects a reference to an inherited property', async () => {
    const config = {
      definitions: Object.create({ inherited: 'inherited prompt' }),
      prompts: [{ $ref: '#/definitions/inherited' }],
      providers: ['echo'],
      tests: [],
    } as unknown as UnifiedConfig;

    await expect(dereferenceConfig(config)).rejects.toMatchObject({ code: 'EMISSINGPOINTER' });
  });
});

describe('dereferenceConfig remote references', () => {
  it.each(['identity', 'gzip'])('resolves a %s response with DNS pinning', async (encoding) => {
    const server = createServer((request, response) => {
      const body = JSON.stringify({ prompt: `resolved ${request.headers.host}` });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': encoding,
      });
      response.end(encoding === 'gzip' ? gzipSync(body) : body);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const dnsLookup = vi
        .spyOn(dns, 'lookup')
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      const realRequest = http.request;
      const validatedLookups: Array<string | LookupAddress[]> = [];
      let pinnedLookup: LookupFunction | undefined;
      const request = vi.spyOn(http, 'request').mockImplementation(((
        input: URL,
        options: http.RequestOptions,
        callback: (response: http.IncomingMessage) => void,
      ) => {
        const validatedLookup = options.lookup;
        if (typeof validatedLookup !== 'function') {
          throw new Error('Blocked an unpinned outbound HTTP request');
        }
        pinnedLookup = validatedLookup;
        return realRequest(
          input,
          {
            ...options,
            // Exercise the actual pinned lookup, then route only its validated address to our server.
            lookup: (hostname, lookupOptions, lookupCallback) => {
              validatedLookup(hostname, lookupOptions, (error, address) => {
                if (error) {
                  lookupCallback(error, '', 0);
                  return;
                }
                validatedLookups.push(address);
                if (Array.isArray(address)) {
                  lookupCallback(null, [{ address: '127.0.0.1', family: 4 }]);
                } else {
                  lookupCallback(null, '127.0.0.1', 4);
                }
              });
            },
          },
          callback,
        );
      }) as typeof http.request);
      syncBuiltinESMExports();
      const { port } = server.address() as AddressInfo;

      const result = await dereferenceConfig({
        prompts: [{ $ref: `http://schemas.example.com:${port}/prompt.json#/prompt` }],
        providers: ['echo'],
        tests: [],
      } as unknown as UnifiedConfig);

      expect(result.prompts).toEqual([`resolved schemas.example.com:${port}`]);
      expect(dnsLookup).toHaveBeenCalledExactlyOnceWith('schemas.example.com', {
        all: true,
        verbatim: true,
      });
      expect(request).toHaveBeenCalledExactlyOnceWith(
        expect.any(URL),
        expect.objectContaining({ lookup: expect.any(Function), method: 'GET', agent: false }),
        expect.any(Function),
      );
      expect(validatedLookups).toEqual([[{ address: '93.184.216.34', family: 4 }]]);

      // A redirect or DNS rebind must not reuse the already validated connection.
      const validatedLookup = pinnedLookup;
      if (!validatedLookup) {
        throw new Error('The parser did not provide a DNS-pinned lookup');
      }
      await expect(
        new Promise((resolve, reject) => {
          validatedLookup('attacker.example.com', { family: 4 }, (error, address, family) => {
            if (error) {
              reject(error);
            } else {
              resolve({ address, family });
            }
          });
        }),
      ).rejects.toThrow();
      expect(dnsLookup).toHaveBeenCalledOnce();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it.each([
    { address: '169.254.169.254', family: 4, description: 'cloud metadata' },
    { address: '10.0.0.10', family: 4, description: 'RFC1918 private IPv4' },
    { address: '172.16.0.10', family: 4, description: 'RFC1918 172/12 private IPv4' },
    { address: '192.168.1.10', family: 4, description: 'RFC1918 local IPv4' },
    { address: '100.64.0.10', family: 4, description: 'RFC6598 carrier-grade IPv4' },
    { address: '127.0.0.1', family: 4, description: 'IPv4 loopback' },
    { address: '::1', family: 6, description: 'IPv6 loopback' },
    { address: 'fc00::1', family: 6, description: 'IPv6 fc00 unique-local' },
    { address: 'fd00::1', family: 6, description: 'IPv6 unique-local' },
    { address: 'fe80::1', family: 6, description: 'IPv6 link-local' },
    { address: 'fd00:ec2::254', family: 6, description: 'IPv6 cloud metadata' },
    {
      address: '::ffff:169.254.169.254',
      family: 6,
      description: 'IPv4-mapped IPv6 cloud metadata',
    },
    { address: '::ffff:127.0.0.1', family: 6, description: 'IPv4-mapped IPv6 loopback' },
    { address: '::ffff:10.0.0.10', family: 6, description: 'IPv4-mapped RFC1918 10/8' },
    { address: '::ffff:172.16.0.10', family: 6, description: 'IPv4-mapped RFC1918 172/12' },
    { address: '::ffff:192.168.1.10', family: 6, description: 'IPv4-mapped RFC1918 192.168/16' },
  ])('refuses a remote reference resolving to $description', async ({ address, family }) => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address, family }] as never);
    const httpRequest = vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('unexpected outbound HTTP request');
    });
    const httpsRequest = vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('unexpected outbound HTTPS request');
    });
    syncBuiltinESMExports();

    await expect(
      dereferenceConfig({
        prompts: [{ $ref: 'https://metadata.example.com/prompt.json#/prompt' }],
        providers: ['echo'],
        tests: [],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow();
    expect(httpRequest).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });
});
