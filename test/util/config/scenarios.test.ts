import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { resolveConfigs } from '../../../src/util/config/load';

function scenario(name: string) {
  return {
    description: name,
    config: [{ vars: { name } }],
    tests: [{ vars: { question: name } }],
  };
}

describe('Scenario loading with glob patterns', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenarios-'));
    for (const [folder, names] of [
      ['scenarios', ['one', 'two']],
      ['group1', ['one', 'two']],
      ['group2', ['three']],
    ] as const) {
      fs.mkdirSync(path.join(directory, folder));
      for (const name of names) {
        fs.writeFileSync(
          path.join(directory, folder, `${name}.yaml`),
          JSON.stringify(scenario(name)),
        );
      }
    }
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ['one glob', ['file://scenarios/*.yaml'], ['one', 'two']],
    ['multiple globs', ['file://group1/*.yaml', 'file://group2/*.yaml'], ['one', 'two', 'three']],
    ['inline and glob', [scenario('inline'), 'file://scenarios/*.yaml'], ['inline', 'one', 'two']],
  ] as const)('loads and flattens %s', async (_name, scenarios, expectedNames) => {
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ prompts: ['hello'], providers: ['echo'], scenarios }),
    );
    const { testSuite } = await cliState.withConfig(undefined, () =>
      cliState.withBasePath(undefined, () => resolveConfigs({ config: [configPath] }, {})),
    );
    expect(testSuite.scenarios).toHaveLength(expectedNames.length);
    expect(testSuite.scenarios).toEqual(expect.arrayContaining(expectedNames.map(scenario)));
    if (expectedNames[0] === 'inline') {
      expect(testSuite.scenarios?.[0]).toEqual(scenario('inline'));
    }
  });

  it.each(['config directory', 'explicit basePath'])(
    'loads scenario globs under a bracketed %s',
    async (mode) => {
      const root = path.join(directory, 'proj[ab]');
      fs.mkdirSync(root);
      fs.cpSync(path.join(directory, 'scenarios'), path.join(root, 'scenarios'), {
        recursive: true,
      });
      fs.writeFileSync(path.join(root, 'default.yaml'), 'vars: { common: default }');
      const configPath = path.join(mode === 'config directory' ? root : directory, 'config.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          prompts: ['hello'],
          providers: ['echo'],
          ...(mode === 'explicit basePath' && { basePath: root }),
          scenarios: ['file://scenarios/*.yaml'],
          defaultTest: 'file://default.yaml',
        }),
      );
      const configGlob =
        mode === 'config directory' ? path.join(directory, '*', 'config.json') : configPath;
      const { testSuite } = await cliState.withConfig(undefined, () =>
        cliState.withBasePath(undefined, () => resolveConfigs({ config: [configGlob] }, {})),
      );
      expect(testSuite.scenarios).toHaveLength(2);
      expect(testSuite.defaultTest).toMatchObject({ vars: { common: 'default' } });
    },
  );
});
