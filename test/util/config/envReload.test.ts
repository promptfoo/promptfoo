import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { loadApiProviders } from '../../../src/providers/index';
import { isApiProvider } from '../../../src/types/providers';
import { combineConfigs, resolveConfigs } from '../../../src/util/config/load';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import { getNunjucksEngine } from '../../../src/util/templates';
import { mockProcessEnv } from '../utils';

import type { UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('suite environment loading', () => {
  let tempDir: string;
  let restoreEnv: () => void;
  let previousConfig: typeof cliState.config;
  let previousBasePath: typeof cliState.basePath;
  let previousProviders: typeof cliState.selectedProviderConfigs;

  beforeEach(() => {
    previousConfig = cliState.config;
    previousBasePath = cliState.basePath;
    previousProviders = cliState.selectedProviderConfigs;
    cliState.config = {
      env: { OPENAI_API_BASE_URL: 'https://previous.example/v1', OPENAI_API_KEY: 'previous-key' },
    };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-reload-'));
    restoreEnv = mockProcessEnv({
      OPENAI_API_BASE_URL: 'https://process.example/v1',
      OPENAI_BASE_URL: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_KEY: 'process-key',
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_TEMPLATING: undefined,
      PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'false',
    });
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    restoreEnv();
    cliState.config = previousConfig;
    cliState.basePath = previousBasePath;
    cliState.selectedProviderConfigs = previousProviders;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(name: string, config: Partial<UnifiedConfig>) {
    const configPath = path.join(tempDir, name, 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ prompts: ['Hello'], providers: ['echo'], ...config }),
    );
    return configPath;
  }

  function externalConfig(name: string) {
    const configPath = writeConfig(name, {
      env: { OPENAI_API_BASE_URL: `https://${name}.example/v1`, OPENAI_API_KEY: `${name}-key` },
      tests: 'tests.yaml',
    });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'tests.yaml'),
      '- provider: openai:chat:test-model\n',
    );
    return configPath;
  }

  async function expectRequest(provider: unknown, name: string) {
    if (!isApiProvider(provider)) {
      throw new Error('Expected an instantiated provider');
    }
    vi.mocked(fetchWithCache).mockClear();
    expect((await provider.callApi('Hello')).output).toBe('Hello');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(`https://${name}.example/v1/chat/completions`);
    expect(request?.headers).toMatchObject({ Authorization: `Bearer ${name}-key` });
  }

  it('retains combined external test credentials after the loading scope exits', async () => {
    const config = await combineConfigs([externalConfig('suite')]);
    const test = Array.isArray(config.tests) ? config.tests[0] : undefined;
    await expectRequest(
      typeof test === 'object' && 'provider' in test ? test.provider : undefined,
      'suite',
    );
    expect(cliState.config?.env?.OPENAI_API_KEY).toBe('previous-key');
  });

  it('isolates overlapping combined config loads', async () => {
    const configs = await Promise.all(
      ['first', 'second'].map((name) => combineConfigs([externalConfig(name)])),
    );
    for (const [index, name] of ['first', 'second'].entries()) {
      const tests = configs[index].tests;
      const test = Array.isArray(tests) ? tests[0] : undefined;
      await expectRequest(
        typeof test === 'object' && 'provider' in test ? test.provider : undefined,
        name,
      );
    }
  });

  it.each(['inline', 'external', 'default', 'scenario'] as const)(
    'retains credentials for %s test providers across later config loads',
    async (location) => {
      const test = { provider: 'openai:chat:test-model' };
      const configPath =
        location === 'external'
          ? externalConfig('suite')
          : writeConfig('suite', {
              env: { OPENAI_API_BASE_URL: 'https://suite.example/v1', OPENAI_API_KEY: 'suite-key' },
              ...(location === 'inline' ? { tests: [test] } : {}),
              ...(location === 'default'
                ? { defaultTest: test, tests: [{ vars: { input: 'hello' } }] }
                : {}),
              ...(location === 'scenario' ? { scenarios: [{ config: [{}], tests: [test] }] } : {}),
            });
      const { testSuite, config } = await resolveConfigs({ config: [configPath] }, {});
      const provider =
        location === 'default'
          ? typeof config.defaultTest === 'object' && config.defaultTest.provider
          : location === 'scenario'
            ? testSuite.scenarios?.[0].tests?.[0].provider
            : testSuite.tests?.[0].provider;
      await resolveConfigs(
        { config: [writeConfig('next', { env: { OPENAI_API_KEY: 'next-key' } })] },
        {},
      );
      await expectRequest(provider, 'suite');
    },
  );

  it('uses process settings after removing the previous suite environment', async () => {
    const first = await resolveConfigs(
      {
        config: [
          writeConfig('first', {
            providers: ['openai:chat:test-model'],
            env: { OPENAI_API_BASE_URL: 'https://suite.example/v1', OPENAI_API_KEY: 'suite-key' },
          }),
        ],
      },
      {},
    );
    const second = await resolveConfigs(
      {
        config: [
          writeConfig('second', {
            providers: ['openai:chat:test-model'],
          }),
        ],
      },
      {},
    );
    await expectRequest(second.testSuite.providers[0], 'process');
    await expectRequest(first.testSuite.providers[0], 'suite');
  });

  it('leaves the previous config active after a failed resolution', async () => {
    const previous = cliState.config;
    const configPath = writeConfig('invalid', {
      prompts: ['file://missing-prompt.txt'],
      env: { OPENAI_API_KEY: 'rejected-key' },
    });
    await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toThrow();
    expect(cliState.config).toBe(previous);
  });

  it('resolves prompts and external tests relative to every expanded config path', async () => {
    for (const name of ['first', 'second']) {
      const configPath = externalConfig(name);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.prompts = ['file://prompt.txt'];
      fs.writeFileSync(configPath, JSON.stringify(config));
      fs.writeFileSync(path.join(path.dirname(configPath), 'prompt.txt'), name);
    }
    const config = await combineConfigs([path.join(tempDir, '*', 'config.json')]);
    expect(config.prompts).toEqual(
      expect.arrayContaining(
        ['first', 'second'].map((name) => `file://${path.join(tempDir, name, 'prompt.txt')}`),
      ),
    );
    expect(config.tests).toHaveLength(2);
  });

  it.each([undefined, {}, { OPENAI_API_KEY: 'replacement-key' }])(
    'isolates provider URL templates with explicit env %j',
    async (env) => {
      const [provider] = await loadApiProviders(
        [
          {
            id: 'openai:chat:test-model',
            config: { apiBaseUrl: '{{ env.OPENAI_API_BASE_URL }}' },
          },
        ],
        { env },
      );
      expect(provider.config.apiBaseUrl).toBe('https://process.example/v1');
    },
  );

  it('uses the scoped environment for regular and file-path templates', async () => {
    const result = await cliState.withConfig(
      { env: { OPENAI_API_KEY: 'scoped-key' } },
      async () => {
        await Promise.resolve();
        return [
          getEnvString('OPENAI_API_KEY'),
          getNunjucksEngine().renderString('{{ env.OPENAI_API_KEY }}', {}),
          getNunjucksEngineForFilePath().renderString('{{ env.OPENAI_API_KEY }}', {}),
        ];
      },
    );
    expect(result).toEqual(['scoped-key', 'scoped-key', 'scoped-key']);
    expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
  });

  it('inherits the active scoped environment when loader options omit env', async () => {
    const [provider] = await cliState.withConfig(
      {
        env: {
          OPENAI_API_BASE_URL: 'https://suite.example/v1',
          OPENAI_API_KEY: 'suite-key',
        },
      },
      () => loadApiProviders(['openai:chat:test-model']),
    );
    await expectRequest(provider, 'suite');
  });
});
