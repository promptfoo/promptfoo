import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { generateVarCombinations } from '../../../src/evaluator';
import { resolveConfigs } from '../../../src/util/config/load';
import { readTestConfigs } from '../../../src/util/testCaseReader';

import type { CommandLineOptions, Scenario, TestCase } from '../../../src/types/index';

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

  it('reads replayable rows without rewriting vars unless the suite uses another directory', async () => {
    const project = writeProject('project', {});
    const other = path.join(directory, 'other');
    const tests = [
      { vars: { doc: 'file://docs/a.txt', list: ['file://docs/a.txt', 'plain'], text: 'plain' } },
    ];

    const sameDirectory = await readTestConfigs(tests, project, {});
    const otherDirectory = await readTestConfigs(tests, project, {}, other);

    expect(sameDirectory[0].vars).toEqual(tests[0].vars);
    expect(otherDirectory[0].vars).toEqual({
      doc: `file://${path.join(project, 'docs', 'a.txt')}`,
      list: [`file://${path.join(project, 'docs', 'a.txt')}`, 'plain'],
      text: 'plain',
    });
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
