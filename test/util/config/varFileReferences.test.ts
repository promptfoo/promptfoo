import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { generateVarCombinations } from '../../../src/evaluator';
import { resolveConfigs } from '../../../src/util/config/load';
import { readTestConfigs } from '../../../src/util/testCaseReader';
import { mockProcessEnv } from '../utils';

import type { ApiProvider, CommandLineOptions, Scenario, TestCase } from '../../../src/types/index';

describe('file:// var references in loaded configs', () => {
  const originalCwd = process.cwd();
  let directory: string;

  function resolve(cmdObj: Partial<CommandLineOptions>) {
    return cliState.withConfig(undefined, () =>
      cliState.withBasePath(undefined, () => resolveConfigs(cmdObj, {})),
    );
  }

  function writeProject(name: string, config: Record<string, unknown>) {
    const project = path.join(directory, name);
    fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(project, 'docs', 'a.txt'), `doc from ${name}\n`);
    fs.writeFileSync(
      path.join(project, 'promptfooconfig.json'),
      JSON.stringify({ prompts: ['{{doc}}'], providers: ['echo'], ...config }),
    );
    return project;
  }

  beforeEach(() => {
    // Module resolution canonicalizes paths (for example /var to /private/var on macOS).
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-var-refs-')));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('keeps authored references in tests, default tests and scenarios of a single config', async () => {
    const project = writeProject('project', {
      defaultTest: { vars: { shared: 'file://docs/a.txt' } },
      tests: [{ vars: { doc: 'file://docs/a.txt', nested: { source: 'file://docs/a.txt' } } }],
      scenarios: [
        {
          config: [{ vars: { doc: 'file://docs/a.txt' } }],
          tests: [{ vars: { extra: 'file://docs/a.txt' } }],
        },
      ],
    });

    const { config, testSuite, basePath } = await resolve({
      config: [path.join(project, 'promptfooconfig.json')],
    });

    expect(basePath).toBe(project);
    for (const tests of [config.tests as TestCase[], testSuite.tests as TestCase[]]) {
      expect(tests[0].vars).toEqual({
        doc: 'file://docs/a.txt',
        nested: { source: 'file://docs/a.txt' },
      });
    }
    expect((config.defaultTest as TestCase).vars).toEqual({ shared: 'file://docs/a.txt' });
    const [scenario] = testSuite.scenarios as Scenario[];
    expect(scenario.config[0].vars).toEqual({ doc: 'file://docs/a.txt' });
    expect((scenario.tests as TestCase[])[0].vars).toEqual({ extra: 'file://docs/a.txt' });
    expect(JSON.stringify(config.tests)).not.toContain(directory);
  });

  it('pins references only for rows that come from another config directory', async () => {
    const first = writeProject('first', { tests: [{ vars: { doc: 'file://docs/a.txt' } }] });
    const second = writeProject('second', {
      tests: [{ vars: { doc: 'file://docs/a.txt' } }],
      scenarios: [{ config: [{}], tests: [{ vars: { doc: 'file://docs/a.txt' } }] }],
    });

    const { testSuite, basePath } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(second, 'promptfooconfig.json')],
    });

    // The evaluation resolves vars from the first config's directory, so its rows stay as
    // authored while the second config's rows must name their own directory.
    expect(basePath).toBe(first);
    expect((testSuite.tests as TestCase[]).map((test) => test.vars?.doc)).toEqual([
      'file://docs/a.txt',
      `file://${path.join(second, 'docs', 'a.txt')}`,
    ]);
    const [scenario] = testSuite.scenarios as Scenario[];
    expect((scenario.tests as TestCase[])[0].vars?.doc).toBe(
      `file://${path.join(second, 'docs', 'a.txt')}`,
    );
  });

  it("pins the file vars of another config's inline default test and merges it with the suite's", async () => {
    const first = writeProject('first', {
      defaultTest: { vars: { shared: 'file://docs/a.txt' } },
      tests: [{ vars: { q: 'one' } }],
    });
    const second = writeProject('second', {
      defaultTest: { vars: { doc: 'file://docs/a.txt', meta: { source: 'file://docs/a.txt' } } },
      tests: [],
    });

    const { testSuite, basePath } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(second, 'promptfooconfig.json')],
    });

    // The default test applies to every row, and the evaluation resolves its vars from the
    // first config's directory. The second config's reference must keep naming its own file.
    expect(basePath).toBe(first);
    const defaultTest = testSuite.defaultTest as TestCase;
    expect(defaultTest.vars).toEqual({
      shared: 'file://docs/a.txt',
      doc: `file://${path.join(second, 'docs', 'a.txt')}`,
      meta: { source: 'file://docs/a.txt' },
    });
    const [vars] = cliState.withBasePath(first, () =>
      generateVarCombinations(defaultTest.vars ?? {}),
    );
    expect(fs.readFileSync(String(vars.doc).slice('file://'.length), 'utf8')).toBe(
      'doc from second\n',
    );
  });

  it("pins the file vars in a scenario test file of another config's directory", async () => {
    const first = writeProject('first', {
      scenarios: [{ config: [{}], tests: 'file://scenario-tests.yaml' }],
    });
    const second = writeProject('second', {
      tests: [],
      scenarios: [{ config: [{}], tests: 'file://scenario-tests.yaml' }],
    });
    for (const project of [first, second]) {
      fs.writeFileSync(
        path.join(project, 'scenario-tests.yaml'),
        '- vars:\n    doc: file://docs/a.txt\n',
      );
    }

    const { testSuite, basePath } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(second, 'promptfooconfig.json')],
    });

    // Both files hold the same relative reference. The rows of the first config's file
    // resolve it from the suite directory, and the rows of the second config's file must
    // keep naming the file next to them.
    expect(basePath).toBe(first);
    const [fromFirst, fromSecond] = (testSuite.scenarios as Scenario[]).map(
      (scenario) => (scenario.tests as TestCase[])[0].vars?.doc,
    );
    expect(fromFirst).toBe('file://docs/a.txt');
    expect(fromSecond).toBe(`file://${path.join(second, 'docs', 'a.txt')}`);
  });

  it.each(['', 'nested'])(
    'preserves the provider origin of another config scenario file in %s',
    async (testDirectory) => {
      const first = writeProject('first', { tests: [] });
      const second = writeProject('second', {
        tests: [],
        scenarios: [
          {
            config: [{}],
            tests: `file://${testDirectory ? `${testDirectory}/` : ''}scenario-tests.yaml`,
          },
        ],
      });
      const sourceDirectory = path.join(second, testDirectory);
      fs.mkdirSync(sourceDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDirectory, 'scenario-tests.yaml'),
        '- provider: ./provider.cjs\n  vars:\n    doc: file://docs/a.txt\n',
      );
      for (const [providerDirectory, output] of [
        [first, 'first shadow'],
        [sourceDirectory, 'second origin'],
      ]) {
        fs.writeFileSync(
          path.join(providerDirectory, 'provider.cjs'),
          `module.exports = class { id() { return ${JSON.stringify(output)}; } async callApi() { return { output: ${JSON.stringify(output)} }; } };`,
        );
      }

      const { testSuite } = await resolve({
        config: [
          path.join(first, 'promptfooconfig.json'),
          path.join(second, 'promptfooconfig.json'),
        ],
      });

      const [scenario] = testSuite.scenarios as Scenario[];
      const [row] = scenario.tests as TestCase[];
      expect(row.metadata?.__promptfoo?.providerBasePath).toBe(sourceDirectory);
      await expect((row.provider as ApiProvider).callApi('hello')).resolves.toMatchObject({
        output: 'second origin',
      });
    },
  );

  it('pins only the file vars of rows from another config, leaving nested values as data', async () => {
    const first = writeProject('first', { tests: [] });
    const second = writeProject('second', {
      tests: [
        {
          vars: {
            doc: 'file://docs/a.txt',
            list: ['file://docs/a.txt', { source: 'file://docs/a.txt' }],
            meta: { source: 'file://docs/a.txt', files: ['file://docs/a.txt'] },
          },
        },
      ],
      scenarios: [
        {
          config: [
            {
              vars: {
                doc: 'file://docs/a.txt',
                list: ['file://docs/a.txt', { source: 'file://docs/a.txt' }],
                meta: { source: 'file://docs/a.txt' },
              },
            },
          ],
          tests: [{ vars: { doc: 'file://docs/a.txt', meta: { source: 'file://docs/a.txt' } } }],
        },
      ],
    });
    const pinned = `file://${path.join(second, 'docs', 'a.txt')}`;

    const { testSuite } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(second, 'promptfooconfig.json')],
    });

    // The evaluation loads top-level strings and array members as files. A string inside
    // an object is rendered into the prompt as written, so pinning it would change the data.
    expect((testSuite.tests as TestCase[])[0].vars).toEqual({
      doc: pinned,
      list: [pinned, { source: 'file://docs/a.txt' }],
      meta: { source: 'file://docs/a.txt', files: ['file://docs/a.txt'] },
    });
    const [scenario] = testSuite.scenarios as Scenario[];
    expect(scenario.config[0].vars).toEqual({
      doc: pinned,
      list: [pinned, { source: 'file://docs/a.txt' }],
      meta: { source: 'file://docs/a.txt' },
    });
    expect((scenario.tests as TestCase[])[0].vars).toEqual({
      doc: pinned,
      meta: { source: 'file://docs/a.txt' },
    });
  });

  it('renders an env template in a file var with the env of a later config and keeps it relative', async () => {
    const first = writeProject('first', {
      tests: [
        {
          vars: { doc: 'file://{{ env.DOC_PATH }}', meta: { source: 'file://{{ env.DOC_PATH }}' } },
        },
      ],
    });
    fs.writeFileSync(
      path.join(first, 'env.json'),
      JSON.stringify({ env: { DOC_PATH: 'docs/a.txt' }, tests: [] }),
    );

    const { testSuite } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(first, 'env.json')],
    });

    const [test] = testSuite.tests as TestCase[];
    expect(test.vars?.doc).toBe('file://docs/a.txt');
    expect(cliState.withBasePath(first, () => generateVarCombinations(test.vars ?? {}))).toEqual([
      expect.objectContaining({ doc: 'file://docs/a.txt' }),
    ]);
  });

  it('renders env templates in the default test and scenarios with the env of a later config', async () => {
    const first = writeProject('first', {
      defaultTest: { vars: { shared: 'file://{{ env.DOC_PATH }}' } },
      scenarios: [
        {
          config: [
            { vars: { doc: 'file://{{ env.DOC_PATH }}', list: ['file://{{ env.DOC_PATH }}'] } },
          ],
          tests: [{ vars: { extra: 'file://{{ env.DOC_PATH }}' } }],
        },
      ],
    });
    fs.writeFileSync(
      path.join(first, 'env.json'),
      JSON.stringify({ env: { DOC_PATH: 'docs/a.txt' }, tests: [] }),
    );

    const { testSuite } = await resolve({
      config: [path.join(first, 'promptfooconfig.json'), path.join(first, 'env.json')],
    });

    // The default test and scenario configs are not read as test rows, so each has its own
    // path through config loading.
    const [scenario] = testSuite.scenarios as Scenario[];
    const defaultTest = testSuite.defaultTest as TestCase;
    expect(defaultTest.vars).toEqual({ shared: 'file://docs/a.txt' });
    expect(scenario.config[0].vars).toEqual({
      doc: 'file://docs/a.txt',
      list: ['file://docs/a.txt'],
    });
    expect((scenario.tests as TestCase[])[0].vars).toEqual({ extra: 'file://docs/a.txt' });
    for (const vars of [defaultTest.vars, scenario.config[0].vars]) {
      expect(() =>
        cliState.withBasePath(first, () => generateVarCombinations(vars ?? {})),
      ).not.toThrow();
    }
  });

  it('renders an env template in --tests before locating it from the working directory', async () => {
    const project = writeProject('project', {});
    fs.writeFileSync(
      path.join(directory, 'cli-tests.yaml'),
      '- vars:\n    doc: file://docs/a.txt\n',
    );
    process.chdir(directory);
    const restoreEnv = mockProcessEnv({ PROMPTFOO_TEST_CLI_TESTS: 'cli-tests.yaml' });

    try {
      const { testSuite, basePath } = await resolve({
        config: [path.join('project', 'promptfooconfig.json')],
        tests: '{{ env.PROMPTFOO_TEST_CLI_TESTS }}',
      });

      expect(basePath).toBe(project);
      expect((testSuite.tests as TestCase[]).map((test) => test.vars)).toEqual([
        { doc: 'file://docs/a.txt' },
      ]);
    } finally {
      restoreEnv();
    }
  });

  it('locates --tests from the working directory and resolves its rows from the config directory', async () => {
    const project = writeProject('project', {});
    fs.writeFileSync(path.join(project, 'expected.txt'), 'expected from project');
    // Same relative paths exist next to the tests file; they must not be picked up.
    fs.mkdirSync(path.join(directory, 'docs'));
    fs.writeFileSync(path.join(directory, 'docs', 'a.txt'), 'doc from working directory\n');
    fs.writeFileSync(path.join(directory, 'expected.txt'), 'expected from working directory');
    fs.writeFileSync(
      path.join(directory, 'cli-tests.yaml'),
      '- vars:\n    doc: file://docs/a.txt\n  assert:\n    - type: equals\n      value: file://expected.txt\n',
    );
    process.chdir(directory);

    const { testSuite, basePath } = await resolve({
      config: [path.join('project', 'promptfooconfig.json')],
      tests: 'cli-tests.yaml',
    });

    const [test] = testSuite.tests as TestCase[];
    expect(basePath).toBe(project);
    expect(test.vars).toEqual({ doc: 'file://docs/a.txt' });
    expect(test.assert?.[0]).toMatchObject({ type: 'equals', value: 'expected from project' });
  });

  it.each(['project', '.'])(
    'expands a --tests glob from a bracketed working directory with config in %s',
    async (configDirectory) => {
      const project = writeProject(configDirectory, {});
      // The config is outside the working directory, either beside it or above it.
      // Its location must not cause the working directory's brackets to become a pattern.
      const work = path.join(directory, 'work [acme]');
      fs.mkdirSync(work);
      fs.writeFileSync(path.join(work, 'cases-1.yaml'), '- vars:\n    doc: first\n');
      fs.writeFileSync(path.join(work, 'cases-2.yaml'), '- vars:\n    doc: second\n');
      // What the pattern matches when the brackets are taken for a set of characters.
      for (const name of ['work a', 'work c']) {
        fs.mkdirSync(path.join(directory, name));
        fs.writeFileSync(path.join(directory, name, 'cases-9.yaml'), '- vars:\n    doc: other\n');
      }
      process.chdir(work);

      const { testSuite } = await resolve({
        config: [path.join(project, 'promptfooconfig.json')],
        tests: 'cases-*.yaml',
      });

      const docs = (testSuite.tests as TestCase[]).map((test) => test.vars?.doc);
      expect(docs.sort()).toEqual(['first', 'second']);
    },
  );

  it.each(['yaml', 'json', 'csv'])(
    'rejects a missing literal --tests %s file under a bracketed working directory',
    async (extension) => {
      const project = writeProject('project', {});
      const work = path.join(directory, 'work [acme]');
      fs.mkdirSync(work);
      process.chdir(work);

      await expect(
        resolve({
          config: [path.join(project, 'promptfooconfig.json')],
          tests: `missing.${extension}`,
        }),
      ).rejects.toThrow(/No test files found|ENOENT/);
    },
  );

  it.each(['project', '.'])(
    'preserves authored --tests directory globs with config in %s',
    async (configDirectory) => {
      const project = writeProject(configDirectory, {});
      const work = path.join(directory, 'work [acme]');
      for (const name of ['a', 'b', '[ab]']) {
        const source = path.join(work, 'sets', name);
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(
          path.join(source, 'cases-1.yaml'),
          `- vars:\n    doc: ${JSON.stringify(name)}\n`,
        );
      }
      process.chdir(work);

      const { testSuite } = await resolve({
        config: [path.join(project, 'promptfooconfig.json')],
        tests: 'sets/[ab]/cases-*.yaml',
      });

      expect((testSuite.tests as TestCase[]).map((row) => row.vars?.doc).sort()).toEqual([
        'a',
        'b',
      ]);
    },
  );

  it('reads replayable rows without rewriting vars unless the suite uses another directory', async () => {
    const project = writeProject('project', {});
    const other = path.join(directory, 'other');
    const tests = [
      { vars: { doc: 'file://docs/a.txt', list: ['file://docs/a.txt', 'plain'], text: 'plain' } },
    ];

    const sameDirectory = await readTestConfigs(tests, project, {});
    const otherDirectory = await readTestConfigs(tests, project, {}, other);

    expect(sameDirectory[0].vars).toBe(tests[0].vars);
    expect(otherDirectory[0].vars).toEqual({
      doc: `file://${path.join(project, 'docs', 'a.txt')}`,
      list: [`file://${path.join(project, 'docs', 'a.txt')}`, 'plain'],
      text: 'plain',
    });
  });

  it('expands a pinned glob beneath a directory whose name contains glob characters', async () => {
    const project = writeProject('client [acme] evals', {});
    fs.writeFileSync(path.join(project, 'docs', 'b.txt'), 'second doc\n');

    // A row pinned to its own config directory carries an absolute pattern.
    const combinations = cliState.withBasePath(directory, () =>
      generateVarCombinations({ doc: `file://${path.join(project, 'docs', '*.txt')}` }),
    );

    expect(combinations.map((combination) => combination.doc).sort()).toEqual([
      `file://${path.join(project, 'docs', 'a.txt')}`,
      `file://${path.join(project, 'docs', 'b.txt')}`,
    ]);
  });

  it('treats an existing var file as a literal path when its directory contains glob characters', async () => {
    const project = writeProject('client [acme] evals', {});

    const relative = cliState.withBasePath(project, () =>
      generateVarCombinations({ doc: 'file://docs/a.txt' }),
    );
    const absolute = cliState.withBasePath(directory, () =>
      generateVarCombinations({ doc: `file://${path.join(project, 'docs', 'a.txt')}` }),
    );

    expect(relative).toEqual([{ doc: 'file://docs/a.txt' }]);
    expect(absolute).toEqual([{ doc: `file://${path.join(project, 'docs', 'a.txt')}` }]);
  });

  it('still expands glob patterns in var references', async () => {
    const project = writeProject('project', {});
    fs.writeFileSync(path.join(project, 'docs', 'b.txt'), 'second doc\n');

    const combinations = cliState.withBasePath(project, () =>
      generateVarCombinations({ doc: 'file://docs/*.txt' }),
    );

    expect(combinations.map((combination) => combination.doc).sort()).toEqual([
      `file://${path.join('docs', 'a.txt')}`,
      `file://${path.join('docs', 'b.txt')}`,
    ]);
  });
});
