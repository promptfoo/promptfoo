import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { runDbMigrations } from '../src/migrate';
import { evaluate } from '../src/node/evaluate';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider, ProviderOptions } from '../src/types';

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

  it('preserves raw provider option fields in serialized scenario rows', async () => {
    const providerOptions: ProviderOptions = {
      id: 'echo',
      label: 'Scenario echo',
      config: { custom: 'keep' },
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
    expect(row && !('$values' in row) ? row.provider : undefined).toEqual(providerOptions);
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
