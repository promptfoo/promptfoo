import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { __resolveScenarioTargetProviderReferencesForTests } from '../../../src/evaluator';
import { type ApiProvider, type Scenario, type TestSuite } from '../../../src/types/index';
import { combineConfigs } from '../../../src/util/config/load';
import {
  expandScenarioConfigValues,
  getScenarioSourceContext,
  loadScenarioConfigs,
} from '../../../src/util/config/scenarioMatrix';
import { readScenarioTests } from '../../../src/util/testCaseReader';

describe('multi-config scenario env provenance', () => {
  const tmpDirs: string[] = [];

  const makeDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-env-'));
    tmpDirs.push(dir);
    return dir;
  };

  const writeJson = (filePath: string, value: unknown): void => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value));
  };

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses each source config env for refs inside external scenarios', async () => {
    const root = makeDir();
    const configPaths: string[] = [];
    for (const source of ['a', 'b']) {
      const sourceDir = path.join(root, source);
      const matrixName = `matrix-${source}.json`;
      const configPath = path.join(sourceDir, 'config.json');
      configPaths.push(configPath);
      writeJson(configPath, {
        prompts: ['{{source}}'],
        providers: ['echo'],
        env: {
          MATRIX: matrixName,
          PROVIDER: `provider-${source}.cjs`,
          PAYLOAD: `payload-${source}.txt`,
        },
        scenarios: ['file://scenario.json'],
      });
      writeJson(path.join(sourceDir, 'scenario.json'), [
        {
          config: [{ $values: 'file://{{ env.MATRIX }}' }],
          tests: [{}],
        },
      ]);
      writeJson(path.join(sourceDir, matrixName), [
        {
          vars: { source },
          provider: {
            id: 'file://{{ env.PROVIDER }}',
            config: { payload: 'file://{{ env.PAYLOAD }}' },
          },
        },
      ]);
    }
    // This decoy proves config B's last-wins env cannot select a matrix in A.
    writeJson(path.join(root, 'a', 'matrix-b.json'), [{ vars: { source: 'wrong-b' } }]);
    fs.writeFileSync(path.join(root, 'a', 'provider-b.cjs'), 'module.exports = {};\n');

    const combined = await combineConfigs(configPaths);
    const scenarios = combined.scenarios ?? [];
    const expanded = await Promise.all(
      scenarios.map(async (scenario) => {
        expect(typeof scenario).toBe('object');
        return expandScenarioConfigValues(
          typeof scenario === 'object' ? scenario.config : [],
          root,
          combined.env ?? {},
        );
      }),
    );

    expect(expanded).toEqual([
      [
        {
          vars: { source: 'a' },
          provider: {
            id: `file://${path.join(root, 'a', 'provider-a.cjs')}`,
            config: { payload: `file://${path.join(root, 'a', 'payload-a.txt')}` },
          },
        },
      ],
      [
        {
          vars: { source: 'b' },
          provider: {
            id: `file://${path.join(root, 'b', 'provider-b.cjs')}`,
            config: { payload: `file://${path.join(root, 'b', 'payload-b.txt')}` },
          },
        },
      ],
    ]);
  });

  it('uses the source config env for providers in external scenario test files', async () => {
    const root = makeDir();
    const sourceDir = path.join(root, 'a');
    const competingDir = path.join(root, 'b');
    const sourceConfigPath = path.join(sourceDir, 'config.json');
    const competingConfigPath = path.join(competingDir, 'config.json');
    writeJson(sourceConfigPath, {
      prompts: ['test'],
      providers: ['echo'],
      env: { PROVIDER: 'provider-a.cjs' },
      scenarios: ['file://scenario.json'],
    });
    writeJson(path.join(sourceDir, 'scenario.json'), [
      { config: [{ vars: { source: 'a' } }], tests: 'file://tests.json' },
    ]);
    writeJson(path.join(sourceDir, 'tests.json'), [{ provider: 'file://{{ env.PROVIDER }}' }]);
    fs.writeFileSync(
      path.join(sourceDir, 'provider-a.cjs'),
      'module.exports = class { id() { return "A"; } async callApi() { return { output: "A" }; } };\n',
    );
    writeJson(competingConfigPath, {
      prompts: ['test'],
      providers: ['echo'],
      env: { PROVIDER: '../b/provider-b.cjs' },
    });
    fs.writeFileSync(
      path.join(competingDir, 'provider-b.cjs'),
      'module.exports = class { id() { return "B"; } async callApi() { return { output: "B" }; } };\n',
    );

    const combined = await combineConfigs([sourceConfigPath, competingConfigPath]);
    const scenario = combined.scenarios?.[0];
    expect(scenario).toBeTypeOf('object');
    const sourceContext = getScenarioSourceContext(scenario as object);
    const tests = await readScenarioTests(
      typeof scenario === 'object' ? scenario.tests : undefined,
      sourceContext?.basePath,
      sourceContext?.envOverrides,
    );
    const provider = tests?.[0]?.provider;

    expect(sourceContext?.envOverrides?.PROVIDER).toBe('provider-a.cjs');
    expect(provider).toBe(`file://${path.join(sourceDir, 'provider-a.cjs')}`);
  });

  it('uses the source config env when instantiating scenario providers', async () => {
    const root = makeDir();
    const sourceDir = path.join(root, 'a');
    const sourceScenarioPath = path.join(sourceDir, 'scenario.json');
    writeJson(sourceScenarioPath, [{ config: [{ provider: 'echo' }], tests: [{}] }]);

    const scenarios = (await loadScenarioConfigs([`file://${sourceScenarioPath}`], root, {
      OPENAI_API_KEY: 'from-source',
    })) as Scenario[];
    const suiteProvider: ApiProvider = {
      id: () => 'suite',
      callApi: async () => ({ output: 'suite' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProvider],
      prompts: [{ raw: '{{ value }}', label: 'prompt' }],
      scenarios,
      env: { OPENAI_API_KEY: 'from-combined-suite' },
    };

    const resolvedSuite = await __resolveScenarioTargetProviderReferencesForTests(testSuite);
    const provider = resolvedSuite.scenarios?.[0].config[0].provider as
      | { options?: { env?: Record<string, string> } }
      | undefined;

    expect(provider?.options?.env?.OPENAI_API_KEY).toBe('from-source');
  });
});
