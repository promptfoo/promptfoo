import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvOverrides, getEnvString } from '../../src/envars';
import { bindRedteamProviderEnvironment } from '../../src/providers/redteamDefaults';
import { createDeferred } from '../util/utils';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../../src/types/index';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bindRedteamProviderEnvironment', () => {
  it('preserves instance, arguments and separate environments across delayed concurrent calls', async () => {
    const gate = createDeferred<void>();
    const context: CallApiContextParams = {
      prompt: { raw: 'fixture', label: 'fixture' },
      vars: {},
    };
    const options: CallApiOptionsParams = {};
    class FixtureProvider implements ApiProvider {
      config = { marker: 'retained' };
      id() {
        return 'fixture';
      }
      async callApi(
        prompt: string,
        actualContext?: CallApiContextParams,
        actualOptions?: CallApiOptionsParams,
      ) {
        expect(actualContext).toBe(context);
        expect(actualOptions).toBe(options);
        const before = getEnvString('OPENAI_API_BASE_URL');
        await gate.promise;
        return {
          output: `${this.config.marker}:${prompt}:${before}:${getEnvString('OPENAI_API_BASE_URL')}`,
        };
      }
    }
    const first = new FixtureProvider();
    const config = first.config;
    const env = { OPENAI_API_BASE_URL: 'a' };
    expect(bindRedteamProviderEnvironment(first, env)).toBe(first);
    env.OPENAI_API_BASE_URL = 'mutated-after-construction';
    const second = cliState.withEnv({ OPENAI_API_BASE_URL: 'b' }, () =>
      bindRedteamProviderEnvironment(new FixtureProvider()),
    );
    expect(first).toBeInstanceOf(FixtureProvider);
    expect(first.config).toBe(config);

    await cliState.withEnv({ OPENAI_API_BASE_URL: 'caller' }, async () => {
      const pending = [
        first.callApi('one', context, options),
        second.callApi('two', context, options),
      ];
      gate.resolve();
      expect(await Promise.all(pending)).toEqual([
        { output: 'retained:one:a:a' },
        { output: 'retained:two:b:b' },
      ]);
      expect(getEnvOverrides()?.OPENAI_API_BASE_URL).toBe('caller');
    });
  });

  it('retains file defaults beneath suite overrides after leaving the creation scope', async () => {
    const provider = cliState.withEnvFileOverrides(
      { OPENAI_API_BASE_URL: 'file-endpoint', OPENAI_API_KEY: 'file-key' },
      () =>
        bindRedteamProviderEnvironment(
          {
            id: () => 'fixture',
            callApi: async () => ({
              output: `${getEnvString('OPENAI_API_BASE_URL')}:${getEnvString('OPENAI_API_KEY')}`,
            }),
          },
          { OPENAI_API_KEY: 'suite-key' },
        ),
    );
    const result = await cliState.withEnvFileOverrides(
      { OPENAI_API_BASE_URL: 'other-file', OPENAI_API_KEY: 'other-key' },
      () => provider.callApi(),
    );
    expect(result.output).toBe('file-endpoint:suite-key');
  });

  it.each([false, true])(
    'restores the caller environment after an error (async: %s)',
    async (asynchronous) => {
      const failure = new Error('fixture failure');
      const provider = bindRedteamProviderEnvironment(
        {
          id: () => 'fixture',
          callApi: () => {
            expect(getEnvString('OPENAI_API_KEY')).toBe('fixture-provider');
            if (asynchronous) {
              return Promise.resolve().then(() => {
                expect(getEnvString('OPENAI_API_KEY')).toBe('fixture-provider');
                throw failure;
              });
            }
            throw failure;
          },
        },
        { OPENAI_API_KEY: 'fixture-provider' },
      );
      await cliState.withEnv({ OPENAI_API_KEY: 'fixture-caller' }, async () => {
        await expect(Promise.resolve().then(() => provider.callApi())).rejects.toBe(failure);
        expect(getEnvString('OPENAI_API_KEY')).toBe('fixture-caller');
      });
    },
  );
});
