import dns from 'node:dns/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceConfig } from '../../../src/util/config/load';
import type { Agent, Dispatcher } from 'undici';

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
  it('uses the real resolver with the DNS-validated public address and its patched transport', async () => {
    const lookup = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    syncBuiltinESMExports();

    const destroy = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { destroyed: false, destroy } as unknown as Dispatcher;
    let agentOptions: Agent.Options | undefined;
    vi.spyOn(parserTransport, 'Agent').mockImplementation(function (options) {
      agentOptions = options;
      return dispatcher as Agent;
    });
    const fetch = vi.spyOn(parserTransport, 'fetch').mockResolvedValue(
      new parserTransport.Response(JSON.stringify({ prompt: 'validated remote prompt' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await dereferenceConfig({
      prompts: [{ $ref: 'https://schemas.example.com/prompt.json#/prompt' }],
      providers: ['echo'],
      tests: [],
    } as unknown as UnifiedConfig);

    expect(result.prompts).toEqual(['validated remote prompt']);
    expect(lookup).toHaveBeenCalledExactlyOnceWith('schemas.example.com', {
      all: true,
      verbatim: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ dispatcher, method: 'GET' }),
    );

    const pinnedLookup = (
      agentOptions?.connect as
        | {
            lookup?: (
              hostname: string,
              options: { family: number },
              callback: (error: Error | null, address: string, family: number) => void,
            ) => void;
          }
        | undefined
    )?.lookup;
    expect(pinnedLookup).toEqual(expect.any(Function));
    const pinnedAddress = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        pinnedLookup?.('schemas.example.com', { family: 4 }, (error, address, family) => {
          if (error) {
            reject(error);
          } else {
            resolve({ address, family });
          }
        });
      },
    );
    expect(pinnedAddress).toEqual({ address: '93.184.216.34', family: 4 });
    expect(lookup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();

    // The TOCTOU that 15.5.1 closes: the pinned lookup must serve only the hostname that was
    // validated, so a redirect or rebind to another host cannot reuse the approved connection.
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
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('refuses a remote reference whose hostname resolves to a private address', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
    syncBuiltinESMExports();

    const fetch = vi.spyOn(parserTransport, 'fetch');

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
