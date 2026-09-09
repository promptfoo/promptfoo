import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { isApiProvider } from '../../../src/types/providers';
import { clearConfigCache } from '../../../src/util/config/default';
import { combineConfigs, readConfig, resolveConfigs } from '../../../src/util/config/load';
import { mockProcessEnv } from '../utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Envoy config reload', () => {
  let tempDir: string;
  let restoreEnv: () => void;
  let previousConfig: typeof cliState.config;
  let previousBasePath: typeof cliState.basePath;
  let previousProviderConfigs: typeof cliState.selectedProviderConfigs;

  beforeEach(() => {
    previousConfig = cliState.config;
    previousBasePath = cliState.basePath;
    previousProviderConfigs = cliState.selectedProviderConfigs;
    cliState.config = undefined;
    cliState.basePath = undefined;
    cliState.selectedProviderConfigs = undefined;
    clearConfigCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-envoy-reload-'));
    restoreEnv = mockProcessEnv({
      ENVOY_API_BASE_URL: 'https://process.example/v1/',
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_ORGANIZATION: undefined,
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
    cliState.selectedProviderConfigs = previousProviderConfigs;
    clearConfigCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([
    {
      name: 'uses the process gateway after the suite URL is removed',
      processUrl: 'https://process.example/v1/',
      apiBaseUrl: undefined,
      expectedUrl: 'https://process.example/v1/chat/completions',
    },
    {
      name: 'rejects the removed suite URL when no process gateway exists',
      processUrl: undefined,
      apiBaseUrl: undefined,
      expectedUrl: undefined,
    },
    {
      name: 'preserves an explicit provider URL after the suite URL is removed',
      processUrl: 'https://process.example/v1/',
      apiBaseUrl: 'https://provider.example/custom/',
      expectedUrl: 'https://provider.example/custom/chat/completions',
    },
  ])('$name', async ({ processUrl, apiBaseUrl, expectedUrl }) => {
    mockProcessEnv({ ENVOY_API_BASE_URL: processUrl });
    const firstPath = path.join(tempDir, 'first.json');
    const secondPath = path.join(tempDir, 'second.json');
    const provider = { id: 'envoy:route:stable', config: { apiKey: 'test-envoy-key' } };
    const baseConfig = {
      prompts: ['Hello'],
      providers: [provider],
      tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
    };
    fs.writeFileSync(
      firstPath,
      JSON.stringify({ ...baseConfig, env: { ENVOY_API_BASE_URL: 'https://suite.example/' } }),
    );
    fs.writeFileSync(
      secondPath,
      JSON.stringify({
        ...baseConfig,
        providers: [{ ...provider, config: { ...provider.config, apiBaseUrl } }],
      }),
    );

    expect((await readConfig(firstPath)).env?.ENVOY_API_BASE_URL).toBe('https://suite.example/');
    const first = await resolveConfigs({ config: [firstPath] }, {});
    expect(cliState.config).toBe(first.config);
    expect(first.testSuite.providers).toHaveLength(1);
    expect((await first.testSuite.providers[0].callApi('Hello')).output).toBe('Hello');
    expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([
      'https://suite.example/v1/chat/completions',
    ]);
    expect(cliState.config?.env?.ENVOY_API_BASE_URL).toBe('https://suite.example/');

    // The watch callback clears the file cache, but retains cliState between evaluations.
    clearConfigCache();
    vi.mocked(fetchWithCache).mockClear();
    expect((await readConfig(secondPath)).env?.ENVOY_API_BASE_URL).toBeUndefined();

    if (expectedUrl === undefined) {
      await expect(resolveConfigs({ config: [secondPath] }, {})).rejects.toThrow(
        'Envoy provider requires a gateway URL',
      );
      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(cliState.config?.env?.ENVOY_API_BASE_URL).toBe('https://suite.example/');
      return;
    }

    const second = await resolveConfigs({ config: [secondPath] }, {});
    expect(cliState.config).toBe(second.config);
    expect(second.config.env?.ENVOY_API_BASE_URL).toBeUndefined();
    expect(second.testSuite.providers).toHaveLength(1);
    expect((await second.testSuite.providers[0].callApi('Hello')).output).toBe('Hello');
    expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([expectedUrl]);
    expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'route:stable',
    });
  });

  it.each([
    {
      name: 'uses the process URL',
      processUrl: 'https://process.example/v1/',
      suiteUrl: undefined,
      apiBaseUrl: undefined,
      expectedUrl: 'https://process.example/v1/chat/completions',
    },
    {
      name: 'rejects a missing gateway',
      processUrl: undefined,
      suiteUrl: undefined,
      apiBaseUrl: undefined,
      expectedUrl: undefined,
    },
    {
      name: 'preserves the explicit provider URL',
      processUrl: 'https://process.example/v1/',
      suiteUrl: undefined,
      apiBaseUrl: 'https://provider.example/custom/',
      expectedUrl: 'https://provider.example/custom/chat/completions',
    },
    {
      name: 'uses the replacement suite URL',
      processUrl: 'https://process.example/v1/',
      suiteUrl: 'https://current-suite.example/v1/',
      apiBaseUrl: undefined,
      expectedUrl: 'https://current-suite.example/v1/chat/completions',
    },
  ])(
    'reloads an external YAML test provider and $name',
    async ({ processUrl, suiteUrl, apiBaseUrl, expectedUrl }) => {
      mockProcessEnv({ ENVOY_API_BASE_URL: processUrl });
      const firstPath = path.join(tempDir, 'first-external.json');
      const secondPath = path.join(tempDir, 'second-external.json');
      const testsDirectory = path.join(tempDir, 'cases');
      const testsPath = path.join(testsDirectory, 'tests.yaml');
      fs.mkdirSync(testsDirectory);
      fs.writeFileSync(path.join(testsDirectory, 'vars.yaml'), 'greeting: Hello\n');
      const writeTests = (url?: string) => {
        fs.writeFileSync(
          testsPath,
          `- provider:\n    id: envoy:external\n    config:\n      apiKey: test-envoy-key\n${
            url ? `      apiBaseUrl: ${JSON.stringify(url)}\n` : ''
          }  vars: vars.yaml\n  assert:\n    - type: equals\n      value: Hello\n`,
        );
      };
      const baseConfig = {
        prompts: ['{{greeting}}'],
        providers: ['echo'],
        tests: 'cases/tests.yaml',
      };
      fs.writeFileSync(
        firstPath,
        JSON.stringify({ ...baseConfig, env: { ENVOY_API_BASE_URL: 'https://suite.example/' } }),
      );
      fs.writeFileSync(
        secondPath,
        JSON.stringify({
          ...baseConfig,
          ...(suiteUrl ? { env: { ENVOY_API_BASE_URL: suiteUrl } } : {}),
        }),
      );
      writeTests();

      for (const [configPath, url] of [
        [firstPath, 'https://suite.example/v1/chat/completions'],
        [secondPath, expectedUrl],
      ] as const) {
        clearConfigCache();
        vi.mocked(fetchWithCache).mockClear();
        if (configPath === secondPath) {
          writeTests(apiBaseUrl);
        }
        if (url === undefined) {
          await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toThrow(
            'Envoy provider requires a gateway URL',
          );
          expect(fetchWithCache).not.toHaveBeenCalled();
          expect(cliState.config?.env?.ENVOY_API_BASE_URL).toBe('https://suite.example/');
          continue;
        }

        const { config, testSuite } = await resolveConfigs({ config: [configPath] }, {});
        expect(cliState.config).toBe(config);
        expect(testSuite.providers.map((provider) => provider.id())).toEqual(['echo']);
        expect(testSuite.tests).toHaveLength(1);
        const test = testSuite.tests?.[0];
        expect(test?.vars).toEqual({ greeting: 'Hello' });
        if (!test || !isApiProvider(test.provider)) {
          throw new Error('Expected the external YAML test to have an instantiated provider');
        }
        expect(test.provider.id()).toBe('external');
        expect((await test.provider.callApi('Hello')).output).toBe('Hello');
        expect(fetchWithCache).toHaveBeenCalledTimes(1);
        expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(url);
        expect(
          JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string),
        ).toMatchObject({
          model: 'external',
        });
      }
    },
  );

  it('loads combined external test providers with the combined suite environment', async () => {
    const configDirectory = path.join(tempDir, 'nested');
    const testsDirectory = path.join(configDirectory, 'cases');
    fs.mkdirSync(configDirectory);
    fs.mkdirSync(testsDirectory);
    fs.writeFileSync(
      path.join(testsDirectory, 'tests.yaml'),
      '- provider: envoy:external\n  assert:\n    - type: equals\n      value: Hello\n',
    );
    const configPath = path.join(configDirectory, 'promptfooconfig.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        prompts: ['Hello'],
        providers: ['echo'],
        env: { ENVOY_API_BASE_URL: 'https://combined.example/' },
        tests: 'cases/tests.yaml',
      }),
    );

    const config = await combineConfigs([path.join(tempDir, '*', 'promptfooconfig.json')]);
    const test = Array.isArray(config.tests) ? config.tests[0] : undefined;
    if (
      !test ||
      typeof test === 'string' ||
      !('provider' in test) ||
      !isApiProvider(test.provider)
    ) {
      throw new Error('Expected an instantiated external test provider');
    }

    await test.provider.callApi('Hello');
    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(
      'https://combined.example/v1/chat/completions',
    );
  });

  it('reloads the gateway used to construct the defaultTest provider', async () => {
    const firstPath = path.join(tempDir, 'first-default-test.json');
    const secondPath = path.join(tempDir, 'second-default-test.json');
    const baseConfig = {
      prompts: ['Hello'],
      providers: ['echo'],
      defaultTest: {
        provider: { id: 'envoy:default-test', config: { apiKey: 'test-envoy-key' } },
      },
      tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
    };
    fs.writeFileSync(
      firstPath,
      JSON.stringify({ ...baseConfig, env: { ENVOY_API_BASE_URL: 'https://suite.example/' } }),
    );
    fs.writeFileSync(secondPath, JSON.stringify(baseConfig));

    for (const [configPath, expectedUrl] of [
      [firstPath, 'https://suite.example/v1/chat/completions'],
      [secondPath, 'https://process.example/v1/chat/completions'],
    ]) {
      clearConfigCache();
      vi.mocked(fetchWithCache).mockClear();
      expect((await readConfig(configPath)).env?.ENVOY_API_BASE_URL).toBe(
        configPath === firstPath ? 'https://suite.example/' : undefined,
      );
      const { config, testSuite } = await resolveConfigs({ config: [configPath] }, {});
      expect(cliState.config).toBe(config);
      expect(testSuite.providers.map((provider) => provider.id())).toEqual(['echo']);

      // readTest instantiates this provider while building the returned config.
      const defaultTest = config.defaultTest;
      if (!defaultTest || typeof defaultTest === 'string' || !isApiProvider(defaultTest.provider)) {
        throw new Error('Expected resolveConfigs to instantiate the defaultTest provider');
      }
      expect((await defaultTest.provider.callApi('Hello')).output).toBe('Hello');
      expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([expectedUrl]);
      expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string)).toMatchObject({
        model: 'default-test',
      });
    }
  });
});
