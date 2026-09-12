import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssertValidationError } from '../../../src/assertions/validateAssertions';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { evaluate as evaluateResolved } from '../../../src/evaluator';
import logger from '../../../src/logger';
import { getGradingProvider, getRemoteGradingContext } from '../../../src/matchers/providers';
import { renderLlmRubricPrompt } from '../../../src/matchers/rubric';
import Eval from '../../../src/models/eval';
import { evaluate } from '../../../src/node/evaluate';
import { nodeEvaluatorRuntime } from '../../../src/node/evaluatorRuntime';
import { loadApiProvider, loadApiProviders, resolveProvider } from '../../../src/providers/index';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { isApiProvider } from '../../../src/types/providers';
import { readAzureBlobText } from '../../../src/util/azureBlob';
import {
  ConfigResolutionError,
  combineConfigs,
  readConfig,
  resolveConfigs,
} from '../../../src/util/config/load';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import { sanitizeConfigForOutput } from '../../../src/util/sanitizer';
import { getNunjucksEngine } from '../../../src/util/templates';
import {
  loadTestsFromGlob,
  readTest,
  readTests,
  resolveTestsWatchPaths,
} from '../../../src/util/testCaseReader';
import { mockProcessEnv } from '../utils';

import type { TestCase, UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

vi.mock('../../../src/util/azureBlob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/azureBlob')>()),
  readAzureBlobText: vi.fn(),
}));

vi.mock('../../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/cloud')>()),
  getProviderFromCloud: vi.fn(async () => ({ id: 'echo' })),
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

  it('retains a discovered config test source for watch after parsing its rows', async () => {
    const testsPath = path.join(tempDir, 'cases.yaml');
    fs.writeFileSync(testsPath, '- vars: { input: first }');
    const resolved = await resolveConfigs(
      {},
      { basePath: tempDir, prompts: ['{{input}}'], providers: ['echo'], tests: 'cases.yaml' },
    );
    expect(resolved.config.tests).toMatchObject([{ vars: { input: 'first' } }]);
    expect(resolved.testSources).toEqual([{ tests: 'cases.yaml', basePath: tempDir }]);
    expect(
      resolved.testSources?.flatMap((source) =>
        resolveTestsWatchPaths(source.tests, source.basePath),
      ),
    ).toContain(testsPath);
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
    expect(new Headers(request?.headers as HeadersInit).get('authorization')).toBe(
      `Bearer ${name}-key`,
    );
  }

  it.each([undefined, {}])(
    'selects the same optional env in readers and loaders (%j)',
    async (env) => {
      await cliState.withEnv(
        { OPENAI_API_KEY: 'scoped-key', OPENAI_API_BASE_URL: 'https://scoped.example/v1' },
        async () => {
          const test = { provider: 'openai:chat:test-model' };
          const loaded = [
            (await readTest(test, '', false, env)).provider,
            (await readTests([test], '', env))[0].provider,
            await loadApiProvider(test.provider, { env }),
            (await loadApiProviders([test.provider], { env }))[0],
          ];
          for (const provider of loaded) {
            expect(provider).toHaveProperty('env', env ?? cliState.env);
          }
          const fn = await resolveProvider(
            async () => ({ output: getEnvString('OPENAI_API_KEY') }),
            {},
            { env },
          );
          expect(
            await cliState.withEnv({ OPENAI_API_KEY: 'later-key' }, () => fn.callApi('')),
          ).toEqual({
            output: env ? 'process-key' : 'scoped-key',
          });
        },
      );
    },
  );

  it.each(['assertion', 'typed', 'options', 'test'] as const)(
    'uses the provider file credentials for a %s provider',
    async (location) => {
      const providerPath = `file://${path.join(tempDir, 'provider.yaml')}`;
      fs.writeFileSync(
        providerPath.slice('file://'.length),
        'id: openai:chat:test-model\nenv:\n  OPENAI_API_KEY: file-key\n  OPENAI_API_BASE_URL: https://file.example/v1\n',
      );
      const provider = location === 'typed' ? { text: providerPath } : providerPath;
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: '{"pass":true,"score":1,"reason":"ok"}' } }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const result = await evaluate(
        {
          env: { OPENAI_API_KEY: 'suite-key' },
          prompts: ['answer'],
          providers: ['echo'],
          tests: [
            location === 'test'
              ? { provider: providerPath }
              : {
                  ...(location === 'options' ? { options: { provider } } : {}),
                  assert: [
                    {
                      type: 'llm-rubric',
                      value: 'Correct',
                      ...(location === 'options' ? {} : { provider }),
                    },
                  ],
                },
          ],
        },
        { cache: false },
      );
      expect((await result.getResults())[0].success).toBe(true);
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://file.example/v1/chat/completions');
      expect(new Headers(request?.headers as HeadersInit).get('authorization')).toBe(
        'Bearer file-key',
      );
    },
  );

  it('retains combined external test credentials after the loading scope exits', async () => {
    const config = await combineConfigs([externalConfig('suite')]);
    const test = Array.isArray(config.tests) ? config.tests[0] : undefined;
    await expectRequest(
      typeof test === 'object' && 'provider' in test ? test.provider : undefined,
      'suite',
    );
    expect(cliState.config?.env?.OPENAI_API_KEY).toBe('previous-key');
  });

  it.each(['sdk', 'resolved', 'cloud'] as const)(
    'isolates config and selected targets during overlapping %s evaluations',
    async (mode) => {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      let arrived = 0;
      const previous = cliState.config;
      cliState.selectedProviderConfigs = ['promptfoo://provider/stale'];
      const results = await Promise.all(
        ['first', 'second'].map(async (name) => {
          const targetConfig =
            mode === 'cloud'
              ? (await loadApiProvider(`promptfoo://provider/${name}`, { env: {} })).config
              : { linkedTargetId: `promptfoo://provider/${name}` };
          const provider = {
            id: () => `target-${name}`,
            config: targetConfig,
            async callApi() {
              if (++arrived === 2) {
                release();
              }
              await ready;
              const grader = await getGradingProvider('text', undefined, null);
              return {
                output: JSON.stringify({
                  grader: grader?.label,
                  target: getRemoteGradingContext().targetId,
                  purpose: cliState.config?.redteam?.purpose,
                }),
              };
            },
          };
          const config = {
            defaultTest: { options: { provider: { id: 'echo', label: name } } },
            redteam: { purpose: name },
            env: {},
          };
          const evaluation =
            mode === 'sdk'
              ? await evaluate(
                  { ...config, prompts: ['hello'], providers: [provider], tests: [{ vars: {} }] },
                  { cache: false },
                )
              : await evaluateResolved(
                  {
                    prompts: [{ raw: 'hello', label: 'hello' }],
                    providers: [provider],
                    tests: [{ vars: {} }],
                    env: {},
                  },
                  new Eval({ ...config, providers: ['promptfoo://provider/unselected'] }),
                  {},
                );
          const [row] = await evaluation.getResults();
          expect(row.success).toBe(true);
          return JSON.parse(String(row.response?.output));
        }),
      );
      expect(results).toEqual(
        ['first', 'second'].map((name) => ({ grader: name, target: name, purpose: name })),
      );
      expect(cliState.config).toBe(previous);
      expect(cliState.selectedProviderConfigs).toEqual(['promptfoo://provider/stale']);
    },
  );

  it.each(['scalar', 'array', 'generator', 'path'] as const)(
    'renders a %s test source with the merged config environment',
    async (form) => {
      const source = `file://{{ env.PROMPTFOO_CSV_DELIMITER }}/cases.${form === 'generator' || form === 'path' ? 'cjs' : 'yaml'}`;
      const first = writeConfig('source-owner', {
        tests:
          form === 'array' || form === 'generator'
            ? [source]
            : form === 'path'
              ? { path: source }
              : source,
      });
      const second = writeConfig('env-owner', { env: { PROMPTFOO_CSV_DELIMITER: 'data' } });
      const directory = path.join(path.dirname(first), 'data');
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'cases.yaml'), '- vars: { source: selected }');
      fs.writeFileSync(
        path.join(directory, 'cases.cjs'),
        "module.exports = () => [{ vars: { source: 'selected' } }];",
      );
      const { testSuite, testSources } = await resolveConfigs({ config: [first, second] }, {});
      expect(testSuite.tests?.map((test) => test.vars?.source)).toEqual(['selected']);
      const watched = cliState.withEnv(testSuite.env, () =>
        testSources?.flatMap((source) => resolveTestsWatchPaths(source.tests, source.basePath)),
      );
      expect(watched).toContain(
        path.join(directory, form === 'generator' || form === 'path' ? 'cases.cjs' : 'cases.yaml'),
      );
    },
  );

  it('preserves non-plain scenario values when templating is disabled', async () => {
    const configPath = path.join(tempDir, 'classes.cjs');
    fs.writeFileSync(
      configPath,
      `module.exports = {
      prompts: ['hello'], providers: ['echo'], env: { PROMPTFOO_DISABLE_TEMPLATING: 'true' },
      scenarios: [{ config: [{}], tests: [{ vars: {
        date: new Date('2026-01-01'), url: new URL('https://example.com'), bytes: Buffer.from('value')
      } }] }]
    };`,
    );
    const config = await combineConfigs([configPath]);
    const first = config.scenarios?.[0];
    const vars = first && typeof first === 'object' ? first.tests?.[0].vars : undefined;
    expect(vars?.date).toBeInstanceOf(Date);
    expect(vars?.url).toBeInstanceOf(URL);
    expect(Buffer.isBuffer(vars?.bytes)).toBe(true);
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

  it.each(['tests', 'scenarios'] as const)(
    'replays snapshotted %s after its generator is removed',
    async (location) => {
      const configPath = writeConfig(
        'snapshot',
        location === 'tests'
          ? { tests: 'file://tests.cjs' }
          : { scenarios: [{ config: [{}], tests: ['file://tests.cjs'] as unknown as TestCase[] }] },
      );
      const generator = path.join(path.dirname(configPath), 'tests.cjs');
      fs.writeFileSync(
        generator,
        `module.exports = () => [{ vars: { source: 'alpha' } }, { vars: { source: 'beta' } }];`,
      );
      const first = await resolveConfigs({ config: [configPath] }, {});
      const saved = JSON.stringify(first.config);
      fs.unlinkSync(generator);
      const replay = await resolveConfigs({}, JSON.parse(saved));
      const tests =
        location === 'tests' ? replay.testSuite.tests : replay.testSuite.scenarios?.[0].tests;
      expect(tests?.map((test) => test.vars?.source)).toEqual(['alpha', 'beta']);
      const rows =
        location === 'tests'
          ? first.config.tests
          : (first.config.scenarios?.[0] as { tests: TestCase[] })?.tests;
      expect(rows).toMatchObject([{ vars: { source: 'alpha' } }, { vars: { source: 'beta' } }]);
    },
  );

  it.each([
    { filterFirstN: 1 },
    { filterPattern: 'second' },
    { filterSample: 1, filterSampleSeed: 7 },
  ])('replays the selected scenario rows with %j', async (filters) => {
    const configPath = writeConfig('filtered-scenario', {
      scenarios: [
        {
          config: [{}],
          tests: [
            { description: 'first', vars: { source: 'first' }, provider: 'echo' },
            { description: 'second', vars: { source: 'second' }, provider: 'echo' },
          ],
        },
      ],
    });
    const first = await resolveConfigs({ config: [configPath], ...filters }, {});
    const selected = first.testSuite.scenarios?.[0].tests;
    expect(selected).toHaveLength(1);
    const saved = JSON.stringify(first.config);
    const replay = await resolveConfigs({}, JSON.parse(saved));
    expect(replay.testSuite.scenarios?.[0].tests?.map((test) => test.vars)).toEqual(
      selected?.map((test) => test.vars),
    );
    expect(first.config.scenarios?.[0]).toMatchObject({ tests: [{ provider: 'echo' }] });
  });

  it.each(['PROMPTFOO_DISABLE_TEMPLATING', 'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS'] as const)(
    'applies config-local %s before rendering env aliases',
    async (flag) => {
      const restore = mockProcessEnv({ ACTUAL_SECRET: 'fixture-short' });
      try {
        const configPath = writeConfig('restricted-alias', {
          env: { [flag]: 'true', VISIBLE_VALUE: '{{ env.ACTUAL_SECRET }}' },
          metadata: { visible: '{{ env.VISIBLE_VALUE }}' },
        });
        const config = await readConfig(configPath);
        expect(JSON.stringify(config)).not.toContain('fixture-short');
        expect(process.env.ACTUAL_SECRET).toBe('fixture-short');
      } finally {
        restore();
      }
    },
  );

  it('uses each scenario config row source root', async () => {
    const configs = ['first', 'second'].map((name) => {
      const configPath = writeConfig(name, {
        prompts: ['{{payload}}'],
        scenarios: [
          {
            config: [{ vars: { payload: 'file://payload.txt' } }],
            tests: [{ vars: { source: name } }],
          },
        ],
      });
      fs.writeFileSync(path.join(path.dirname(configPath), 'payload.txt'), name);
      return configPath;
    });
    const { config, testSuite } = await resolveConfigs({ config: configs }, {});
    const result = await evaluateResolved(testSuite, new Eval(config), {});
    const rows = await result.getResults();
    expect(rows.map((row) => row.response?.output).sort()).toEqual(['first', 'second']);
    expect(rows.every((row) => row.success)).toBe(true);
  });

  it('keeps loading other sources when a test glob matches no files', async () => {
    const configPath = writeConfig('optional-source', {
      tests: ['good/*.yaml', 'optional/*.yaml'],
    });
    const dir = path.dirname(configPath);
    fs.mkdirSync(path.join(dir, 'good'));
    fs.mkdirSync(path.join(dir, 'optional'));
    fs.writeFileSync(path.join(dir, 'good/one.yaml'), '- vars: { source: present }');
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    expect(testSuite.tests?.map((test) => test.vars?.source)).toEqual(['present']);
  });

  it('persists dataset rows independently of their source path', async () => {
    const snapshots = [];
    for (const name of ['first', 'second']) {
      const configPath = writeConfig(name, { tests: 'file://tests.csv' });
      fs.writeFileSync(path.join(path.dirname(configPath), 'tests.csv'), 'source\nalpha\nbeta\n');
      const { config } = await resolveConfigs({ config: [configPath] }, {});
      snapshots.push(config.tests);
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(snapshots[0]).toMatchObject([
      { vars: { source: 'alpha' } },
      { vars: { source: 'beta' } },
    ]);
  });

  it('keeps default and scenario providers out of saved config and replays tests once', async () => {
    const configPath = writeConfig('replay', {
      defaultTest: { provider: 'file://circular.cjs' },
      tests: [{ vars: { source: 'top' } }],
      scenarios: [
        {
          config: [{}],
          tests: [{ provider: 'file://circular.cjs', vars: { source: 'scenario' } }],
        },
      ],
    });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'circular.cjs'),
      `module.exports = class {
      constructor() { this.self = this; this.runtimeValue = 'private-runtime-value'; }
      id() { return 'circular'; }
      async callApi() { return { output: 'ok' }; }
    }`,
    );
    const first = await resolveConfigs({ config: [configPath] }, {});
    expect(
      isApiProvider(
        typeof first.testSuite.defaultTest === 'object' && first.testSuite.defaultTest.provider,
      ),
    ).toBe(true);
    const saved = JSON.stringify(first.config);
    expect(saved).not.toContain('private-runtime-value');
    const replay = await resolveConfigs({}, JSON.parse(saved));
    for (const { config, testSuite } of [first, replay]) {
      const result = await evaluateResolved(testSuite, new Eval(config), {});
      const rows = await result.getResults();
      expect(rows.map((row) => row.testCase.vars?.source).sort()).toEqual(['scenario', 'top']);
      expect(rows.every((row) => row.success)).toBe(true);
      expect(JSON.stringify(config)).not.toContain('private-runtime-value');
    }
  });

  it.each(['top-level', 'scenario'] as const)(
    'keeps a %s generator provider instance live without saving its runtime state',
    async (location) => {
      const configPath = writeConfig(
        'instance-generator',
        location === 'top-level'
          ? { tests: 'file://tests.cjs' }
          : { scenarios: [{ config: [{}], tests: ['file://tests.cjs'] as unknown as TestCase[] }] },
      );
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'tests.cjs'),
        `
      class Target {
        constructor() { this.self = this; this.privateState = 'private-runtime-value'; }
        id() { return 'generated-target'; }
        async callApi() { return { output: 'FROM-CLASS-INSTANCE' }; }
      }
      module.exports = () => [{ provider: new Target(), vars: { source: 'generated' } }];
    `,
      );
      const warning = vi.spyOn(logger, 'warn');
      try {
        const { config, testSuite } = await resolveConfigs({ config: [configPath] }, {});
        const tests = location === 'top-level' ? testSuite.tests : testSuite.scenarios?.[0].tests;
        expect(isApiProvider(tests?.[0].provider)).toBe(true);
        const result = await evaluateResolved(testSuite, new Eval(config), {});
        const [row] = await result.getResults();
        expect(row.response?.output).toBe('FROM-CLASS-INSTANCE');
        expect(row.success).toBe(true);
        expect(JSON.stringify(config)).not.toContain('private-runtime-value');
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining('cannot be saved for resume/retry'),
        );
      } finally {
        warning.mockRestore();
      }
    },
  );

  it('reuses configured file graders across assertion, options, typed, and assertion-set forms', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'judge.cjs'),
      `module.exports = class {
      constructor(options) { this.config = options.config; }
      id() { return 'file://judge.cjs'; }
      async callApi() { const pass = this.config.marker === 'configured'; return {
        output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: 'configured grader reuse' })
      }; }
    }`,
    );
    const assertion = { type: 'llm-rubric' as const, value: 'ok', provider: 'file://judge.cjs' };
    const result = await evaluate(
      {
        basePath: tempDir,
        prompts: ['answer'],
        providers: [{ id: 'file://judge.cjs', config: { marker: 'configured' } }],
        tests: [
          { assert: [assertion] },
          {
            options: { provider: 'file://judge.cjs' },
            assert: [{ type: 'llm-rubric', value: 'ok' }],
          },
          { assert: [{ ...assertion, provider: { text: 'file://judge.cjs' } }] },
          { assert: [{ type: 'assert-set', assert: [assertion] }] },
        ],
      },
      { cache: false },
    );
    const rows = await result.getResults();
    expect(rows).toHaveLength(4);
    expect(rows.map(({ success, score }) => ({ success, score }))).toEqual(
      Array(4).fill({ success: true, score: 1 }),
    );
  });

  it('does not interpret a remote row path as a local generator, including replay', async () => {
    const generator = path.join(tempDir, 'must-not-run.cjs');
    const marker = path.join(tempDir, 'executed');
    fs.writeFileSync(
      generator,
      `module.exports = () => { require('fs').writeFileSync(require('path').join(__dirname, 'executed'), 'executed'); return [{ vars: { source: 'local' } }]; };`,
    );
    const varsFile = path.join(tempDir, 'local-vars.yaml');
    const providerFile = path.join(tempDir, 'local-provider.cjs');
    fs.writeFileSync(varsFile, 'source: must-not-read');
    fs.writeFileSync(
      providerFile,
      `require('fs').writeFileSync(require('path').join(__dirname, 'executed'), 'imported'); module.exports = class { id() { return 'local'; } };`,
    );
    vi.mocked(readAzureBlobText).mockResolvedValue(
      JSON.stringify([
        { path: generator, vars: { source: 'remote' } },
        { vars: varsFile },
        { provider: `file://${providerFile}` },
      ]),
    );
    const first = await resolveConfigs(
      { config: [writeConfig('remote-path', { tests: 'az://account/container/rows.yaml' })] },
      {},
    );
    const result = await evaluate(
      { prompts: ['hello'], providers: ['echo'], tests: first.testSuite.tests?.slice(0, 1) },
      { cache: false },
    );
    expect(await result.getResults()).toHaveLength(1);
    expect(fs.existsSync(marker)).toBe(false);
    const reread = await readTests(first.testSuite.tests);
    const replay = await resolveConfigs({}, JSON.parse(JSON.stringify(first.config)));
    const exported = sanitizeConfigForOutput(first.config, { shouldStripMetadata: true });
    const exportedReplay = await resolveConfigs({}, JSON.parse(JSON.stringify(exported)));
    for (const tests of [reread, replay.testSuite.tests, exportedReplay.testSuite.tests]) {
      expect(tests?.[1].vars).toBe(varsFile);
      expect(tests?.[2].provider).toBe(`file://${providerFile}`);
    }
    expect(readAzureBlobText).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('keeps the SDK environment active while reading prompts and exporting results', async () => {
    const content = path.join(tempDir, 'selected.json');
    fs.writeFileSync(content, JSON.stringify('suite content'));
    fs.writeFileSync(
      path.join(tempDir, 'prompt.yaml'),
      'content: file://{{ env.OPENAI_API_KEY }}\nfiltered: "{{ input | selected }}"',
    );
    fs.writeFileSync(
      path.join(tempDir, 'filter.cjs'),
      "module.exports = (value) => 'filtered:' + value;",
    );
    const outputPath = path.join(tempDir, 'sdk-results.json');
    const result = await evaluate(
      {
        basePath: tempDir,
        outputPath,
        env: { OPENAI_API_KEY: content, PROMPTFOO_STRIP_PROMPT_TEXT: 'true' },
        prompts: ['file://prompt.yaml'],
        providers: ['echo'],
        tests: [{ vars: { input: 'sdk' } }],
        nunjucksFilters: { selected: 'filter.cjs' },
      },
      { cache: false },
    );
    const [row] = await result.getResults();
    expect(JSON.parse(row.response!.output as string)).toEqual({
      content: 'suite content',
      filtered: 'filtered:sdk',
    });
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(exported.results.prompts.map((prompt: { raw: string }) => prompt.raw)).toEqual([
      '[prompt stripped]',
    ]);
  });

  it('isolates direct config reads from the previous ref-parser and template flags', async () => {
    cliState.config = {
      env: { PROMPTFOO_DISABLE_REF_PARSER: 'true', PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'true' },
    };
    const configPath = writeConfig('ref-parser', {
      metadata: { $ref: '#/definitions/meta' },
      description: '{{ env.OPENAI_API_KEY }}',
    });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.definitions = { meta: { source: 'current' } };
    fs.writeFileSync(configPath, JSON.stringify(config));
    for (const result of [
      await readConfig(configPath),
      await combineConfigs([configPath]),
      (await resolveConfigs({ config: [configPath] }, {})).config,
    ]) {
      expect(result.metadata).toEqual({ source: 'current' });
      expect(result.description).toBe('process-key');
    }
  });

  it('honors a config-local templating opt-out during config loading', async () => {
    const reference = '{{ env.OPENAI_API_KEY }}';
    const result = await readConfig(
      writeConfig('templating-off', {
        env: { OPENAI_API_KEY: 'suite-key', PROMPTFOO_DISABLE_TEMPLATING: 'true' },
        description: reference,
      }),
    );
    expect(result.description).toBe(reference);
  });

  it.each(['defaultTest', 'scenarios'] as const)(
    'keeps %s file paths literal when templating is disabled',
    async (field) => {
      const reference = 'file://{{ env.SOURCE }}.yaml';
      const configPath = writeConfig('literal-paths', {
        env: { SOURCE: 'rendered', PROMPTFOO_DISABLE_TEMPLATING: 'true' },
        [field]: field === 'scenarios' ? [reference] : reference,
      });
      for (const [file, value] of [
        ['{{ env.SOURCE }}.yaml', 'literal'],
        ['rendered.yaml', 'wrong'],
      ]) {
        const test = { vars: { source: value } };
        fs.writeFileSync(
          path.join(path.dirname(configPath), file),
          JSON.stringify(field === 'scenarios' ? [{ config: [{}], tests: [test] }] : test),
        );
      }
      const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
      const test =
        field === 'scenarios' ? testSuite.scenarios?.[0].tests?.[0] : testSuite.defaultTest;
      expect(test).toMatchObject({ vars: { source: 'literal' } });
    },
  );

  it('uses defaultConfig.env when resolving a saved or programmatic config', async () => {
    const { testSuite } = await resolveConfigs(
      {},
      {
        prompts: ['hello'],
        providers: ['openai:chat:test-model'],
        env: { OPENAI_API_KEY: 'saved-key', OPENAI_API_BASE_URL: 'https://saved.example/v1' },
      },
    );
    await expectRequest(testSuite.providers[0], 'saved');
  });

  it.each([
    null,
    7,
    { type: 'assert-set' },
    { type: 'assert-set', assert: null },
    { type: 'assert-set', assert: {} },
  ])('reports malformed assertion %j through assertion validation', async (assertion) => {
    const configPath = writeConfig('invalid-assertion', { tests: 'tests.json' });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'tests.json'),
      JSON.stringify([{ assert: [assertion] }]),
    );
    await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toBeInstanceOf(
      AssertValidationError,
    );
  });

  it.each(['inline', 'jsonl', 'generator', 'remote'] as const)(
    'rejects misspelled payload fields in a described %s row',
    async (source) => {
      const row = {
        description: 'checks output',
        asssert: [{ type: 'equals', value: 'never checked' }],
      };
      const configPath = writeConfig(
        'typo-row',
        source === 'inline'
          ? { tests: [row] }
          : {
              tests:
                source === 'remote'
                  ? 'az://account/container/rows.json'
                  : source === 'jsonl'
                    ? 'cases.jsonl'
                    : 'cases.cjs',
            },
      );
      const directory = path.dirname(configPath);
      vi.mocked(readAzureBlobText).mockResolvedValue(JSON.stringify([row]));
      fs.writeFileSync(path.join(directory, 'cases.jsonl'), JSON.stringify(row));
      fs.writeFileSync(
        path.join(directory, 'cases.cjs'),
        `module.exports = () => [JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'cases.jsonl'), 'utf8'))];`,
      );
      await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toThrow(
        'Test case must contain',
      );
    },
  );

  it('retains configured grader selection from an external defaultTest', async () => {
    const configPath = writeConfig('default-grader', { defaultTest: 'file://defaults.yaml' });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'defaults.yaml'),
      'options:\n  provider: openai:chat:configured-judge',
    );
    redteamProviderManager.clearProvider();
    try {
      await resolveConfigs({ config: [configPath] }, {});
      const selection = await redteamProviderManager.getProviderSelection();
      expect(selection.source).toBe('explicit');
      expect(selection.provider.id()).toBe('openai:configured-judge');
    } finally {
      redteamProviderManager.clearProvider();
    }
  });

  it('does not load config test sources replaced by --assertions', async () => {
    const configPath = writeConfig('assertion-override', { tests: ['file://ignored.cjs'] });
    fs.writeFileSync(
      path.join(path.dirname(configPath), 'ignored.cjs'),
      "throw new Error('Ignored source was executed');",
    );
    const assertions = path.join(tempDir, 'assertions.yaml');
    fs.writeFileSync(assertions, '- type: contains\n  value: selected');
    fs.writeFileSync(path.join(tempDir, 'outputs.json'), JSON.stringify(['selected output']));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    try {
      const { testSuite, testSources } = await resolveConfigs(
        { config: [configPath], assertions, modelOutputs: 'outputs.json' },
        {},
      );
      expect(testSuite.tests?.map((test) => test.vars)).toEqual([{ output: 'selected output' }]);
      expect(testSources).toEqual([]);
    } finally {
      cwd.mockRestore();
    }
  });

  it('accepts a description-only generator row', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'description.cjs'),
      "module.exports = () => [{ description: 'only a description' }];",
    );
    const result = await evaluate(
      {
        basePath: tempDir,
        prompts: ['hello'],
        providers: ['echo'],
        tests: { path: 'description.cjs' },
      },
      { cache: false },
    );
    expect((await result.getResults())[0]).toMatchObject({
      success: true,
      response: { output: 'hello' },
    });
  });

  it.each(['string', 'array'] as const)('preserves a %s remote scenario source', async (form) => {
    const uri = 'az://account/container/tests.yaml';
    vi.mocked(readAzureBlobText).mockResolvedValue('- vars: { source: remote }');
    const configPath = writeConfig('remote-scenario', {
      scenarios: [
        { config: [{}], tests: (form === 'string' ? uri : [uri]) as unknown as TestCase[] },
      ],
    });
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    expect(testSuite.scenarios?.[0].tests?.map((test) => test.vars?.source)).toEqual(['remote']);
    expect(readAzureBlobText).toHaveBeenCalledExactlyOnceWith(uri);
  });

  it.each(['top', 'scenario'] as const)(
    'loads %s test sources beside a glob-matched config in a literal bracket directory',
    async (location) => {
      const configPath = writeConfig(
        '[slug]',
        location === 'top'
          ? { tests: ['cases.yaml'] }
          : { scenarios: [{ config: [{}], tests: ['cases.yaml'] as unknown as TestCase[] }] },
      );
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'cases.yaml'),
        '- vars: { source: selected }',
      );
      const { testSuite } = await resolveConfigs(
        { config: [path.join(tempDir, '*', 'config.json')] },
        {},
      );
      const tests = location === 'top' ? testSuite.tests : testSuite.scenarios?.[0].tests;
      expect(tests?.map((test) => test.vars?.source)).toEqual(['selected']);
    },
  );

  it.each(['top', 'scenario', 'external-scenario'] as const)(
    'retains a later config source and generator inputs during %s replay',
    async (location) => {
      const configs = ['first', 'second'].map((name) => {
        const source = { path: 'tests.cjs', config: { value: 'file://value.json' } };
        const configPath = writeConfig(
          name,
          location === 'top'
            ? { tests: source }
            : {
                scenarios:
                  location === 'scenario'
                    ? [{ config: [{}], tests: [source] as unknown as TestCase[] }]
                    : ['file://scenario.yaml'],
              },
        );
        const dir = path.dirname(configPath);
        fs.writeFileSync(path.join(dir, 'value.json'), JSON.stringify(name));
        fs.writeFileSync(
          path.join(dir, 'tests.cjs'),
          'module.exports = (config) => [{ vars: { source: config.value } }];',
        );
        fs.writeFileSync(
          path.join(dir, 'scenario.yaml'),
          JSON.stringify([{ config: [{}], tests: [source] }]),
        );
        return configPath;
      });
      const first = await resolveConfigs({ config: configs }, {});
      const replay = await resolveConfigs({}, JSON.parse(JSON.stringify(first.config)));
      for (const { testSuite } of [first, replay]) {
        const tests =
          location === 'top'
            ? testSuite.tests
            : testSuite.scenarios?.flatMap((scenario) => scenario.tests ?? []);
        expect(tests?.map((test) => test.vars?.source)).toEqual(['first', 'second']);
      }
    },
  );

  it.each([
    ['top', false],
    ['top', true],
    ['scenario', false],
    ['scenario', true],
  ] as const)(
    'retains inline vars and provider file origins during %s replay (object provider: %s)',
    async (location, objectProvider) => {
      const configs = ['first-inline', 'second-inline'].map((name) => {
        const test = {
          vars: 'vars.yaml',
          provider: objectProvider ? { id: 'file://provider.yaml' } : 'file://provider.yaml',
        };
        const configPath = writeConfig(
          name,
          location === 'top'
            ? { tests: [test] as unknown as TestCase[] }
            : { scenarios: [{ config: [{}], tests: [test] as unknown as TestCase[] }] },
        );
        const directory = path.dirname(configPath);
        fs.writeFileSync(path.join(directory, 'vars.yaml'), `source: ${name}`);
        fs.writeFileSync(path.join(directory, 'provider.yaml'), `id: echo\nlabel: ${name}`);
        return configPath;
      });
      const original = await resolveConfigs({ config: configs }, {});
      const replay = await resolveConfigs({}, JSON.parse(JSON.stringify(original.config)));
      for (const { testSuite } of [original, replay]) {
        const tests =
          location === 'top'
            ? testSuite.tests
            : testSuite.scenarios?.flatMap((scenario) => scenario.tests ?? []);
        expect(tests?.map((test) => ({ vars: test.vars, provider: test.provider }))).toMatchObject([
          { vars: { source: 'first-inline' }, provider: { label: 'first-inline' } },
          { vars: { source: 'second-inline' }, provider: { label: 'second-inline' } },
        ]);
      }
    },
  );

  it.each(['default', 'scenario', 'scenario-tests'] as const)(
    'renders %s file references using the combined env before making paths absolute',
    async (location) => {
      const shared = path.join(tempDir, 'shared');
      fs.mkdirSync(shared);
      fs.writeFileSync(path.join(shared, 'default.yaml'), 'vars: { source: shared }');
      fs.writeFileSync(
        path.join(shared, 'scenarios.yaml'),
        '- config: [{}]\n  tests: [{ vars: { source: shared } }]',
      );
      fs.writeFileSync(path.join(shared, 'tests.yaml'), '- vars: { source: shared }');
      const first = writeConfig(
        'template-first',
        location === 'default'
          ? { defaultTest: 'file://{{ env.SHARED_DIR }}/default.yaml' }
          : {
              scenarios:
                location === 'scenario'
                  ? ['file://{{ env.SHARED_DIR }}/scenarios.yaml']
                  : [
                      {
                        config: [{}],
                        tests: ['file://{{ env.SHARED_DIR }}/tests.yaml'] as unknown as TestCase[],
                      },
                    ],
            },
      );
      const second = writeConfig('template-second', {
        env: { SHARED_DIR: shared, PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'true' },
      });
      const { testSuite } = await resolveConfigs({ config: [first, second] }, {});
      const test =
        location === 'default' ? testSuite.defaultTest : testSuite.scenarios?.[0].tests?.[0];
      expect(test).toMatchObject({ vars: { source: 'shared' } });
    },
  );

  it.each(['top-level', 'scenario'])(
    'reports a missing literal %s source as a config error',
    async (location) => {
      const configPath = writeConfig('missing-scenario', {
        ...(location === 'scenario'
          ? {
              scenarios: [
                { config: [{}], tests: ['file://missing.yaml'] as unknown as TestCase[] },
              ],
            }
          : { tests: ['file://missing.yaml'] }),
      });
      const result = resolveConfigs({ config: [configPath] }, {});
      await expect(result).rejects.toBeInstanceOf(ConfigResolutionError);
      await expect(result).rejects.toThrow(path.join(path.dirname(configPath), 'missing.yaml'));
    },
  );

  it.each(['tests', 'vars'] as const)(
    'resolves an explicit CLI %s path from the working directory',
    async (flag) => {
      const configPath = writeConfig('cli-path', {});
      for (const [directory, source] of [
        [tempDir, 'working-directory'],
        [path.dirname(configPath), 'wrong-config-shadow'],
      ]) {
        fs.mkdirSync(path.join(directory, 'tests'));
        fs.writeFileSync(path.join(directory, 'tests/cases.yaml'), `- vars: { source: ${source} }`);
      }
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const { testSuite } = await resolveConfigs(
          { config: [configPath], [flag]: 'tests/cases.yaml' },
          {},
        );
        expect(testSuite.tests?.map((test) => test.vars?.source)).toEqual(['working-directory']);
      } finally {
        cwd.mockRestore();
      }
    },
  );

  it('uses config-relative references inside a nested defaultTest file', async () => {
    const configPath = writeConfig('default-root', { defaultTest: 'file://defaults/default.yaml' });
    const dir = path.dirname(configPath);
    fs.mkdirSync(path.join(dir, 'defaults'));
    fs.writeFileSync(
      path.join(dir, 'defaults/default.yaml'),
      'vars: vars.yaml\nprovider: file://provider.yaml',
    );
    fs.writeFileSync(path.join(dir, 'vars.yaml'), 'source: config-root');
    fs.writeFileSync(path.join(dir, 'provider.yaml'), 'id: echo\nlabel: root');
    fs.writeFileSync(path.join(dir, 'defaults/provider.yaml'), 'id: echo\nlabel: wrong-shadow');
    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    expect(testSuite.defaultTest).toMatchObject({
      vars: { source: 'config-root' },
      provider: { label: 'root' },
    });
  });

  it('retains each suite directory for deferred graders after another config loads', async () => {
    const suites = [];
    for (const name of ['fixture-first-unique', 'fixture-second-unique']) {
      const configPath = writeConfig(name, {
        prompts: [name],
        tests: [
          { assert: [{ type: 'llm-rubric', value: 'correct', provider: 'file://grader.cjs' }] },
        ],
      });
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'grader.cjs'),
        `module.exports = class {
        id() { return ${JSON.stringify(name)}; }
        async callApi(prompt) { const pass = prompt.includes(${JSON.stringify(name)}); return { output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: ${JSON.stringify(name)} }) }; }
      }`,
      );
      suites.push(await resolveConfigs({ config: [configPath] }, {}));
    }
    const results = await Promise.all(
      suites.map(async ({ config, testSuite }) => {
        const result = await evaluateResolved(testSuite, new Eval(config), {});
        return (await result.getResults())[0];
      }),
    );
    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(results.map((result) => result.gradingResult?.componentResults?.[0]?.reason)).toEqual([
      'fixture-first-unique',
      'fixture-second-unique',
    ]);
  });

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
    const basePath = cliState.basePath;
    const configPath = writeConfig('invalid', {
      prompts: ['file://missing-prompt.txt'],
      env: { OPENAI_API_KEY: 'rejected-key' },
    });
    await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toThrow();
    expect(cliState.config).toBe(previous);
    expect(cliState.basePath).toBe(basePath);
  });

  it.each(['tests', 'vars'] as const)(
    'does not load config test sources replaced by --%s',
    async (option) => {
      const configPath = writeConfig('overridden', { tests: ['file://ignored.cjs'] });
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'ignored.cjs'),
        "throw new Error('Ignored test source was executed');",
      );
      const selected = path.join(tempDir, 'selected.yaml');
      fs.writeFileSync(selected, '- vars: { source: selected }\n');
      const { testSuite } = await resolveConfigs({ config: [configPath], [option]: selected }, {});
      expect(testSuite.tests?.[0].vars).toEqual({ source: 'selected' });
    },
  );

  describe.each([
    ['readTests', readTests],
    ['loadTestsFromGlob', loadTestsFromGlob],
  ] as const)('%s standalone environment', (_name, loadTests) => {
    it('uses the supplied base path while expanding nested file references', async () => {
      const wrongBase = path.join(tempDir, 'previous');
      fs.mkdirSync(wrongBase);
      fs.writeFileSync(path.join(wrongBase, 'value.json'), JSON.stringify('wrong suite'));
      fs.writeFileSync(path.join(tempDir, 'value.json'), JSON.stringify('selected suite'));
      fs.writeFileSync(
        path.join(tempDir, 'cases.yaml'),
        '- metadata: { value: file://value.json }',
      );
      const [test] = await cliState.withBasePath(wrongBase, () => loadTests('cases.yaml', tempDir));
      expect(test.metadata?.value).toBe('selected suite');
    });

    it('uses the supplied environment while parsing CSV', async () => {
      cliState.config = { env: { PROMPTFOO_CSV_DELIMITER: '|' } };
      fs.writeFileSync(path.join(tempDir, 'cases.csv'), 'first;second\none;two\n');
      const [test] = await loadTests('cases.csv', tempDir, { PROMPTFOO_CSV_DELIMITER: ';' });
      expect(test.vars).toEqual({ first: 'one', second: 'two' });
      expect(getEnvString('PROMPTFOO_CSV_DELIMITER')).toBe('|');
    });

    it('lets an empty environment mask the previous suite during CSV parsing', async () => {
      const restore = mockProcessEnv({ PROMPTFOO_CSV_DELIMITER: ',' });
      try {
        cliState.config = { env: { PROMPTFOO_CSV_DELIMITER: ';' } };
        fs.writeFileSync(path.join(tempDir, 'cases.csv'), 'first,second\none,two\n');
        const [test] = await loadTests('cases.csv', tempDir, {});
        expect(test.vars).toEqual({ first: 'one', second: 'two' });
      } finally {
        restore();
      }
    });

    it('inherits the active environment when none is supplied', async () => {
      fs.writeFileSync(path.join(tempDir, 'cases.csv'), 'first;second\none;two\n');
      const [test] = await cliState.withEnv({ PROMPTFOO_CSV_DELIMITER: ';' }, () =>
        loadTests('cases.csv', tempDir),
      );
      expect(test.vars).toEqual({ first: 'one', second: 'two' });
    });
  });

  it('resolves prompts and external tests relative to every expanded config path', async () => {
    for (const name of ['first', 'second']) {
      const configPath = writeConfig(name, { tests: 'tests.yaml' });
      fs.writeFileSync(
        path.join(path.dirname(configPath), 'tests.yaml'),
        `- vars: { source: ${name} }\n`,
      );
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
    expect((config.tests as TestCase[]).map((test) => test.vars?.source).sort()).toEqual([
      'first',
      'second',
    ]);
    const { testSources } = await resolveConfigs(
      { config: [path.join(tempDir, '*', 'config.json')] },
      {},
    );
    expect(testSources?.map((source) => source.basePath).sort()).toEqual(
      ['first', 'second'].map((name) => path.join(tempDir, name)),
    );
    expect(testSources?.map((source) => source.tests)).toEqual(['tests.yaml', 'tests.yaml']);
  });

  it.each([{}, { OPENAI_API_KEY: 'replacement-key' }])(
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

  it.each([false, true])(
    'ignores undefined template env overrides with process access disabled=%s',
    (disabled) => {
      const engine = getNunjucksEngine();
      cliState.withEnv(
        {
          OPENAI_API_KEY: undefined,
          OPENAI_API_BASE_URL: '',
          PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: String(disabled),
        },
        () => {
          const env = engine.getGlobal('env');
          expect(engine.renderString('{{ env.OPENAI_API_KEY }}', {})).toBe(
            disabled ? '' : 'process-key',
          );
          expect('OPENAI_API_KEY' in env).toBe(!disabled);
          expect(Object.keys(env).includes('OPENAI_API_KEY')).toBe(!disabled);
          expect(env.OPENAI_API_BASE_URL).toBe('');
          expect('OPENAI_API_BASE_URL' in env).toBe(true);
        },
      );
    },
  );

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

  it.each(['', ' with context'])('refreshes env in cached imported macros%s', (context) => {
    const engine = getNunjucksEngine();
    const getSource = vi.spyOn(nunjucks.FileSystemLoader.prototype, 'getSource').mockReturnValue({
      src: '{% macro key() %}{{ env.OPENAI_API_KEY }}{% endmacro %}',
      path: 'macros.njk',
      noCache: false,
    });
    const template = `{% import "macros.njk" as m${context} %}{{ m.key() }}`;
    for (const key of ['first-key', 'second-key']) {
      expect(
        cliState.withEnv({ OPENAI_API_KEY: key }, () => engine.renderString(template, {})),
      ).toBe(key);
    }
    expect(getSource).toHaveBeenCalledTimes(1);
  });

  it.each(['PROMPTFOO_SELF_HOSTED', 'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS'] as const)(
    'keeps operator restrictions when a suite sets %s=false',
    (flag) => {
      const restore = mockProcessEnv({
        PROMPTFOO_SELF_HOSTED: 'true',
        PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: undefined,
      });
      try {
        cliState.withEnv({ [flag]: 'false' }, () => {
          expect(getNunjucksEngine().renderString('{{ env.OPENAI_API_KEY }}', {})).toBe('');
          expect(getNunjucksEngineForFilePath().renderString('{{ env.OPENAI_API_KEY }}', {})).toBe(
            '',
          );
          const resolved = nodeEvaluatorRuntime.resolveRuntimeTestSuite!({
            providers: [],
            prompts: [],
            tracing: {
              enabled: true,
              provider: {
                id: 'tempo',
                endpoint: 'https://tempo.example.com',
                auth: { token: '{{ env.OPENAI_API_KEY }}' },
              },
            },
          });
          expect(resolved.tracing?.provider?.auth?.token).toBe('{{ env.OPENAI_API_KEY }}');
        });
      } finally {
        restore();
      }
    },
  );

  it.each([false, true])(
    'supports callback-only rendering with templating disabled=%s',
    async (disabled) => {
      const engine = getNunjucksEngine();
      const result = await cliState.withEnv(
        { OPENAI_API_KEY: 'suite-key', PROMPTFOO_DISABLE_TEMPLATING: String(disabled) },
        () =>
          new Promise<string>((resolve, reject) => {
            engine.renderString(
              '{{ env.OPENAI_API_KEY }}',
              (error: Error | null, output: string | null) =>
                error ? reject(error) : resolve(output!),
            );
          }),
      );
      expect(result).toBe(disabled ? '{{ env.OPENAI_API_KEY }}' : 'suite-key');
    },
  );

  it('does not enumerate process.env for ordinary renders', () => {
    const ownKeys = vi.fn(Reflect.ownKeys);
    const engine = getNunjucksEngine();
    vi.stubGlobal('process', { ...process, env: new Proxy(process.env, { ownKeys }) });
    try {
      for (let index = 0; index < 100; index++) {
        expect(engine.renderString('{{ env.OPENAI_API_KEY }}', {})).toBe('previous-key');
      }
      expect(ownKeys).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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
    let arrivals = 0;
    let release!: () => void;
    const bothProvidersStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
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
                  if (++arrivals === 2) {
                    release();
                  }
                  await bothProvidersStarted;
                  return { output: `${prompt}:${getEnvString('OPENAI_API_KEY')}` };
                },
              },
            ],
            tests: [
              {
                assert: [
                  { type: 'equals', value: '{{ env.OPENAI_API_KEY }}:{{ env.OPENAI_API_KEY }}' },
                  { type: 'equals', value: `${name}-key:${name}-key` },
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
    expect(results.map(({ response }) => response?.output)).toEqual([
      'first-key:first-key',
      'second-key:second-key',
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

  it.each([
    ['inherits config env when omitted', undefined, 'previous-key'],
    ['replaces config env when empty', {}, 'process-key'],
  ] as const)('resolved evaluation %s', async (_name, env, expectedKey) => {
    const result = await evaluateResolved(
      {
        ...(env && { env }),
        prompts: [{ raw: 'Hello', label: 'Hello' }],
        providers: [
          { id: () => 'echo', callApi: async () => ({ output: getEnvString('OPENAI_API_KEY') }) },
        ],
        tests: [{ assert: [{ type: 'equals', value: expectedKey }] }],
      },
      new Eval({}),
      {},
    );
    expect((await result.getResults())[0]).toMatchObject({ success: true, score: 1 });
    expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
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

  it.each(['scalar', 'array'] as const)(
    'preserves %s remote dataset references through config resolution',
    async (form) => {
      vi.mocked(readAzureBlobText).mockResolvedValue(
        '- vars: missing-vars.yaml\n  provider: file://missing-provider.js\n',
      );
      const source = 'az://account/container/tests.yaml';
      const configPath = writeConfig('remote', { tests: form === 'array' ? [source] : source });
      const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
      expect(testSuite.tests).toEqual([
        {
          description: 'Row #1',
          vars: 'missing-vars.yaml',
          provider: 'file://missing-provider.js',
          metadata: { __promptfoo: { remote: true } },
        },
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
    },
  );

  it.each([{}, undefined])(
    'retains an empty captured function-provider environment (%j)',
    async (env) => {
      const [provider] = await cliState.withEnv(undefined, () =>
        loadApiProviders(async () => ({ output: getEnvString('OPENAI_API_KEY') }), { env }),
      );
      const response = await cliState.withEnv({ OPENAI_API_KEY: 'later-key' }, () =>
        provider.callApi('Hello'),
      );
      expect(response.output).toBe('process-key');
      expect(getEnvString('OPENAI_API_KEY')).toBe('previous-key');
    },
  );

  it.each(['inline', 'file'] as const)(
    'inherits credentials past undefined %s provider overrides',
    async (form) => {
      const providerFile = path.join(tempDir, 'provider.yaml');
      fs.writeFileSync(
        providerFile,
        'id: openai:chat:test-model\nenv:\n  OPENAI_API_KEY: file-key',
      );
      const provider = await loadApiProvider(
        form === 'file' ? `file://${providerFile}` : 'openai:chat:test-model',
        {
          env: { OPENAI_API_KEY: 'suite-key', OPENAI_API_BASE_URL: 'https://suite.example/v1' },
          options: { env: { OPENAI_API_KEY: undefined } },
        },
      );
      await cliState.withEnv({ OPENAI_API_KEY: 'later-key' }, () => provider.callApi('Hello'));
      const [, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(new Headers(request?.headers as HeadersInit).get('authorization')).toBe(
        `Bearer ${form === 'file' ? 'file' : 'suite'}-key`,
      );
    },
  );

  it('passes provider overrides through registry wrappers and constructor env reads', async () => {
    const provider = await loadApiProvider('cloudflare-ai:chat:test-model', {
      env: { CLOUDFLARE_API_KEY: 'suite-key', CLOUDFLARE_ACCOUNT_ID: 'suite-account' },
      options: {
        env: { CLOUDFLARE_API_KEY: 'provider-key', CLOUDFLARE_ACCOUNT_ID: 'provider-account' },
        config: { accountIdEnvar: 'CLOUDFLARE_ACCOUNT_ID' },
      },
    });
    await provider.callApi('Hello');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/provider-account/ai/v1/chat/completions',
    );
    expect(new Headers(request?.headers as HeadersInit).get('authorization')).toBe(
      'Bearer provider-key',
    );
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

  it.each(['inline', 'file'] as const)(
    'uses the direct readTest environment while expanding %s vars sources',
    async (form) => {
      const previousFile = path.join(tempDir, 'previous.json');
      const suiteFile = path.join(tempDir, 'suite.json');
      fs.writeFileSync(previousFile, JSON.stringify('previous content'));
      fs.writeFileSync(suiteFile, JSON.stringify('suite content'));
      fs.writeFileSync(
        path.join(tempDir, 'vars.yaml'),
        'source: file://{{ env.OPENAI_API_KEY }}\n',
      );
      fs.writeFileSync(path.join(tempDir, 'test.yaml'), 'vars: vars.yaml\n');
      cliState.config = { env: { OPENAI_API_KEY: previousFile } };
      const test = await readTest(
        form === 'file' ? 'test.yaml' : { vars: 'vars.yaml' },
        tempDir,
        false,
        { OPENAI_API_KEY: suiteFile },
      );
      expect(test.vars).toEqual({ source: 'suite content' });
      expect(getEnvString('OPENAI_API_KEY')).toBe(previousFile);
    },
  );

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

  it.each(['yaml', 'json', 'jsonl'])(
    'resolves nested %s test references from their owning config directory',
    async (extension) => {
      cliState.basePath = tempDir;
      fs.writeFileSync(path.join(tempDir, 'grader.yaml'), 'id: echo\nlabel: stale\n');
      const paths = ['first', 'second'].map((name) => {
        const configPath = writeConfig(name, { tests: [`nested/cases.${extension}`] });
        const sourceDir = path.join(path.dirname(configPath), 'nested');
        fs.mkdirSync(sourceDir);
        fs.writeFileSync(
          path.join(path.dirname(configPath), 'grader.yaml'),
          `id: echo\nlabel: ${name}\n`,
        );
        fs.writeFileSync(path.join(sourceDir, 'grader.yaml'), 'id: echo\nlabel: wrong-shadow\n');
        const test = { provider: 'file://grader.yaml', vars: {} };
        fs.writeFileSync(
          path.join(sourceDir, `cases.${extension}`),
          extension === 'yaml'
            ? '- provider: file://grader.yaml\n  vars: {}\n'
            : JSON.stringify(extension === 'json' ? [test] : test),
        );
        return configPath;
      });
      const { testSuite } = await resolveConfigs({ config: paths }, {});
      expect(
        testSuite.tests?.map((test) => isApiProvider(test.provider) && test.provider.label),
      ).toEqual(['first', 'second']);
    },
  );

  it.each(['relative', 'absolute'] as const)(
    'uses the same %s basePath for discovered, explicit, and replayed configs',
    async (form) => {
      const source = path.join(tempDir, 'base-override/assets');
      const configPath = writeConfig('base-override', {
        basePath: form === 'relative' ? 'assets' : source,
        tests: ['cases.yaml'],
      });
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'cases.yaml'), '- vars: { source: custom-base }');
      const discovered = await resolveConfigs({}, await readConfig(configPath));
      const explicit = await resolveConfigs({ config: [configPath] }, {});
      const replay = await resolveConfigs({}, JSON.parse(JSON.stringify(explicit.config)));
      for (const loaded of [discovered, explicit, replay]) {
        expect(loaded.basePath).toBe(source);
        expect(loaded.config.basePath).toBe(source);
        expect(loaded.testSuite.tests?.[0].vars?.source).toBe('custom-base');
      }
      expect(explicit.testSources?.[0].basePath).toBe(source);
    },
  );

  it('retains an absolute SDK basePath in saved config', async () => {
    const result = await evaluate(
      {
        basePath: path.relative(process.cwd(), tempDir),
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: {} }],
      },
      { cache: false },
    );
    expect(result.config.basePath).toBe(tempDir);
  });

  it('scopes a direct readTest to its supplied directory', async () => {
    const current = path.join(tempDir, 'current');
    fs.mkdirSync(current);
    cliState.basePath = tempDir;
    fs.writeFileSync(path.join(tempDir, 'value.json'), JSON.stringify('stale'));
    fs.writeFileSync(path.join(current, 'value.json'), JSON.stringify('current'));
    fs.writeFileSync(path.join(current, 'vars.yaml'), 'source: file://value.json');
    const test = await readTest({ vars: 'vars.yaml' }, current);
    expect(test.vars?.source).toBe('current');
    expect(cliState.basePath).toBe(tempDir);
  });

  it.each(['json', 'jsonl', 'yaml'])(
    'loads bare vars paths in array %s rows from the config directory',
    async (extension) => {
      const configPath = writeConfig('array-root', { tests: [`nested/cases.${extension}`] });
      const base = path.dirname(configPath);
      fs.mkdirSync(path.join(base, 'nested'));
      fs.writeFileSync(path.join(base, 'vars.yaml'), 'source: root');
      fs.writeFileSync(path.join(base, 'nested/vars.yaml'), 'source: wrong-shadow');
      const test = { vars: 'vars.yaml' };
      fs.writeFileSync(
        path.join(base, `nested/cases.${extension}`),
        extension === 'yaml'
          ? '- vars: vars.yaml'
          : JSON.stringify(extension === 'json' ? [test] : test),
      );
      const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
      expect(testSuite.tests?.[0].vars?.source).toBe('root');
    },
  );

  it('expands file references inside vars files relative to the config', async () => {
    cliState.basePath = tempDir;
    fs.writeFileSync(path.join(tempDir, 'value.json'), JSON.stringify('selected'));
    fs.mkdirSync(path.join(tempDir, 'nested'));
    fs.writeFileSync(path.join(tempDir, 'nested/value.json'), JSON.stringify('wrong-shadow'));
    fs.writeFileSync(path.join(tempDir, 'nested/vars.yaml'), 'source: file://value.json\n');
    const test = await readTest({ vars: 'nested/vars.yaml' }, tempDir);
    expect(test.vars).toEqual({ source: 'selected' });
  });

  it('resolves generator config files from the supplied base path', async () => {
    cliState.basePath = tempDir;
    fs.writeFileSync(path.join(tempDir, 'value.json'), JSON.stringify('stale'));
    const sourceDir = path.join(tempDir, 'source');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'value.json'), JSON.stringify('selected'));
    fs.writeFileSync(
      path.join(sourceDir, 'cases.cjs'),
      'module.exports = (config) => [{ vars: { source: config.value } }];',
    );
    const [test] = await readTests(
      { path: 'cases.cjs', config: { value: 'file://value.json' } },
      sourceDir,
    );
    expect(test.vars).toEqual({ source: 'selected' });
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

  it.each(['inline', 'file', 'scalar', 'glob'])(
    'loads %s scenarios relative to each config directory',
    async (form) => {
      const paths = ['first', 'second'].map((name) => {
        const configPath = writeConfig(name, {});
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.scenarios =
          form === 'inline'
            ? [{ config: [{}], tests: ['cases.yaml'] }]
            : form === 'scalar'
              ? 'file://scenarios.yaml'
              : [form === 'glob' ? 'file://scenario*.yaml' : 'file://scenarios.yaml'];
        fs.writeFileSync(configPath, JSON.stringify(config));
        fs.writeFileSync(
          path.join(path.dirname(configPath), 'cases.yaml'),
          `- vars:\n    source: ${name}\n`,
        );
        fs.writeFileSync(
          path.join(path.dirname(configPath), 'scenarios.yaml'),
          `- config: [{}]\n  tests:\n    - vars:\n        source: ${name}\n`,
        );
        return configPath;
      });
      const { testSuite } = await resolveConfigs({ config: paths }, {});
      expect(testSuite.scenarios?.map((scenario) => scenario.tests?.[0].vars?.source)).toEqual([
        'first',
        'second',
      ]);
    },
  );

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
    'resolves a standalone %s grader relative to the suite directory',
    async (location) => {
      const casesDir = path.join(tempDir, 'cases');
      fs.mkdirSync(casesDir);
      const testsPath = path.join(casesDir, 'tests.json');
      const provider =
        location === 'typed'
          ? { text: 'file://grader.yaml', embedding: 'file://unused.yaml' }
          : 'file://grader.yaml';
      fs.writeFileSync(path.join(tempDir, 'grader.yaml'), 'id: openai:chat:test-model\n');
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
          basePath: tempDir,
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
