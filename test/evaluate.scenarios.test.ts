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

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [{ config: [{ vars: { topic: 'billing' } }] } as never],
    });

    expect(provider.callApi).toHaveBeenCalledTimes(1);
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
