import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { createBedrockRequestHandler, hasProxyEnv } from '../../../src/providers/bedrock/util';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../../util/utils';

const { handlerOptions, proxyOptions } = vi.hoisted(() => ({
  handlerOptions: vi.fn(),
  proxyOptions: vi.fn(),
}));
vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class {
    handle = vi.fn();
    constructor(options: unknown) {
      handlerOptions(options);
    }
  },
}));
vi.mock('proxy-agent', () => ({
  ProxyAgent: class {
    constructor(options: unknown) {
      proxyOptions(options);
    }
  },
}));

let restore = () => {};
beforeEach(() => {
  handlerOptions.mockReset();
  proxyOptions.mockReset();
  restore = mockProcessEnv(Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])));
});
afterEach(() => restore());

describe('Bedrock effective proxy settings', () => {
  it.each(['https_proxy', 'all_proxy'])(
    'detects %s from an invocation file and captures its resolver',
    async (key) => {
      await cliState.withEnvFileOverrides(
        { [key]: 'http://file.example:8080', NO_PROXY: 'internal.example' },
        async () => {
          expect(hasProxyEnv()).toBe(true);
          await createBedrockRequestHandler();
        },
      );
      expect(handlerOptions).toHaveBeenCalledWith(
        expect.objectContaining({ httpsAgent: expect.any(Object) }),
      );
      const resolver = proxyOptions.mock.calls[0][0].getProxyForUrl;
      cliState.withEnv({ HTTPS_PROXY: 'http://other.example:8080' }, () => {
        expect(resolver('https://external.example')).toBe('http://file.example:8080');
        expect(resolver('https://internal.example')).toBe('');
      });
    },
  );

  it('does not create a proxy agent when only NO_PROXY is configured', async () => {
    await cliState.withEnvFileOverrides({ NO_PROXY: '*' }, async () => {
      expect(hasProxyEnv()).toBe(false);
      await createBedrockRequestHandler();
    });
    expect(proxyOptions).not.toHaveBeenCalled();
  });
});
