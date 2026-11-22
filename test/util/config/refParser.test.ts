import dns from 'node:dns/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http, { createServer } from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { LookupAddress } from 'node:dns';
import type { AddressInfo, LookupFunction, Socket } from 'node:net';

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { dereferenceConfig } from '../../../src/util/config/load';
import { readTest, readTests } from '../../../src/util/testCaseReader';

import type { UnifiedConfig } from '../../../src/types/index';

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});

describe('dereferenceConfig local references', () => {
  it('excludes imported reference-shaped data from resolution and dereferencing', async () => {
    const literal = { $ref: 'literal://retained-marker' };
    const config = {
      definitions: { local: 'resolved' },
      prompts: [{ $ref: '#/definitions/local' }],
      providers: ['echo'],
      tests: [
        {
          vars: { 'raw/%41~': literal, local: { $ref: '#/definitions/local' } },
          providerOutput: literal,
          metadata: {
            __promptfoo: { remote: true, remoteVars: ['raw/%41~'] },
            imported: literal,
          },
        },
      ],
    } as unknown as UnifiedConfig;
    const loaded = await dereferenceConfig(config);
    expect(loaded.prompts).toEqual(['resolved']);
    expect(loaded.tests).toEqual([
      {
        vars: { 'raw/%41~': literal, local: 'resolved' },
        providerOutput: literal,
        metadata: {
          __promptfoo: { remote: true, remoteVars: ['raw/%41~'] },
          imported: literal,
        },
      },
    ]);
  });

  it('keeps a remote variable named $ref as data', async () => {
    const test = {
      metadata: { __promptfoo: { remote: true, remoteVars: ['$ref'] } },
      vars: { $ref: 'literal://imported' },
    };
    const config = { tests: [test] } as unknown as UnifiedConfig;
    expect((await dereferenceConfig(config)).tests).toEqual([test]);
  });

  it('ignores imported references in unselected parts of external documents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pf-refs-'));
    onTestFinished(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'source.json');
    await writeFile(
      file,
      JSON.stringify({
        prompt: 'chosen',
        tests: [
          {
            metadata: { __promptfoo: { remote: true } },
            vars: { input: { $ref: 'missing.json' } },
          },
        ],
      }),
    );
    const config = {
      prompts: [{ $ref: pathToFileURL(file).href + '#/prompt' }],
      definitions: { local: 'local input' },
      tests: [{ vars: { input: { $ref: '#/definitions/local' } } }],
    } as unknown as UnifiedConfig;
    const loaded = await dereferenceConfig(config);
    expect(loaded.prompts).toEqual(['chosen']);
    expect(loaded.tests).toEqual([{ vars: { input: 'local input' } }]);
  });

  it.each(['yaml', 'json', 'jsonl'])('preserves imported data in saved %s tests', async (ext) => {
    const dir = await mkdtemp(join(tmpdir(), 'pf-replay-'));
    onTestFinished(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'cases.' + ext);
    const imported = { ref: { $ref: 'literal://example' }, file: 'file://fixture.txt' };
    const test = {
      metadata: { __promptfoo: { remote: true, remoteVars: ['input'] }, imported },
      providerOutput: imported,
      description: 'file://fixture.txt',
      vars: { input: imported, local: 'local value', alias: { $ref: '#/0/vars/local' } },
    };
    await writeFile(join(dir, 'fixture.txt'), 'local value');
    await writeFile(file, JSON.stringify(ext === 'jsonl' ? test : [test]));
    expect(await readTests([file], dir)).toEqual([
      { ...test, vars: { input: imported, local: 'local value', alias: 'local value' } },
    ]);
  });

  it('keeps imported data literal when reading one saved test', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pf-replay-'));
    onTestFinished(() => rm(dir, { recursive: true, force: true }));
    const test = {
      metadata: { __promptfoo: { remote: true } },
      vars: { input: 'file://missing.txt' },
      providerOutput: 'file://missing.txt',
    };
    await writeFile(join(dir, 'case.yaml'), JSON.stringify(test));
    expect(await readTest('case.yaml', dir)).toEqual(test);
  });

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

async function startPinnedServer(handler: http.RequestListener) {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  onTestFinished(async () => {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const dnsLookup = vi
    .spyOn(dns, 'lookup')
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  const realRequest = http.request;
  const validatedLookups: Array<string | LookupAddress[]> = [];
  const pinnedLookups: LookupFunction[] = [];
  const request = vi.spyOn(http, 'request').mockImplementation(((
    input: URL,
    options: http.RequestOptions,
    callback: (response: http.IncomingMessage) => void,
  ) => {
    const validatedLookup = options.lookup;
    if (typeof validatedLookup !== 'function') {
      throw new Error('Blocked an unpinned outbound HTTP request');
    }
    pinnedLookups.push(validatedLookup);
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
  const baseUrl = `http://schemas.example.com:${port}`;
  return {
    baseUrl,
    dnsLookup,
    request,
    validatedLookups,
    pinnedLookups,
    resolve: (path = '/prompt.json#/prompt') =>
      dereferenceConfig({
        prompts: [{ $ref: `${baseUrl}${path}` }],
        providers: ['echo'],
        tests: [],
      } as unknown as UnifiedConfig),
  };
}

describe('dereferenceConfig remote references', () => {
  it.each(['identity', 'gzip'])('resolves a %s response with DNS pinning', async (encoding) => {
    const fixture = await startPinnedServer((request, response) => {
      const body = JSON.stringify({ prompt: `resolved ${request.headers.host}` });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': encoding,
      });
      response.end(encoding === 'gzip' ? gzipSync(body) : body);
    });
    expect((await fixture.resolve()).prompts).toEqual([
      `resolved ${new URL(fixture.baseUrl).host}`,
    ]);
    expect(fixture.dnsLookup).toHaveBeenCalledExactlyOnceWith('schemas.example.com', {
      all: true,
      verbatim: true,
    });
    expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
      expect.any(URL),
      expect.objectContaining({ lookup: expect.any(Function), method: 'GET', agent: false }),
      expect.any(Function),
    );
    expect(fixture.validatedLookups).toEqual([[{ address: '93.184.216.34', family: 4 }]]);

    await expect(
      new Promise((resolve, reject) => {
        fixture.pinnedLookups[0](
          'attacker.example.com',
          { family: 4 },
          (error, address, family) => {
            if (error) {
              reject(error);
            } else {
              resolve({ address, family });
            }
          },
        );
      }),
    ).rejects.toThrow();
    expect(fixture.dnsLookup).toHaveBeenCalledOnce();
  });

  it('rejects a gzip response whose decompressed body exceeds 50 MiB', async () => {
    const body = gzipSync(Buffer.alloc(50 * 1024 * 1024 + 1, ' '));
    expect(body.length).toBeLessThan(100 * 1024);
    const fixture = await startPinnedServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': body.length,
      });
      response.end(body);
    });
    await expect(fixture.resolve()).rejects.toThrow(
      'exceeds the maxContentLength of 52428800 bytes',
    );
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it('rejects a public-to-private redirect before opening the destination connection', async () => {
    const received: string[] = [];
    const fixture = await startPinnedServer((request, response) => {
      received.push(request.url!);
      response.writeHead(302, {
        location: `http://private.example.com:${new URL(fixture.baseUrl).port}/secret.json`,
      });
      response.end();
    });
    fixture.dnsLookup.mockImplementation(
      async (hostname) =>
        [
          {
            address: hostname === 'private.example.com' ? '127.0.0.1' : '93.184.216.34',
            family: 4,
          },
        ] as never,
    );
    await expect(fixture.resolve()).rejects.toThrow('Unsafe URL blocked');
    expect(fixture.dnsLookup).toHaveBeenCalledWith('private.example.com', {
      all: true,
      verbatim: true,
    });
    expect(received).toEqual(['/prompt.json']);
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it('preserves source and target document scopes when merging external references', async () => {
    const received: string[] = [];
    const documents: Record<string, object> = {
      '/schemas/root.json': {
        prompt: { $ref: 'target/prompt.json', source: { $ref: 'value.json#/value' } },
      },
      '/schemas/target/prompt.json': { target: { $ref: 'value.json#/value' } },
      '/schemas/value.json': { value: 'source scope' },
      '/schemas/target/value.json': { value: 'target scope' },
    };
    const fixture = await startPinnedServer((request, response) => {
      received.push(request.url!);
      response.writeHead(documents[request.url!] ? 200 : 404, {
        'content-type': 'application/json',
      });
      response.end(JSON.stringify(documents[request.url!] ?? {}));
    });
    expect((await fixture.resolve('/schemas/root.json#/prompt')).prompts).toEqual([
      { source: 'source scope', target: 'target scope' },
    ]);
    expect(received.sort()).toEqual(Object.keys(documents).sort());
  });

  it('rejects HTTP upgrades and closes the upgraded socket', async () => {
    let upgradedSocket: Socket | undefined;
    const fixture = await startPinnedServer((request, response) => {
      upgradedSocket = request.socket;
      response.writeHead(101, { connection: 'Upgrade', upgrade: 'websocket' });
      response.flushHeaders();
    });
    await expect(fixture.resolve()).rejects.toThrow('Unexpected HTTP protocol upgrade');
    expect(upgradedSocket).toBeDefined();
    await expect.poll(() => upgradedSocket?.destroyed).toBe(true);
  }, 5000);

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
