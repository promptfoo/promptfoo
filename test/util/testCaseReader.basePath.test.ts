import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFiles, resolveTestsWatchPaths } from '../../src/util/testCaseReader';

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
});
