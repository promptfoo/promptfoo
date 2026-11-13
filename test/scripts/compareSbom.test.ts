import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { compareInventory, validateInventory, writeComparison } from '../../scripts/compareSbom';

const directories: string[] = [];
const sourceSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const environment = {
  platform: 'linux',
  arch: 'x64',
  node: 'v24.21.0',
  npm: '11.11.0',
  registry: 'https://registry.npmjs.org/',
  installStrategy: 'hoisted',
  lifecycleScripts: false,
};
function inventory(surface: string, name = 'original') {
  return {
    schemaVersion: 1,
    surface,
    components: [{ name, version: '1.0.0' }],
    ...(surface === 'app' ? { buildConfiguration: { posthogKeyPresent: true } } : {}),
    ...(surface === 'runtime-default'
      ? { environment }
      : { assets: [{ path: 'assets/main.js', size: 10, sha256: 'a'.repeat(64) }] }),
  };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-sbom-'));
  directories.push(root);
  for (const directory of ['current', 'baseline']) {
    fs.mkdirSync(path.join(root, directory));
    for (const surface of ['runtime-default', 'app', 'site']) {
      const name =
        surface === 'runtime-default' ? 'runtime-default.json' : `${surface}-browser.json`;
      fs.writeFileSync(
        path.join(root, directory, name),
        JSON.stringify({
          ...inventory(surface, directory),
          ...(surface === 'runtime-default'
            ? { sourceSha: directory === 'current' ? sourceSha : baseSha }
            : {}),
        }),
      );
    }
    fs.writeFileSync(path.join(root, directory, 'runtime-default.cdx.json'), '{}');
    fs.writeFileSync(
      path.join(root, directory, 'provenance.json'),
      JSON.stringify({ sourceSha: baseSha }),
    );
  }
  return {
    current: path.join(root, 'current'),
    baseline: path.join(root, 'baseline'),
    output: path.join(root, 'output'),
    sourceSha,
    baseSha,
    baselineStatus: 'available',
  };
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('inventory comparison', () => {
  it('reports added and removed identities even when the count is unchanged', () => {
    expect(compareInventory(inventory('app'), inventory('app', 'replacement'))).toMatchObject({
      delta: 0,
      added: ['replacement@1.0.0'],
      removed: ['original@1.0.0'],
      addedNames: ['replacement'],
      removedNames: ['original'],
      assets: { codeBytesBefore: 10, codeBytesAfter: 10 },
    });
  });

  it('separates version changes from new package names', () => {
    const after = inventory('app');
    after.components[0].version = '2.0.0';
    expect(compareInventory(inventory('app'), after)).toMatchObject({
      added: ['original@2.0.0'],
      removed: ['original@1.0.0'],
      addedNames: [],
      removedNames: [],
    });
  });

  it('compares external scripts separately from package identities', () => {
    expect(
      compareInventory(inventory('site'), {
        ...inventory('site'),
        externalResources: [{ url: 'https://example.com/script.js', source: 'config.ts' }],
      }),
    ).toMatchObject({
      delta: 0,
      externalResources: { added: ['https://example.com/script.js (config.ts)'], removed: [] },
    });
  });

  it('rejects comparisons across incompatible install environments', () => {
    expect(() =>
      compareInventory(inventory('runtime-default'), {
        ...inventory('runtime-default'),
        environment: { ...environment, platform: 'win32' },
      }),
    ).toThrow('Incompatible platform');
    expect(() =>
      compareInventory(inventory('runtime-default'), {
        ...inventory('runtime-default'),
        environment: { ...environment, node: 'v26.0.0' },
      }),
    ).toThrow('Incompatible node');
  });

  it('requires nonempty correctly labeled inventories and valid asset evidence', () => {
    expect(() => validateInventory(inventory('site'), 'app')).toThrow('surface mismatch');
    expect(() => validateInventory({ ...inventory('app'), components: [] }, 'app')).toThrow();
    expect(() =>
      validateInventory({ ...inventory('app'), buildConfiguration: undefined }, 'app'),
    ).toThrow('Missing app analytics build configuration');
    expect(() =>
      validateInventory(
        { ...inventory('app'), assets: [{ path: 'a.js', size: -1, sha256: 'invalid' }] },
        'app',
      ),
    ).toThrow();
  });

  it.each(['/absolute.js', 'C:/absolute.js', 'assets\\main.js', '../outside.js', 'a/../main.js'])(
    'rejects non-portable browser asset path %s',
    (assetPath) => {
      const report = {
        ...inventory('site'),
        assets: [{ path: assetPath, size: 10, sha256: 'a'.repeat(64) }],
      };
      expect(() => validateInventory(report, 'site')).toThrow('Invalid browser asset path');
    },
  );

  it.each([
    null,
    {},
    [null],
    [{ url: 42, source: null }],
    [{ url: 'not-a-url', source: 'config.ts' }],
    [{ url: 'file:///script.js', source: 'config.ts' }],
    [{ url: 'https://example.com/script.js', source: '' }],
    [
      { url: 'https://example.com/script.js', source: 'config.ts' },
      { url: 'https://example.com/script.js', source: 'config.ts' },
    ],
  ])('rejects malformed external resource evidence %#', (externalResources) => {
    expect(() => validateInventory({ ...inventory('site'), externalResources }, 'site')).toThrow();
  });

  it('accepts distinct external resource sources and optional absent evidence', () => {
    const report = {
      ...inventory('site'),
      externalResources: [
        { url: 'https://example.com/script.js', source: 'config.ts' },
        { url: 'https://example.com/script.js', source: 'loader.ts' },
      ],
    };
    expect(validateInventory(report, 'site')).toBe(report);
    expect(validateInventory(inventory('app'), 'app').externalResources).toBeUndefined();
  });

  it('compares all three surfaces and preserves machine-readable evidence', () => {
    const options = fixture();
    const summary = writeComparison(options);
    expect(summary).toContain('| runtime-default | 1 | 0 |');
    expect(summary).toContain('| app | 1 | 0 |');
    expect(summary).toContain('| site | 1 | 0 |');
    expect(summary).toContain('current@1.0.0');
    const report = JSON.parse(
      fs.readFileSync(path.join(options.output, 'comparison.json'), 'utf8'),
    );
    expect(report.comparisons).toHaveLength(3);
    expect(
      JSON.parse(fs.readFileSync(path.join(options.output, 'provenance.json'), 'utf8')).sourceSha,
    ).toBe(sourceSha);
  });

  it('fails when the baseline is from another commit', () => {
    expect(() => writeComparison({ ...fixture(), baseSha: sourceSha })).toThrow(
      'exact base commit',
    );
  });

  it('records a changed runtime environment without suppressing browser comparisons', () => {
    const options = fixture();
    const runtime = path.join(options.current, 'runtime-default.json');
    const report = JSON.parse(fs.readFileSync(runtime, 'utf8'));
    report.environment.node = 'v26.0.0';
    fs.writeFileSync(runtime, JSON.stringify(report));
    const summary = writeComparison(options);
    expect(summary).toContain('| runtime-default | 1 | unavailable |');
    expect(summary).toContain('| app | 1 | 0 |');
    expect(summary).toContain('Incompatible node major version');
  });

  it('fails when the consumer was captured from another source commit', () => {
    expect(() => writeComparison({ ...fixture(), sourceSha: baseSha })).toThrow('tested commit');
  });

  it('keeps runtime and site comparisons when a fork app lacks the main analytics key', () => {
    const options = fixture();
    const app = path.join(options.current, 'app-browser.json');
    const report = JSON.parse(fs.readFileSync(app, 'utf8'));
    report.buildConfiguration.posthogKeyPresent = false;
    report.assets[0].size = 1;
    fs.writeFileSync(app, JSON.stringify(report));
    const summary = writeComparison(options);
    expect(summary).toContain('| app | 1 | unavailable |');
    expect(summary).toContain('| runtime-default | 1 | 0 |');
    expect(summary).toContain('| site | 1 | 0 |');
    expect(summary).toContain('Incompatible app analytics build configuration');
    const comparison = JSON.parse(
      fs.readFileSync(path.join(options.output, 'comparison.json'), 'utf8'),
    );
    expect(comparison.comparisons.map(({ surface }: { surface: string }) => surface)).toEqual([
      'runtime-default',
      'site',
    ]);
  });

  it('explicitly reports first-run or expired baselines without claiming a reduction', () => {
    const options = fixture();
    fs.rmSync(options.baseline, { recursive: true });
    const summary = writeComparison({ ...options, baselineStatus: 'expired-artifact' });
    expect(summary).toContain('not a verified reduction');
    expect(summary).toContain('| app | 1 | unavailable |');
    expect(summary).not.toContain('→');
  });

  it('fails when any current inventory is missing even without a baseline', () => {
    const options = fixture();
    fs.rmSync(path.join(options.current, 'site-browser.json'));
    expect(() => writeComparison({ ...options, baselineStatus: 'missing-artifact' })).toThrow();
  });
});
