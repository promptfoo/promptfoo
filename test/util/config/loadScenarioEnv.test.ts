import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { combineConfigs } from '../../../src/util/config/load';
import { expandScenarioConfigValues } from '../../../src/util/config/scenarioMatrix';

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
        env: { MATRIX: matrixName },
        scenarios: ['file://scenario.json'],
      });
      writeJson(path.join(sourceDir, 'scenario.json'), [
        {
          config: [{ $values: 'file://{{ env.MATRIX }}' }],
          tests: [{}],
        },
      ]);
      writeJson(path.join(sourceDir, matrixName), [{ vars: { source } }]);
    }
    // This decoy proves config B's last-wins env cannot select a matrix in A.
    writeJson(path.join(root, 'a', 'matrix-b.json'), [{ vars: { source: 'wrong-b' } }]);

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

    expect(expanded).toEqual([[{ vars: { source: 'a' } }], [{ vars: { source: 'b' } }]]);
  });
});
