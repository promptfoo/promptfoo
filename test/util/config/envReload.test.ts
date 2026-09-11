import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { evaluate as evaluateResolved } from '../../../src/evaluator';
import { renderLlmRubricPrompt } from '../../../src/matchers/rubric';
import Eval from '../../../src/models/eval';
import { evaluate } from '../../../src/node/evaluate';
import { loadApiProvider, loadApiProviders } from '../../../src/providers/index';
import { isApiProvider } from '../../../src/types/providers';
import { readAzureBlobText } from '../../../src/util/azureBlob';
import { combineConfigs, resolveConfigs } from '../../../src/util/config/load';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import { getNunjucksEngine } from '../../../src/util/templates';
import { mockProcessEnv } from '../utils';

import type { UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

vi.mock('../../../src/util/azureBlob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/azureBlob')>()),
  readAzureBlobText: vi.fn(),
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
      const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
      const provider =
        location === 'default'
          ? typeof testSuite.defaultTest === 'object' && testSuite.defaultTest.provider
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
    const cachedEngine = getNunjucksEngine();
    const result = await cliState.withEnv({ OPENAI_API_KEY: 'scoped-key' }, async () => {
      await Promise.resolve();
      return [
        getEnvString('OPENAI_API_KEY'),
        cachedEngine.renderString('{{ env.OPENAI_API_KEY }}', {}),
        getNunjucksEngineForFilePath().renderString('{{ env.OPENAI_API_KEY }}', {}),
      ];
    });
    expect(result).toEqual(['scoped-key', 'scoped-key', 'scoped-key']);
    expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
  });

  it('refreshes cached engine template flags per suite', async () => {
    const engine = getNunjucksEngine();
    expect(
      cliState.withEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' }, () =>
        engine.renderString('{{ env.OPENAI_API_KEY }}', {}),
      ),
    ).toBe('{{ env.OPENAI_API_KEY }}');
    expect(
      cliState.withEnv({ PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'true' }, () =>
        engine.renderString('{{ env.OPENAI_API_KEY }}', {}),
      ),
    ).toBe('');
    const rendered = await cliState.withEnv(
      { PROMPTFOO_DISABLE_TEMPLATING: 'true' },
      () =>
        new Promise<string>((resolve, reject) => {
          engine.renderString('{{ env.OPENAI_API_KEY }}', {}, (error, output) =>
            error ? reject(error) : resolve(output!),
          );
        }),
    );
    expect(rendered).toBe('{{ env.OPENAI_API_KEY }}');
  });

  it.each(['single', 'multiple'])(
    'retains scoped credentials through the %s loader',
    async (loader) => {
      const provider = await cliState.withEnv(
        {
          OPENAI_API_BASE_URL: 'https://suite.example/v1',
          OPENAI_API_KEY: 'suite-key',
        },
        async () =>
          loader === 'single'
            ? loadApiProvider('openai:chat:test-model')
            : (await loadApiProviders(['openai:chat:test-model']))[0],
      );
      await expectRequest(provider, 'suite');
    },
  );

  it('keeps concurrent evaluations scoped through runtime rendering and provider calls', async () => {
    const results = await Promise.all(
      ['first', 'second'].map(async (name) => {
        const result = await evaluate(
          {
            env: { OPENAI_API_KEY: `${name}-key` },
            prompts: ['{{ env.OPENAI_API_KEY }}'],
            providers: [
              {
                id: () => name,
                callApi: async (prompt) => {
                  await Promise.resolve();
                  return { output: `${prompt}:${getEnvString('OPENAI_API_KEY')}` };
                },
              },
            ],
            tests: [
              {
                assert: [
                  { type: 'equals', value: '{{ env.OPENAI_API_KEY }}:{{ env.OPENAI_API_KEY }}' },
                ],
              },
            ],
          },
          { cache: false },
        );
        return (await result.getResults())[0];
      }),
    );
    expect(results.map(({ success, score }) => ({ success, score }))).toEqual([
      { success: true, score: 1 },
      { success: true, score: 1 },
    ]);
    expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
  });

  it('renders a reloaded config without inheriting the previous environment', async () => {
    const configPath = writeConfig('templates', {
      providers: [
        { id: 'openai:chat:test-model', config: { apiBaseUrl: '{{ env.OPENAI_API_BASE_URL }}' } },
      ],
    });
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    await expectRequest(testSuite.providers[0], 'process');
  });

  it('keeps resolved CLI suites scoped after another config is loaded', async () => {
    const suites = [];
    for (const name of ['first', 'second']) {
      const resolved = await resolveConfigs(
        {
          config: [
            writeConfig(name, {
              env: { OPENAI_API_KEY: `${name}-key` },
              tests: [{ assert: [{ type: 'equals', value: `${name}-key` }] }],
            }),
          ],
        },
        {},
      );
      resolved.testSuite.providers = [
        {
          id: () => name,
          callApi: async () => {
            await Promise.resolve();
            return { output: getEnvString('OPENAI_API_KEY') };
          },
        },
      ];
      suites.push(resolved);
    }
    const results = await Promise.all(
      suites.map(async ({ config, testSuite }) => {
        const result = await evaluateResolved(testSuite, new Eval(config), {});
        return (await result.getResults())[0];
      }),
    );
    expect(results.map(({ success, score }) => ({ success, score }))).toEqual([
      { success: true, score: 1 },
      { success: true, score: 1 },
    ]);
  });

  it('renders rubric environments inside each concurrent suite', async () => {
    const results = await Promise.all(
      ['first', 'second'].map((name) =>
        cliState.withEnv({ OPENAI_API_KEY: `${name}-key` }, async () => {
          await Promise.resolve();
          return renderLlmRubricPrompt('{{ env.OPENAI_API_KEY }}', {});
        }),
      ),
    );
    expect(results).toEqual(['first-key', 'second-key']);
  });

  it('isolates cached engines during overlapping async renders', async () => {
    const engine = getNunjucksEngine();
    engine.addFilter(
      'defer',
      (value, callback) => {
        void Promise.resolve().then(() => callback(null, value));
      },
      true,
    );
    const results = await Promise.all(
      ['first', 'second'].map((name) =>
        cliState.withEnv(
          {
            OPENAI_API_KEY: `${name}-key`,
            PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: String(name === 'second'),
          },
          () =>
            new Promise<string>((resolve, reject) => {
              engine.renderString(
                '{{ "" | defer }}{{ env.OPENAI_API_KEY }}:{{ env.OPENAI_API_BASE_URL | default("hidden") }}',
                {},
                (error, output) => (error ? reject(error) : resolve(output ?? '')),
              );
            }),
        ),
      ),
    );
    expect(results).toEqual(['first-key:https://process.example/v1', 'second-key:hidden']);
  });

  it.each(['single', 'array'])(
    'retains scoped environment for a %s function provider',
    async (form) => {
      const callback = async () => ({ output: getEnvString('OPENAI_API_KEY') });
      const [provider] = await loadApiProviders(form === 'single' ? callback : [callback], {
        env: { OPENAI_API_KEY: 'function-key' },
      });
      expect((await provider.callApi('Hello')).output).toBe('function-key');
      expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
    },
  );

  it('preserves remote dataset references through config resolution', async () => {
    vi.mocked(readAzureBlobText).mockResolvedValue(
      '- vars: missing-vars.yaml\n  provider: file://missing-provider.js\n',
    );
    const configPath = writeConfig('remote', { tests: 'az://account/container/tests.yaml' });
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    expect(testSuite.tests).toEqual([
      { description: 'Row #1', vars: 'missing-vars.yaml', provider: 'file://missing-provider.js' },
    ]);
    expect(readAzureBlobText).toHaveBeenCalledTimes(1);
    const result = await evaluate(
      { prompts: ['Hello'], providers: ['echo'], tests: testSuite.tests },
      { cache: false },
    );
    const rows = await result.getResults();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ success: true, response: { output: 'Hello' } });
    expect(readAzureBlobText).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, {}])(
    'retains an explicit empty function-provider environment (%j)',
    async (env) => {
      const [provider] = await loadApiProviders(
        async () => ({ output: getEnvString('OPENAI_API_KEY') }),
        { env },
      );
      expect((await provider.callApi('Hello')).output).toBe('process-key');
      expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
    },
  );

  it('resolves nested default-test files from a later config directory', async () => {
    const first = writeConfig('first', {});
    const second = writeConfig('second', {
      defaultTest: 'file://defaults/test.yaml',
      tests: [{ vars: {} }],
    });
    const defaultsDir = path.join(path.dirname(second), 'defaults');
    fs.mkdirSync(defaultsDir);
    fs.writeFileSync(
      path.join(defaultsDir, 'test.yaml'),
      'vars: vars.yaml\nprovider: file://provider.yaml\n',
    );
    fs.writeFileSync(path.join(defaultsDir, 'vars.yaml'), 'source: nested-default\n');
    fs.writeFileSync(path.join(defaultsDir, 'provider.yaml'), 'id: echo\n');
    const { testSuite } = await resolveConfigs({ config: [first, second] }, {});
    expect(typeof testSuite.defaultTest === 'object' && testSuite.defaultTest.vars).toEqual({
      source: 'nested-default',
    });
    expect(
      typeof testSuite.defaultTest === 'object' && isApiProvider(testSuite.defaultTest.provider),
    ).toBe(true);
  });

  it('uses suite env while expanding nested prompt files', async () => {
    const previousFile = path.join(tempDir, 'previous.json');
    const suiteFile = path.join(tempDir, 'suite.json');
    fs.writeFileSync(previousFile, JSON.stringify('previous content'));
    fs.writeFileSync(suiteFile, JSON.stringify('suite content'));
    cliState.config = { env: { OPENAI_API_KEY: previousFile } };
    const configPath = writeConfig('prompt', {
      env: { OPENAI_API_KEY: suiteFile },
      prompts: ['file://prompt.yaml'],
    });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'prompt.yaml'),
      'content: file://{{ env.OPENAI_API_KEY }}\n',
    );
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    expect(JSON.parse(testSuite.prompts[0].raw)).toEqual({ content: 'suite content' });
  });

  it('loads array test references relative to each config directory', async () => {
    const paths = ['first', 'second'].map((name) => {
      const configPath = writeConfig(name, { tests: ['cases.yaml'] });
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'cases.yaml'),
        `- vars:\n    source: ${name}\n`,
      );
      return configPath;
    });
    const { testSuite } = await resolveConfigs({ config: paths }, {});
    expect(testSuite.tests?.map((test) => test.vars?.source)).toEqual(['first', 'second']);
  });

  it('loads nested default test files relative to their own directory', async () => {
    const firstConfigPath = writeConfig('first-default', {});
    const configPath = writeConfig('nested-default', {
      defaultTest: 'file://defaults/test.yaml',
      tests: [{ vars: { input: 'hello' } }],
    });
    const defaultsDir = path.join(path.dirname(configPath), 'defaults');
    fs.mkdirSync(defaultsDir);
    fs.writeFileSync(path.join(defaultsDir, 'test.yaml'), 'vars: vars.yaml\n');
    fs.writeFileSync(path.join(defaultsDir, 'vars.yaml'), 'source: nested\n');

    const { testSuite } = await resolveConfigs({ config: [firstConfigPath, configPath] }, {});

    expect(
      typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest.vars : undefined,
    ).toEqual({ source: 'nested' });
  });

  it('keeps labeled prompt files from different config directories distinct', async () => {
    const paths = ['first', 'second'].map((name) => {
      const configPath = writeConfig(name, {
        prompts: { 'file://prompt.txt': name, 'Inline prompt': 'inline' },
      });
      fs.writeFileSync(path.join(path.dirname(configPath), 'prompt.txt'), name);
      return configPath;
    });
    const { testSuite } = await resolveConfigs({ config: paths }, {});
    expect(testSuite.prompts.map(({ raw, label }) => ({ raw, label }))).toEqual(
      expect.arrayContaining([
        { raw: 'first', label: expect.stringMatching(/^first: /) },
        { raw: 'second', label: expect.stringMatching(/^second: /) },
        { raw: 'Inline prompt', label: 'inline' },
      ]),
    );
    expect(testSuite.prompts).toHaveLength(3);
  });

  it('loads scenario tests relative to each config directory', async () => {
    const paths = ['first', 'second'].map((name) => {
      const configPath = writeConfig(name, {});
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.scenarios = [{ config: [{}], tests: ['cases.yaml'] }];
      fs.writeFileSync(configPath, JSON.stringify(config));
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'cases.yaml'),
        `- vars:\n    source: ${name}\n`,
      );
      return configPath;
    });
    const { testSuite } = await resolveConfigs({ config: paths }, {});
    expect(testSuite.scenarios?.map((scenario) => scenario.tests?.[0].vars?.source)).toEqual([
      'first',
      'second',
    ]);
  });

  it.each(['string', 'object'] as const)(
    'resolves standalone %s test providers during evaluation',
    async (form) => {
      const testsPath = path.join(tempDir, 'cases.json');
      fs.writeFileSync(
        testsPath,
        JSON.stringify([
          { provider: 'openai:chat:test-model', assert: [{ type: 'equals', value: 'Hello' }] },
        ]),
      );
      const result = await evaluate(
        {
          env: { OPENAI_API_BASE_URL: 'https://suite.example/v1', OPENAI_API_KEY: 'suite-key' },
          prompts: ['Echo should not handle this'],
          providers: ['echo'],
          tests: form === 'string' ? testsPath : { path: testsPath },
        },
        { cache: false },
      );
      const [row] = await result.getResults();
      expect(row.success).toBe(true);
      expect(row.score).toBe(1);
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://suite.example/v1/chat/completions');
      expect(request?.headers).toMatchObject({ Authorization: 'Bearer suite-key' });
    },
  );

  it.each(['options', 'assertion', 'typed'] as const)(
    'resolves a standalone %s grader relative to its test file',
    async (location) => {
      const casesDir = path.join(tempDir, 'cases');
      fs.mkdirSync(casesDir);
      const testsPath = path.join(casesDir, 'tests.json');
      const provider =
        location === 'typed'
          ? { text: 'file://grader.yaml', embedding: 'file://unused.yaml' }
          : 'file://grader.yaml';
      fs.writeFileSync(path.join(casesDir, 'grader.yaml'), 'id: openai:chat:test-model\n');
      fs.writeFileSync(
        testsPath,
        JSON.stringify([
          {
            ...(location === 'options' ? { options: { provider } } : {}),
            assert: [
              {
                type: 'llm-rubric',
                value: 'The response is correct',
                ...(location === 'options' ? {} : { provider }),
              },
            ],
          },
        ]),
      );
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: '{"pass":true,"score":1,"reason":"Correct"}' },
              finish_reason: 'stop',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const result = await evaluate(
        {
          env: { OPENAI_API_BASE_URL: 'https://suite.example/v1', OPENAI_API_KEY: 'suite-key' },
          providers: ['echo'],
          prompts: ['answer'],
          tests: testsPath,
        },
        { cache: false },
      );
      const [row] = await result.getResults();
      expect(row.error).toBeUndefined();
      expect(row.success).toBe(true);
      expect(row.score).toBe(1);
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
    },
  );
});
