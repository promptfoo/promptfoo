import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPackageVersion } from '../../src/util/packageVersion';

describe('getPackageVersion', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-package-version-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reads the resolved package behind restrictive exports and nested module metadata', () => {
    fs.mkdirSync(path.join(directory, 'dist', 'esm'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: '@fixture/sdk',
        version: '1.2.3',
        exports: { '.': { import: './dist/esm/index.js' } },
      }),
    );
    fs.writeFileSync(path.join(directory, 'dist', 'esm', 'package.json'), '{"type":"module"}');

    expect(getPackageVersion('@fixture/sdk', path.join(directory, 'dist', 'esm', 'index.js'))).toBe(
      '1.2.3',
    );
  });

  it('does not return another package version from an ancestor manifest', () => {
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'unrelated-project', version: '9.9.9' }),
    );
    expect(getPackageVersion('@fixture/missing', path.join(directory, 'index.js'))).toBeNull();
  });

  it.each([undefined, 123])('returns null for a missing or non-string version (%s)', (version) => {
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: '@fixture/sdk', version }),
    );
    expect(getPackageVersion('@fixture/sdk', path.join(directory, 'index.js'))).toBeNull();
  });

  it('does not hide malformed package metadata', () => {
    fs.writeFileSync(path.join(directory, 'package.json'), '{');
    expect(() => getPackageVersion('@fixture/sdk', path.join(directory, 'index.js'))).toThrow(
      SyntaxError,
    );
  });
});
