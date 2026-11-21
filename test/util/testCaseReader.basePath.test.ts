import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { maybeLoadConfigFromExternalFile } from '../../src/util/file';
import {
  loadTestsFromGlob,
  readTestFiles,
  resolveTestsWatchPaths,
} from '../../src/util/testCaseReader';

import type { TestSuiteConfig } from '../../src/types/index';

describe('vars files under a bracketed base directory', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-vars-base-'));
    for (const [folder, filename, contents] of [
      ['suite[ab]', 'vars.yaml', 'chosen: own'],
      ['suite[ab]', 'extra.yaml', 'extra: own-extra'],
      ['suite{a,b}', 'vars.yaml', 'brace: own'],
      ['suitea', 'vars.yaml', 'wrongA: sibling'],
      ['suiteb', 'vars.yaml', 'wrongB: sibling'],
      ['common', 'vars.yaml', 'parent: expected'],
      ['plain', 'vars[12].yaml', 'literal: should-not-load'],
      ['plain', 'vars1.yaml', 'one: expected'],
      ['plain', 'vars2.yaml', 'two: expected'],
      ['plain', 'single.yaml', 'drive: expected'],
    ]) {
      fs.mkdirSync(path.join(directory, folder), { recursive: true });
      fs.writeFileSync(path.join(directory, folder, filename), contents);
    }
    for (const folder of ['suite[ab]', 'suite{a,b}', 'suitea', 'suiteb']) {
      const cases = JSON.stringify([{ vars: { source: folder } }]);
      fs.mkdirSync(path.join(directory, folder, 'tests'));
      fs.writeFileSync(path.join(directory, folder, 'tests', 'cases-1.yaml'), cases);
      fs.writeFileSync(path.join(directory, folder, 'tests', 'cases.yaml'), cases);
    }
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('loads a relative file from the exact base directory', async () => {
    await expect(readTestFiles('vars.yaml', path.join(directory, 'suite[ab]'))).resolves.toEqual({
      chosen: 'own',
    });
  });

  it('keeps base directory braces literal while expanding the file pattern', async () => {
    await expect(
      readTestFiles('vars.{yaml,json}', path.join(directory, 'suite{a,b}')),
    ).resolves.toEqual({
      brace: 'own',
    });
    expect(resolveTestsWatchPaths('vars.{yaml,json}', path.join(directory, 'suite{a,b}'))).toEqual([
      path.join(directory, 'suite{a,b}', 'vars.yaml'),
    ]);
  });

  it('expands authored globs inside the exact base directory', async () => {
    await expect(readTestFiles('*.yaml', path.join(directory, 'suite[ab]'))).resolves.toEqual({
      chosen: 'own',
      extra: 'own-extra',
    });
  });

  it('resolves a parent traversal from the literal base directory', async () => {
    await expect(
      readTestFiles('../common/*.yaml', path.join(directory, 'suite[ab]')),
    ).resolves.toEqual({
      parent: 'expected',
    });
  });

  it.each([false, true])(
    'preserves authored character classes (absolute: %s)',
    async (absolute) => {
      const basePath = path.join(directory, 'plain');
      const reference = absolute ? path.join(basePath, 'vars[12].yaml') : 'vars[12].yaml';

      await expect(readTestFiles(reference, basePath)).resolves.toEqual({
        one: 'expected',
        two: 'expected',
      });
    },
  );

  it('resolves drive-relative or ordinary relative paths against the base', async () => {
    const basePath = path.join(directory, 'plain');
    const drive = path.parse(basePath).root.replaceAll(path.sep, '');

    await expect(readTestFiles(`${drive}single.yaml`, basePath)).resolves.toEqual({
      drive: 'expected',
    });
  });

  it('preserves globstar traversal through directory links', async () => {
    const target = path.join(directory, 'target');
    const basePath = path.join(directory, 'links');
    fs.mkdirSync(target);
    fs.mkdirSync(basePath);
    fs.writeFileSync(path.join(target, 'vars.yaml'), 'linked: reached');
    fs.symlinkSync(
      target,
      path.join(basePath, 'source'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(readTestFiles('**/*.yaml', basePath)).resolves.toEqual({ linked: 'reached' });
  });

  it.each(['suite[ab]', 'suite{a,b}'])(
    'preserves an explicitly authored sibling vars glob from %s',
    async (folder) => {
      const basePath = path.join(directory, folder);
      const reference = '../' + folder + '/vars.yaml';
      await expect(readTestFiles(reference, basePath)).resolves.toEqual({
        wrongA: 'sibling',
        wrongB: 'sibling',
      });
      expect(
        resolveTestsWatchPaths(
          [{ vars: reference }] as unknown as TestSuiteConfig['tests'],
          basePath,
        ).sort(),
      ).toEqual(['suitea', 'suiteb'].map((name) => path.join(directory, name, 'vars.yaml')).sort());
    },
  );

  it.each(['suite[ab]', 'suite{a,b}'])(
    'preserves an explicitly authored sibling tests glob from %s',
    async (folder) => {
      const basePath = path.join(directory, folder);
      const reference = '../' + folder + '/tests/cases-*.yaml';
      const tests = await loadTestsFromGlob(reference, basePath);
      expect(tests.map((test) => test.vars?.source).sort()).toEqual(['suitea', 'suiteb']);
      expect(resolveTestsWatchPaths(reference, basePath).sort()).toEqual(
        ['suitea', 'suiteb']
          .map((name) => path.join(directory, name, 'tests', 'cases-1.yaml'))
          .sort(),
      );
    },
  );

  it('preserves an authored sibling glob after a drive-relative prefix', async () => {
    const basePath = path.join(directory, 'suite[ab]');
    const drive = path.parse(basePath).root.replaceAll(path.sep, '');
    await expect(readTestFiles(drive + '../suite[ab]/vars.yaml', basePath)).resolves.toEqual({
      wrongA: 'sibling',
      wrongB: 'sibling',
    });
  });

  it('keeps exact test file precedence for a path containing glob characters', async () => {
    const tests = await loadTestsFromGlob(
      '../suite[ab]/tests/cases.yaml',
      path.join(directory, 'suite[ab]'),
    );
    expect(tests.map((test) => test.vars?.source)).toEqual(['suite[ab]']);
  });

  it('keeps an unmatched authored glob distinct from a missing literal path', async () => {
    const basePath = path.join(directory, 'missing[ab]');
    fs.mkdirSync(basePath);
    await expect(loadTestsFromGlob('../missing[ab]/cases.yaml', basePath)).resolves.toEqual([]);
  });

  it.each(['suite[ab]', 'suite{a,b}'])(
    'watches the files loaded by an absolute vars glob containing %s',
    async (folder) => {
      const basePath = path.join(directory, folder);
      const reference = path.join(basePath, 'vars.yaml');
      await expect(readTestFiles(reference, basePath)).resolves.toEqual({
        wrongA: 'sibling',
        wrongB: 'sibling',
      });
      expect(
        resolveTestsWatchPaths(
          [{ vars: reference }] as unknown as TestSuiteConfig['tests'],
          basePath,
        ).sort(),
      ).toEqual(['suitea', 'suiteb'].map((name) => path.join(directory, name, 'vars.yaml')).sort());
    },
  );

  it('keeps absolute test globs rooted in the literal base directory', async () => {
    const basePath = path.join(directory, 'suite[ab]');
    const reference = path.join(basePath, 'tests', 'cases-*.yaml');
    const tests = await loadTestsFromGlob(reference, basePath);
    expect(tests.map((test) => test.vars?.source)).toEqual(['suite[ab]']);
  });

  it('keeps absolute watched globs rooted in the literal base directory', () => {
    const basePath = path.join(directory, 'suite[ab]');
    const reference = path.join(basePath, 'tests', 'cases-*.yaml');
    expect(resolveTestsWatchPaths(reference, basePath)).toEqual([
      path.join(basePath, 'tests', 'cases-1.yaml'),
    ]);
  });

  it.each(['string', 'path object'])(
    'watches the exact tests file before glob matches for a %s reference',
    (form) => {
      const basePath = path.join(directory, 'suite[ab]');
      const reference = '../suite[ab]/tests/cases.yaml';
      const tests = form === 'string' ? reference : { path: reference };
      expect(resolveTestsWatchPaths(tests as TestSuiteConfig['tests'], basePath)).toEqual([
        path.join(basePath, 'tests', 'cases.yaml'),
      ]);
    },
  );

  it.each(['vars.yaml', '*.yaml'])(
    'keeps generator config file resolution unchanged for %s',
    async (filename) => {
      const basePath = path.join(directory, 'suite[ab]');
      const reference = 'file://../suite[ab]/' + filename;
      const config = { data: reference };
      const loaded = await cliState.withBasePath(basePath, () =>
        maybeLoadConfigFromExternalFile(config),
      );
      if (filename === 'vars.yaml') {
        expect(loaded).toEqual({ data: { chosen: 'own' } });
      } else {
        expect(loaded).toEqual({
          data: expect.arrayContaining([{ chosen: 'own' }, { extra: 'own-extra' }]),
        });
      }
      const files = filename === 'vars.yaml' ? ['vars.yaml'] : ['extra.yaml', 'vars.yaml'];
      expect(
        resolveTestsWatchPaths(
          { path: 'gen.py', config } as TestSuiteConfig['tests'],
          basePath,
        ).sort(),
      ).toEqual(['gen.py', ...files].map((name) => path.join(basePath, name)).sort());
    },
  );
});
