import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { runDbMigrations } from '../src/migrate';
import { evaluate } from '../src/node/evaluate';
import { REDACTED } from '../src/util/sanitizer';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider, ProviderOptions, TestCase } from '../src/types';

function createMockProvider(id: string): ApiProvider {
  return {
    id: () => id,
    callApi: vi.fn().mockResolvedValue({
      output: 'mock answer',
      tokenUsage: createEmptyTokenUsage(),
    }),
  };
}

function calledPrompts(provider: ApiProvider): string[] {
  return vi.mocked(provider.callApi).mock.calls.map(([prompt]) => prompt);
}

describe('programmatic scenario config expansion', () => {
  const tmpDirs: string[] = [];

  const makeTmpDir = (): string => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-'));
    tmpDirs.push(tmpDir);
    return tmpDir;
  };

  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const tmpDir of tmpDirs.splice(0)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('expands scenario config file refs for programmatic evals', async () => {
    const tmpDir = makeTmpDir();
    const matrixPath = path.join(tmpDir, 'matrix.json');
    fs.writeFileSync(matrixPath, JSON.stringify([{ vars: { topic: 'billing' } }]));

    const provider = createMockProvider('scenario-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [
        {
          config: [{ $values: `file://${matrixPath}` }],
          tests: [{}],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('runs the default test when programmatic evals omit scenarios', async () => {
    const provider = createMockProvider('default-scenario-provider');

    await evaluate({
      prompts: ['Default prompt'],
      providers: [provider],
    });

    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(calledPrompts(provider)).toEqual(['Default prompt']);
  });

  it('runs scenario config rows when programmatic evals omit scenario tests', async () => {
    const provider = createMockProvider('omitted-scenario-tests-provider');

    const record = await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [{ config: [{ vars: { topic: 'billing' } }] }],
      writeLatestResults: false,
    });

    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
    expect(record.config.scenarios?.[0]).toMatchObject({ tests: [{}] });
  });

  it('accepts frozen programmatic scenario config rows', async () => {
    const provider = createMockProvider('frozen-scenario-row-provider');
    const row = Object.freeze({ vars: { topic: 'billing' } });

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [{ config: [row], tests: [{}] }],
      writeLatestResults: false,
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('resolves scenario config refs relative to programmatic scenario files', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ $values: 'file://matrix.json' }],
          tests: [{}],
        },
      ]),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'matrix.json'),
      JSON.stringify([{ vars: { topic: 'billing' } }]),
    );

    const provider = createMockProvider('scenario-file-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('loads config-row and test-row providers relative to an external scenario file', async () => {
    const tmpDir = makeTmpDir();
    const scenarioDir = path.join(tmpDir, 'scenarios');
    fs.mkdirSync(scenarioDir, { recursive: true });
    const providerSource = `
      const fs = require('node:fs');
      const path = require('node:path');
      module.exports = class FixtureProvider {
        constructor(options = {}) { this.options = options; }
        id() { return this.options.id || 'fixture-provider'; }
        async callApi() {
          const ref = this.options.config.payload;
          const rawPath = ref.startsWith('file://') ? ref.slice(7) : ref;
          const payloadPath = path.isAbsolute(rawPath) ? rawPath : path.join(__dirname, rawPath);
          const payload = fs.readFileSync(payloadPath, 'utf8').trim();
          fs.appendFileSync(path.join(__dirname, 'calls.log'), payload + '\\n');
          return { output: payload };
        }
      };
    `;
    fs.writeFileSync(path.join(tmpDir, 'provider.cjs'), providerSource);
    fs.writeFileSync(path.join(tmpDir, 'payload.txt'), 'parent-decoy');
    fs.writeFileSync(path.join(scenarioDir, 'provider.cjs'), providerSource);
    fs.writeFileSync(path.join(scenarioDir, 'payload.txt'), 'scenario-provider');
    fs.writeFileSync(path.join(scenarioDir, 'vars.yaml'), 'extra: from-vars-file\n');
    const scenarioPath = path.join(scenarioDir, 'scenario.json');
    fs.writeFileSync(
      scenarioPath,
      JSON.stringify([
        {
          config: [
            {
              vars: { source: 'config-row' },
              provider: {
                id: './provider.cjs',
                label: 'scenario-config-provider',
                config: { payload: 'file://payload.txt' },
              },
            },
          ],
          tests: [{}],
        },
        {
          config: [{ vars: { source: 'test-row' } }],
          tests: [
            {
              vars: 'file://vars.yaml',
              provider: {
                id: 'file://provider.cjs',
                label: 'scenario-test-provider',
                config: { payload: 'file://payload.txt' },
              },
            },
          ],
        },
      ]),
    );
    const originalCwd = process.cwd();
    const suiteProvider = createMockProvider('suite-provider');

    let record: Awaited<ReturnType<typeof evaluate>>;
    try {
      process.chdir(tmpDir);
      record = await evaluate({
        prompts: ['{{source}} {{extra}}'],
        providers: [suiteProvider],
        scenarios: [`file://${scenarioPath}`],
        writeLatestResults: false,
      });
    } finally {
      process.chdir(originalCwd);
    }
    const summary = await record.toEvaluateSummary();
    const resolvedScenarios = record.config.scenarios as unknown as
      | Array<{
          config: Array<{ provider?: unknown }>;
          tests: Array<{ provider?: unknown }>;
        }>
      | undefined;
    const configProvider = resolvedScenarios?.[0]?.config[0]?.provider as
      | { id: string; config: { payload: string } }
      | undefined;
    const testProvider = resolvedScenarios?.[1]?.tests[0]?.provider as { id: string } | undefined;

    expect(summary.results.map((result) => result.response?.output)).toEqual([
      'scenario-provider',
      'scenario-provider',
    ]);
    expect(suiteProvider.callApi).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(scenarioDir, 'calls.log'), 'utf8').trim().split('\n')).toEqual(
      ['scenario-provider', 'scenario-provider'],
    );
    expect(fs.existsSync(path.join(tmpDir, 'calls.log'))).toBe(false);
    expect(configProvider).toMatchObject({
      id: path.join(scenarioDir, 'provider.cjs'),
      config: { payload: `file://${path.join(scenarioDir, 'payload.txt')}` },
    });
    expect(testProvider).toMatchObject({
      id: `file://${path.join(scenarioDir, 'provider.cjs')}`,
    });
  });

  it('does not fall back to a parent provider or expose its options when a scenario provider is missing', async () => {
    const tmpDir = makeTmpDir();
    const scenarioDir = path.join(tmpDir, 'scenarios');
    fs.mkdirSync(scenarioDir, { recursive: true });
    const parentCallsPath = path.join(tmpDir, 'parent-calls.log');
    fs.writeFileSync(
      path.join(tmpDir, 'provider.cjs'),
      `module.exports = class ParentDecoy {
        id() { return 'parent-decoy'; }
        async callApi() {
          require('node:fs').writeFileSync(${JSON.stringify(parentCallsPath)}, 'called');
          return { output: 'parent-decoy' };
        }
      };`,
    );
    const secret = 'provider-option-secret-sentinel';
    const scenarioPath = path.join(scenarioDir, 'scenario.json');
    fs.writeFileSync(
      scenarioPath,
      JSON.stringify([
        {
          config: [
            {
              provider: {
                id: 'file://provider.cjs',
                config: { apiKey: secret },
              },
            },
          ],
          tests: [{}],
        },
      ]),
    );
    const originalCwd = process.cwd();
    const suiteProvider = createMockProvider('suite-provider');

    let error: unknown;
    try {
      process.chdir(tmpDir);
      await evaluate({
        prompts: ['Prompt'],
        providers: [suiteProvider],
        scenarios: [`file://${scenarioPath}`],
        writeLatestResults: false,
      });
    } catch (caught) {
      error = caught;
    } finally {
      process.chdir(originalCwd);
    }

    expect(error).toBeDefined();
    expect(String(error)).toContain(path.join(scenarioDir, 'provider.cjs'));
    expect(String(error)).not.toContain(secret);
    expect(fs.existsSync(parentCallsPath)).toBe(false);
    expect(suiteProvider.callApi).not.toHaveBeenCalled();
  });

  it('redacts source environment values from scenario provider load errors', async () => {
    const secret = 'literal-secret-canary-providerpath-9695';
    vi.stubEnv('PROVIDER_PATH_SECRET', secret);

    let error: unknown;
    try {
      await evaluate({
        prompts: ['Prompt'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [
          {
            config: [{ provider: 'file://{{ env.PROVIDER_PATH_SECRET }}/missing-provider.cjs' }],
            tests: [{}],
          },
        ],
        writeLatestResults: false,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(String(error)).toContain('Failed to load scenario target provider');
    expect(String(error)).not.toContain(secret);
    expect(String((error as Error & { cause?: unknown }).cause)).not.toContain(secret);
  });

  it('clears the global duration timer when scenario provider resolution fails', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await expect(
        evaluate(
          {
            prompts: ['Prompt'],
            providers: [createMockProvider('suite-provider')],
            scenarios: [
              {
                config: [{ provider: 'file:///definitely-missing-scenario-provider.cjs' }],
                tests: [{}],
              },
            ],
            writeLatestResults: false,
          },
          { maxEvalTimeMs: 60_000 },
        ),
      ).rejects.toThrow(/Failed to load scenario target provider/);

      const durationTimer = setTimeoutSpy.mock.results.find(
        (_result, index) => setTimeoutSpy.mock.calls[index][1] === 60_000,
      )?.value;
      expect(durationTimer).toBeDefined();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(durationTimer);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it('redacts source environment values from scenario grader failures', async () => {
    const secret = 'grader-secret-canary-9695';
    vi.stubEnv('GRADER_PATH_SECRET', secret);

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              assert: [
                {
                  type: 'llm-rubric',
                  value: 'pass',
                  provider: `file://{{ env.GRADER_PATH_SECRET }}/missing-grader.cjs`,
                },
              ],
            },
          ],
        },
      ],
      writeLatestResults: false,
    });
    const summary = await record.toEvaluateSummary();
    const serialized = JSON.stringify(summary.results);

    expect(summary.stats.errors).toBe(1);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('[REDACTED]');
  });

  it('rejects empty programmatic scenario files instead of returning zero results', async () => {
    const tmpDir = makeTmpDir();
    const scenarioPath = path.join(tmpDir, 'empty-scenarios.json');
    fs.writeFileSync(scenarioPath, '[]');
    const provider = createMockProvider('empty-scenario-file-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [`file://${scenarioPath}`],
      }),
    ).rejects.toThrow(/contributed no scenarios/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('loads scenario tests relative to programmatic scenario files', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: 'file://tests.json',
        },
      ]),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tests.json'),
      JSON.stringify([{ vars: { channel: 'email' } }]),
    );

    const provider = createMockProvider('scenario-tests-provider');

    await evaluate({
      prompts: ['Topic: {{topic}} Channel: {{channel}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing Channel: email']);
  });

  it('preserves inline scenario tests that only filter prompts', async () => {
    const provider = createMockProvider('scenario-inline-prompt-filter-provider');

    await evaluate({
      prompts: [
        { raw: 'First prompt', label: 'first' },
        { raw: 'Second prompt', label: 'second' },
      ],
      providers: [provider],
      scenarios: [
        {
          config: [{}],
          tests: [{ prompts: ['first'] }],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['First prompt']);
  });

  it('fails when a scenario test file contributes no tests', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: 'file://missing-tests.json',
        },
      ]),
    );
    const provider = createMockProvider('scenario-missing-tests-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
      }),
    ).rejects.toThrow(/Failed to load scenario test file/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('parses scenario tests files through the standard test reader', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: 'file://tests.csv',
        },
      ]),
    );
    fs.writeFileSync(path.join(tmpDir, 'tests.csv'), 'channel\nemail\n');

    const provider = createMockProvider('scenario-csv-tests-provider');

    await evaluate({
      prompts: ['Topic: {{topic}} Channel: {{channel}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing Channel: email']);
  });

  it('executes scenario test generators and persists their materialized cases', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: [{ path: 'file://generate.cjs', config: { prefix: 'generated' } }],
        },
      ]),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'generate.cjs'),
      'module.exports = ({ prefix }) => [{ vars: { channel: `${prefix}-one` } }, { vars: { channel: `${prefix}-two` } }];\n',
    );
    const provider = createMockProvider('scenario-generator-provider');

    const record = await evaluate({
      prompts: ['Topic: {{topic}} Channel: {{channel}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
      writeLatestResults: false,
    });

    expect(calledPrompts(provider)).toEqual([
      'Topic: billing Channel: generated-one',
      'Topic: billing Channel: generated-two',
    ]);
    expect(
      typeof record.config.scenarios?.[0] === 'object'
        ? record.config.scenarios[0].tests
        : undefined,
    ).toEqual([
      expect.objectContaining({ vars: { channel: 'generated-one' } }),
      expect.objectContaining({ vars: { channel: 'generated-two' } }),
    ]);
  });

  it('preserves env templates in persisted matrix rows and re-renders rotated values', async () => {
    const tmpDir = makeTmpDir();
    const providerPath = path.join(tmpDir, 'provider.cjs');
    const matrixPath = path.join(tmpDir, 'matrix.yaml');
    fs.writeFileSync(
      providerPath,
      `module.exports = class ScenarioSecretProvider {
  constructor(options = {}) { this.options = options; }
  id() { return 'scenario-secret-provider'; }
  async callApi() { return { output: this.options.config.secretValue }; }
};
`,
    );
    fs.writeFileSync(
      matrixPath,
      `- provider:
    id: file://provider.cjs
    config:
      secretValue: "{{ env.PR9695_SCENARIO_SECRET }}"
`,
    );
    vi.stubEnv('PR9695_SCENARIO_SECRET', 'initial-secret-sentinel');

    const firstRecord = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [{ config: [{ $values: `file://${matrixPath}` }], tests: [{}] }],
      writeLatestResults: false,
    });
    const firstSummary = await firstRecord.toEvaluateSummary();
    const persistedConfig = JSON.parse(JSON.stringify(firstRecord.config));

    expect(firstSummary.results[0].response?.output).toBe('initial-secret-sentinel');
    expect(JSON.stringify(persistedConfig)).not.toContain('initial-secret-sentinel');
    expect(JSON.stringify(persistedConfig)).toContain('{{ env.PR9695_SCENARIO_SECRET }}');

    vi.stubEnv('PR9695_SCENARIO_SECRET', 'rotated-secret-sentinel');
    const replayRecord = await evaluate({
      ...persistedConfig,
      providers: [createMockProvider('suite-provider')],
      writeLatestResults: false,
    });
    const replaySummary = await replayRecord.toEvaluateSummary();

    expect(replaySummary.results[0].response?.output).toBe('rotated-secret-sentinel');
    expect(JSON.stringify(replayRecord.config)).not.toContain('rotated-secret-sentinel');
  });

  it('serializes live providers in scenario config rows without cyclic runtime state', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-live-provider',
      label: 'Scenario live provider',
      config: { cyclic },
      callApi: vi.fn().mockResolvedValue({
        output: 'live-provider-output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [{ config: [{ provider: scenarioProvider }], tests: [{}] }],
      writeLatestResults: false,
    });

    expect(scenarioProvider.callApi).toHaveBeenCalledTimes(1);
    expect(() => JSON.stringify(record.config)).not.toThrow();
    const scenario = record.config.scenarios?.[0];
    const row = typeof scenario === 'object' ? scenario.config[0] : undefined;
    expect(row && !('$values' in row) ? row.provider : undefined).toEqual(
      expect.objectContaining({
        id: 'scenario-live-provider',
        label: 'Scenario live provider',
        config: expect.any(Object),
      }),
    );
  });

  it('sanitizes live providers inside scenario grading type maps before persistence', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const gradingProvider: ApiProvider = {
      id: () => 'scenario-live-grader',
      config: { apiKey: 'TYPED_MAP_SECRET_SENTINEL', cyclic },
      callApi: vi.fn().mockResolvedValue({
        output: 'unused',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const gradingProviderMap: Record<string, unknown> = { text: gradingProvider };
    gradingProviderMap.embedding = gradingProviderMap;

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [
        {
          config: [{ options: { provider: gradingProviderMap as never } }],
          tests: [{ assert: [{ type: 'equals', value: 'mock answer' }] }],
        },
      ],
      writeLatestResults: true,
    });

    expect(gradingProvider.callApi).not.toHaveBeenCalled();
    expect(() => JSON.stringify(record.config)).not.toThrow();
    expect(JSON.stringify(record.config)).not.toContain('TYPED_MAP_SECRET_SENTINEL');
    const scenario = record.config.scenarios?.[0];
    const row = typeof scenario === 'object' ? scenario.config[0] : undefined;
    expect(row && !('$values' in row) ? row.options?.provider : undefined).toMatchObject({
      text: { id: 'scenario-live-grader' },
    });
  });

  it('preserves raw provider option fields in serialized scenario rows', async () => {
    const providerOptions: ProviderOptions = {
      id: 'echo',
      label: 'Scenario echo',
      config: { custom: 'keep', apiKey: 'SCENARIO_PROVIDER_SECRET_SENTINEL' },
      delay: 0,
      env: { PROMPTFOO_DISABLE_TELEMETRY: 'true' },
      inputs: { staticInput: 'keep' },
      prompts: ['Prompt'],
      transform: 'output',
    };

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [{ config: [{ provider: providerOptions }], tests: [{}] }],
      writeLatestResults: false,
    });

    const scenario = record.config.scenarios?.[0];
    const row = typeof scenario === 'object' ? scenario.config[0] : undefined;
    expect(JSON.stringify(record.config)).not.toContain('SCENARIO_PROVIDER_SECRET_SENTINEL');
    expect(row && !('$values' in row) ? row.provider : undefined).toEqual({
      ...providerOptions,
      config: { custom: 'keep', apiKey: REDACTED },
    });
  });

  it('redacts provider option maps in serialized scenario rows', async () => {
    const secret = 'SCENARIO_PROVIDER_MAP_SECRET_SENTINEL';

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [
        {
          config: [
            {
              provider: { echo: { config: { custom: 'keep', apiKey: secret } } } as never,
            },
          ],
          tests: [{}],
        },
      ],
      writeLatestResults: false,
    });

    const scenario = record.config.scenarios?.[0];
    const row = typeof scenario === 'object' ? scenario.config[0] : undefined;
    expect(JSON.stringify(record.config)).not.toContain(secret);
    expect(row && !('$values' in row) ? row.provider : undefined).toEqual({
      echo: { config: { custom: 'keep', apiKey: REDACTED } },
    });
  });

  it('redacts matrix provider options in serialized scenario rows', async () => {
    const tmpDir = makeTmpDir();
    const secret = 'MATRIX_PROVIDER_SECRET_SENTINEL';
    const matrixPath = path.join(tmpDir, 'matrix.yaml');
    fs.writeFileSync(
      matrixPath,
      `- provider:
    id: echo
    config:
      custom: keep
      apiKey: ${secret}
`,
    );

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [{ config: [{ $values: `file://${matrixPath}` }], tests: [{}] }],
      writeLatestResults: false,
    });

    const scenario = record.config.scenarios?.[0];
    const row = typeof scenario === 'object' ? scenario.config[0] : undefined;
    expect(JSON.stringify(record.config)).not.toContain(secret);
    expect(row && !('$values' in row) ? row.provider : undefined).toEqual({
      id: 'echo',
      config: { custom: 'keep', apiKey: REDACTED },
    });
  });

  it('persists file-backed scenario test provider refs instead of runtime provider ids', async () => {
    const tmpDir = makeTmpDir();
    const scenarioDir = path.join(tmpDir, 'scenarios');
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(
      path.join(scenarioDir, 'provider.cjs'),
      `module.exports = class ScenarioTestProvider {
        id() { return 'runtime-scenario-test-provider'; }
        async callApi() { return { output: 'scenario-test-output' }; }
      };`,
    );
    const testsPath = path.join(scenarioDir, 'tests.yaml');
    fs.writeFileSync(testsPath, '- provider: file://provider.cjs\n');
    const scenarioPath = path.join(scenarioDir, 'scenario.json');
    fs.writeFileSync(
      scenarioPath,
      JSON.stringify([{ config: [{}], tests: `file://${testsPath}` }]),
    );

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [`file://${scenarioPath}`],
      writeLatestResults: false,
    });

    const summary = await record.toEvaluateSummary();
    const scenario = record.config.scenarios?.[0];
    const persistedTests =
      typeof scenario === 'object' && Array.isArray(scenario.tests)
        ? (scenario.tests as TestCase[])
        : [];
    const persistedTest = persistedTests[0];

    expect(summary.results[0].response?.output).toBe('scenario-test-output');
    expect(persistedTest?.provider).toBe(`file://${path.join(scenarioDir, 'provider.cjs')}`);
  });

  it('preserves mixed env templates from file-backed tests for secret rotation', async () => {
    const tmpDir = makeTmpDir();
    const testsPath = path.join(tmpDir, 'tests.yaml');
    fs.writeFileSync(
      testsPath,
      '- vars:\n    endpoint: "https://example.test/?token={{ env.TEST_SECRET | urlencode }}"\n',
    );
    vi.stubEnv('TEST_SECRET', 'initial/secret+abcdefghijklmnop');
    const firstProvider = createMockProvider('first-suite-provider');

    const firstRecord = await evaluate({
      prompts: ['{{endpoint}}'],
      providers: [firstProvider],
      scenarios: [{ config: [{}], tests: `file://${testsPath}` }],
      writeLatestResults: false,
    });
    const persistedConfig = JSON.parse(JSON.stringify(firstRecord.config));

    expect(calledPrompts(firstProvider)).toEqual([
      'https://example.test/?token=initial%2Fsecret%2Babcdefghijklmnop',
    ]);
    expect(JSON.stringify(persistedConfig)).not.toContain('initial%2Fsecret');
    expect(JSON.stringify(persistedConfig)).toContain('{{ env.TEST_SECRET | urlencode }}');

    vi.stubEnv('TEST_SECRET', 'rotated/secret+abcdefghijklmnop');
    const replayProvider = createMockProvider('replay-suite-provider');
    await evaluate({
      ...persistedConfig,
      providers: [replayProvider],
      writeLatestResults: false,
    });

    expect(calledPrompts(replayProvider)).toEqual([
      'https://example.test/?token=rotated%2Fsecret%2Babcdefghijklmnop',
    ]);
  });

  it('reuses and cleans up structurally identical file-backed scenario graders', async () => {
    const tmpDir = makeTmpDir();
    const stateKey = '__promptfooScenarioGraderLifecycle';
    const state = { calls: 0, cleaned: 0, constructed: 0 };
    (globalThis as Record<string, unknown>)[stateKey] = state;
    const graderPath = path.join(tmpDir, 'grader.cjs');
    fs.writeFileSync(
      graderPath,
      `const state = globalThis[${JSON.stringify(stateKey)}];
module.exports = class ScenarioGrader {
  constructor() { state.constructed += 1; }
  id() { return 'scenario-grader'; }
  async callApi() {
    state.calls += 1;
    return { output: JSON.stringify({ pass: true, score: 1, reason: 'passes' }) };
  }
  async cleanup() { state.cleaned += 1; }
};
`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tests.yaml'),
      `- assert:
    - type: llm-rubric
      value: first
      provider:
        id: file://grader.cjs
    - type: llm-rubric
      value: second
      provider:
        id: file://grader.cjs
`,
    );

    try {
      const record = await evaluate({
        prompts: ['Prompt'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [{ config: [{}], tests: `file://${path.join(tmpDir, 'tests.yaml')}` }],
        writeLatestResults: false,
      });
      const summary = await record.toEvaluateSummary();

      expect(summary.stats.successes).toBe(1);
      expect(state).toEqual({ calls: 2, cleaned: 1, constructed: 1 });
    } finally {
      delete (globalThis as Record<string, unknown>)[stateKey];
    }
  });

  it('loads nested file refs in inline scenario config and test rows', async () => {
    const tmpDir = makeTmpDir();
    const scenarioDir = path.join(tmpDir, 'scenarios');
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(path.join(scenarioDir, 'expected.txt'), 'mock answer');
    const scenarioPath = path.join(scenarioDir, 'scenario.json');
    fs.writeFileSync(
      scenarioPath,
      JSON.stringify([
        {
          config: [{ assert: [{ type: 'contains', value: 'file://expected.txt' }] }],
          tests: [{ assert: [{ type: 'contains', value: 'file://expected.txt' }] }],
        },
      ]),
    );

    const record = await evaluate({
      prompts: ['Prompt'],
      providers: [createMockProvider('suite-provider')],
      scenarios: [`file://${scenarioPath}`],
      writeLatestResults: false,
    });

    const summary = await record.toEvaluateSummary();
    const scenario = record.config.scenarios?.[0];
    const row =
      typeof scenario === 'object' && Array.isArray(scenario.config)
        ? (scenario.config[0] as TestCase)
        : undefined;
    const test =
      typeof scenario === 'object' && Array.isArray(scenario.tests)
        ? (scenario.tests[0] as TestCase)
        : undefined;

    expect(summary.stats.failures).toBe(0);
    expect((row?.assert?.[0] as { value?: unknown } | undefined)?.value).toBe('mock answer');
    expect((test?.assert?.[0] as { value?: unknown } | undefined)?.value).toBe('mock answer');
  });

  it('fails before provider execution when a scenario generator returns no tests', async () => {
    const tmpDir = makeTmpDir();
    const generatorPath = path.join(tmpDir, 'empty.cjs');
    fs.writeFileSync(generatorPath, 'module.exports = () => [];\n');
    const provider = createMockProvider('empty-scenario-generator-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [
          {
            config: [{ vars: { topic: 'billing' } }],
            tests: [{ path: `file://${generatorPath}` }],
          },
        ],
      }),
    ).rejects.toThrow(/contributed no tests/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('does not start later scenario generators after an earlier source fails', async () => {
    const tmpDir = makeTmpDir();
    const markerPath = path.join(tmpDir, 'later-generator-ran');
    fs.writeFileSync(
      path.join(tmpDir, 'fail.cjs'),
      `module.exports = () => { throw new Error('first generator failed'); };\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'later.cjs'),
      `module.exports = () => {
  require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran');
  return [{ vars: { source: 'later' } }];
};
`,
    );

    await expect(
      evaluate({
        prompts: ['Prompt'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [
          { config: [{}], tests: { path: `file://${path.join(tmpDir, 'fail.cjs')}` } },
          { config: [{}], tests: { path: `file://${path.join(tmpDir, 'later.cjs')}` } },
        ],
        writeLatestResults: false,
      }),
    ).rejects.toThrow(/first generator failed/);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('attributes scenario materialization failures to the declaring scenario file', async () => {
    const tmpDir = makeTmpDir();
    const scenarioPath = path.join(tmpDir, 'scenario.yaml');
    fs.writeFileSync(
      scenarioPath,
      '- config:\n    - $values: file://missing-matrix.yaml\n  tests:\n    - {}\n',
    );

    await expect(
      evaluate({
        prompts: ['Prompt'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [`file://${scenarioPath}`],
        writeLatestResults: false,
      }),
    ).rejects.toThrow(
      new RegExp(`Failed to load scenario ${scenarioPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
  });

  it('resolves scenario config refs relative to each programmatic scenario glob match', async () => {
    const tmpDir = makeTmpDir();
    for (const group of ['unit', 'integration']) {
      const groupDir = path.join(tmpDir, 'scenarios', group);
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(
        path.join(groupDir, 'scenario.json'),
        JSON.stringify([{ config: [{ $values: 'file://matrix.json' }], tests: [{}] }]),
      );
      fs.writeFileSync(
        path.join(groupDir, 'matrix.json'),
        JSON.stringify([{ vars: { topic: group } }]),
      );
    }

    const provider = createMockProvider('scenario-glob-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenarios', '**', 'scenario.json')}`],
    });

    const prompts = calledPrompts(provider);
    expect(prompts).toContain('Topic: unit');
    expect(prompts).toContain('Topic: integration');
  });

  it.runIf(process.platform !== 'win32')(
    'loads matrix vars globs below scenario directories with glob metacharacters',
    async () => {
      const tmpDir = makeTmpDir();
      const scenarioDir = path.join(tmpDir, 'configs [prod]');
      fs.mkdirSync(path.join(scenarioDir, 'inputs'), { recursive: true });
      fs.writeFileSync(
        path.join(scenarioDir, 'scenario.yaml'),
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );
      fs.writeFileSync(
        path.join(scenarioDir, 'matrix.yaml'),
        '- vars:\n    doc: file://inputs/*.txt\n',
      );
      fs.writeFileSync(path.join(scenarioDir, 'inputs/a.txt'), 'a');
      fs.writeFileSync(path.join(scenarioDir, 'inputs/b.txt'), 'b');
      const provider = createMockProvider('matrix-vars-glob-provider');

      const record = await evaluate({
        prompts: ['Doc: {{doc}}'],
        providers: [provider],
        scenarios: [`file://${path.join(scenarioDir, 'scenario.yaml')}`],
        writeLatestResults: false,
      });

      const summary = await record.toEvaluateSummary();
      expect(summary.results).toHaveLength(2);
      expect(calledPrompts(provider).sort()).toEqual(['Doc: a', 'Doc: b']);
    },
  );

  it('keeps unknown keys on plain scenario config rows without failing', async () => {
    const provider = createMockProvider('lenient-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [
        {
          config: [{ vars: { topic: 'billing' }, customAnnotation: 'kept' } as never],
          tests: [{}],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('reuses and cleans up evaluator-owned scenario provider instances', async () => {
    const tmpDir = makeTmpDir();
    const stateKey = '__promptfooScenarioProviderLifecycle';
    const state = { calls: 0, cleaned: 0, constructed: 0 };
    (globalThis as Record<string, unknown>)[stateKey] = state;
    const providerPath = path.join(tmpDir, 'provider.cjs');
    fs.writeFileSync(
      providerPath,
      `const state = globalThis[${JSON.stringify(stateKey)}];
module.exports = class ScenarioProvider {
  constructor() { state.constructed += 1; }
  id() { return 'scenario-file-provider'; }
  async callApi(prompt) {
    state.calls += 1;
    if (prompt === 'two') { throw new Error('scenario provider failure'); }
    return { output: prompt };
  }
  async cleanup() { state.cleaned += 1; }
};
`,
    );

    try {
      const record = await evaluate({
        prompts: ['{{case}}'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [
          {
            config: [{ vars: { case: 'one' } }, { vars: { case: 'two' } }],
            tests: [{ provider: `file://${providerPath}` }],
          },
        ],
        writeLatestResults: false,
      });
      const summary = await record.toEvaluateSummary();

      expect(summary.results).toHaveLength(2);
      expect(summary.stats.errors).toBe(1);
      expect(state).toEqual({ calls: 2, cleaned: 1, constructed: 1 });
    } finally {
      delete (globalThis as Record<string, unknown>)[stateKey];
    }
  });

  it('reuses identical scenario providers across separate config rows', async () => {
    const tmpDir = makeTmpDir();
    const stateKey = '__promptfooScenarioConfigProviderLifecycle';
    const state = { calls: 0, cleaned: 0, constructed: 0 };
    (globalThis as Record<string, unknown>)[stateKey] = state;
    const providerPath = path.join(tmpDir, 'provider.cjs');
    fs.writeFileSync(
      providerPath,
      `const state = globalThis[${JSON.stringify(stateKey)}];
module.exports = class ScenarioProvider {
  constructor() { state.constructed += 1; }
  id() { return 'scenario-config-provider'; }
  async callApi(prompt) { state.calls += 1; return { output: prompt }; }
  async cleanup() { state.cleaned += 1; }
};
`,
    );

    try {
      const record = await evaluate({
        prompts: ['{{case}}'],
        providers: [createMockProvider('suite-provider')],
        scenarios: [
          {
            config: [
              { provider: `file://${providerPath}`, vars: { case: 'one' } },
              { provider: `file://${providerPath}`, vars: { case: 'two' } },
            ],
            tests: [{}],
          },
        ],
        writeLatestResults: false,
      });
      const summary = await record.toEvaluateSummary();

      expect(summary.results).toHaveLength(2);
      expect(state).toEqual({ calls: 2, cleaned: 1, constructed: 1 });
    } finally {
      delete (globalThis as Record<string, unknown>)[stateKey];
    }
  });

  it('resolves relative programmatic matrix refs from cwd instead of stale CLI state', async () => {
    const intendedDir = makeTmpDir();
    const staleDir = makeTmpDir();
    fs.writeFileSync(
      path.join(intendedDir, 'matrix.json'),
      JSON.stringify([{ vars: { topic: 'intended' } }]),
    );
    fs.writeFileSync(
      path.join(staleDir, 'matrix.json'),
      JSON.stringify([{ vars: { topic: 'stale' } }]),
    );
    const originalCwd = process.cwd();
    const originalBasePath = cliState.basePath;
    const provider = createMockProvider('scenario-cwd-provider');

    try {
      process.chdir(intendedDir);
      cliState.basePath = staleDir;
      await evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [{ config: [{ $values: 'file://matrix.json' }], tests: [{}] }],
      });
    } finally {
      process.chdir(originalCwd);
      cliState.basePath = originalBasePath;
    }

    expect(calledPrompts(provider)).toEqual(['Topic: intended']);
  });

  it('uses request-local env for programmatic matrix refs', async () => {
    const tmpDir = makeTmpDir();
    const intendedPath = path.join(tmpDir, 'intended.json');
    const decoyPath = path.join(tmpDir, 'decoy.json');
    fs.writeFileSync(intendedPath, JSON.stringify([{ vars: { topic: 'intended' } }]));
    fs.writeFileSync(decoyPath, JSON.stringify([{ vars: { topic: 'decoy' } }]));
    vi.stubEnv('SCENARIO_MATRIX_PATH', decoyPath);
    const provider = createMockProvider('scenario-env-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      env: { SCENARIO_MATRIX_PATH: intendedPath },
      scenarios: [
        {
          config: [{ $values: 'file://{{ env.SCENARIO_MATRIX_PATH }}' }],
          tests: [{}],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: intended']);
  });

  it('fails clearly when a matrix file is empty', async () => {
    const tmpDir = makeTmpDir();
    const matrixPath = path.join(tmpDir, 'empty.yaml');
    fs.writeFileSync(matrixPath, '# nothing here\n');

    const provider = createMockProvider('empty-matrix-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [
          {
            config: [{ $values: `file://${matrixPath}` }],
            tests: [{}],
          },
        ],
      }),
    ).rejects.toThrow(/is empty/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('fails clearly when a matrix row is still a $values ref', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'outer.yaml'), '- $values: file://inner.yaml\n');

    const provider = createMockProvider('nested-matrix-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [
          {
            config: [{ $values: `file://${path.join(tmpDir, 'outer.yaml')}` }],
            tests: [{}],
          },
        ],
      }),
    ).rejects.toThrow(/Nested \$values references are not supported/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });
});
