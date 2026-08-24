import dns from 'node:dns/promises';
import { createServer } from 'node:http';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceConfig } from '../../../src/util/config/load';

import type { UnifiedConfig } from '../../../src/types/index';

const parserRequire = createRequire(
  createRequire(import.meta.url).resolve('@apidevtools/json-schema-ref-parser/package.json'),
);
const parserTransport = parserRequire('undici') as typeof import('undici');

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});

describe('dereferenceConfig remote references', () => {
  it('uses the real resolver and nested Undici transport with a DNS-pinned address', async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ prompt: `resolved ${request.headers.host}` }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const dnsLookup = vi
        .spyOn(dns, 'lookup')
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      syncBuiltinESMExports();

      type LookupAddress = { address: string; family: number };
      type LookupCallback = (
        error: Error | null,
        address: string | LookupAddress[],
        family?: number,
      ) => void;
      type PinnedLookup = (
        hostname: string,
        options: { family?: number | string; all?: boolean },
        callback: LookupCallback,
      ) => void;

      const RealAgent = parserTransport.Agent;
      const validatedLookups: Array<string | LookupAddress[]> = [];
      let pinnedLookup: PinnedLookup | undefined;
      vi.spyOn(parserTransport, 'Agent').mockImplementation(function (options) {
        if (!options) {
          throw new Error('Expected the parser to configure its DNS-pinned HTTP transport');
        }
        const connect = options.connect as { lookup: PinnedLookup };
        pinnedLookup = connect.lookup;

        return new RealAgent({
          ...options,
          connect: {
            ...connect,
            lookup: (hostname, lookupOptions, callback) => {
              connect.lookup(hostname, lookupOptions, (error, address) => {
                if (error) {
                  callback(error, '', 0);
                  return;
                }

                validatedLookups.push(address);
                if (Array.isArray(address)) {
                  callback(null, [{ address: '127.0.0.1', family: 4 }]);
                } else {
                  callback(null, '127.0.0.1', 4);
                }
              });
            },
          },
        });
      });
      const fetch = vi.spyOn(parserTransport, 'fetch');
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
      expect(fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ dispatcher: expect.any(RealAgent), method: 'GET' }),
      );
      expect(validatedLookups).toEqual([[{ address: '93.184.216.34', family: 4 }]]);

      // A redirect or DNS rebind must not reuse the already validated connection.
      await expect(
        new Promise((resolve, reject) => {
          pinnedLookup?.('attacker.example.com', { family: 4 }, (error, address, family) => {
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it.each([
    { address: '169.254.169.254', family: 4, description: 'cloud metadata' },
    { address: '10.0.0.10', family: 4, description: 'RFC1918 private IPv4' },
    { address: '172.16.0.10', family: 4, description: 'RFC1918 carrier IPv4' },
    { address: '192.168.1.10', family: 4, description: 'RFC1918 local IPv4' },
    { address: '127.0.0.1', family: 4, description: 'IPv4 loopback' },
    { address: '::1', family: 6, description: 'IPv6 loopback' },
    { address: 'fd00::1', family: 6, description: 'IPv6 unique-local' },
    { address: 'fe80::1', family: 6, description: 'IPv6 link-local' },
    { address: 'fd00:ec2::254', family: 6, description: 'IPv6 cloud metadata' },
    {
      address: '::ffff:169.254.169.254',
      family: 6,
      description: 'IPv4-mapped IPv6 cloud metadata',
    },
    { address: '::ffff:127.0.0.1', family: 6, description: 'IPv4-mapped IPv6 loopback' },
  ])('refuses a remote reference resolving to $description', async ({ address, family }) => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address, family }] as never);
    syncBuiltinESMExports();

    const fetch = vi
      .spyOn(parserTransport, 'fetch')
      .mockRejectedValue(new Error('unexpected outbound request'));

    await expect(
      dereferenceConfig({
        prompts: [{ $ref: 'https://metadata.example.com/prompt.json#/prompt' }],
        providers: ['echo'],
        tests: [],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
