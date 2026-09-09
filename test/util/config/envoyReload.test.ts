import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { isApiProvider } from '../../../src/types/providers';
import { clearConfigCache } from '../../../src/util/config/default';
import { readConfig, resolveConfigs } from '../../../src/util/config/load';
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
      expect(cliState.config?.env?.ENVOY_API_BASE_URL).toBeUndefined();
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
