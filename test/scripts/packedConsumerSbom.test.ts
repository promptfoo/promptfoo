import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSbomCoverage,
  installedComponents,
  verifyPackedBrowserInventory,
  writePackedConsumerSbom,
} from '../../scripts/packedConsumerSbom';

const directories: string[] = [];
function fixture(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-sbom-'));
  directories.push(directory);
  return directory;
}
function writePackage(directory: string, manifest: object): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('packed consumer SBOM', () => {
  it('generates a real SBOM from a freshly installed local tarball', () => {
    const directory = fixture();
    const source = path.join(directory, 'source');
    const consumer = path.join(directory, 'consumer');
    writePackage(source, { name: 'promptfoo', version: '1.0.0' });
    writeBrowser(path.join(source, 'dist/src/app'));
    writePackage(consumer, { name: 'consumer', version: '0.0.0', private: true });
    const npmExecPath = execSync('npm exec --offline --call "node -p process.env.npm_execpath"', {
      // Avoid loading the repository's large workspace tree just to locate npm.
      cwd: source,
      encoding: 'utf8',
    }).trim();
    vi.stubEnv('npm_execpath', npmExecPath);
    const runNpm = (args: string[], cwd: string) =>
      execFileSync(process.execPath, [npmExecPath, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json'], source));
    const archive = path.join(source, packed[0].filename);
    runNpm(
      ['install', '--package-lock', '--ignore-scripts', '--no-audit', '--no-fund', archive],
      consumer,
    );
    // Capture everything physically present, even when npm classifies a package
    // as development-only. Install-time omission already defines this surface.
    const consumerManifest = JSON.parse(
      fs.readFileSync(path.join(consumer, 'package.json'), 'utf8'),
    );
    writePackage(consumer, {
      ...consumerManifest,
      devDependencies: { 'retained-fixture': '1.0.0' },
    });
    writePackage(path.join(consumer, 'node_modules/retained-fixture'), {
      name: 'retained-fixture',
      version: '1.0.0',
    });
    const output = path.join(directory, 'reports');
    writePackedConsumerSbom(consumer, archive, output, 'default', {
      npm_config_registry: 'https://registry.npmjs.org/',
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(output, 'runtime-default.json'), 'utf8')).components,
    ).toEqual([
      { name: 'promptfoo', version: '1.0.0' },
      { name: 'retained-fixture', version: '1.0.0' },
    ]);
  });

  it('matches a real npm SBOM against nested installed versions and scoped packages', () => {
    const directory = fixture();
    writePackage(directory, {
      name: 'consumer',
      version: '1.0.0',
      dependencies: { promptfoo: '1.0.0', '@fixture/dep': '2.0.0', alias: 'npm:actual@3.0.0' },
    });
    writePackage(path.join(directory, 'node_modules/promptfoo'), {
      name: 'promptfoo',
      version: '1.0.0',
      dependencies: { '@fixture/dep': '1.0.0' },
    });
    writePackage(path.join(directory, 'node_modules/@fixture/dep'), {
      name: '@fixture/dep',
      version: '2.0.0',
    });
    writePackage(path.join(directory, 'node_modules/alias'), { name: 'actual', version: '3.0.0' });
    writePackage(path.join(directory, 'node_modules/promptfoo/node_modules/@fixture/dep'), {
      name: '@fixture/dep',
      version: '1.0.0',
    });
    const npmExecPath = execSync('npm exec --offline --call "node -p process.env.npm_execpath"', {
      cwd: directory,
      encoding: 'utf8',
    }).trim();
    vi.stubEnv('npm_execpath', npmExecPath);
    const archive = path.join(directory, 'artifact.tgz');
    fs.writeFileSync(archive, 'archive bytes');
    const appDir = path.join(directory, 'node_modules/promptfoo/dist/src/app');
    writeBrowser(appDir);
    const output = path.join(directory, 'reports');
    writePackedConsumerSbom(directory, archive, output, 'default', {
      npm_config_registry: 'https://registry.npmjs.org/',
    });
    const inventory = JSON.parse(
      fs.readFileSync(path.join(output, 'runtime-default.json'), 'utf8'),
    );
    expect(inventory.components).toEqual([
      { name: '@fixture/dep', version: '1.0.0' },
      { name: '@fixture/dep', version: '2.0.0' },
      { name: 'actual', version: '3.0.0' },
      { name: 'promptfoo', version: '1.0.0' },
    ]);
    expect(inventory.artifact).toMatchObject({
      size: 13,
      sha512: expect.stringMatching(/^[a-f0-9]{128}$/),
    });
    expect(inventory.environment).toMatchObject({
      platform: process.platform,
      lifecycleScripts: false,
    });
    const sbom = JSON.parse(fs.readFileSync(path.join(output, 'runtime-default.cdx.json'), 'utf8'));
    expect(
      sbom.dependencies.find((entry: { ref: string }) => entry.ref === 'promptfoo@1.0.0').dependsOn,
    ).toEqual(['@fixture/dep@1.0.0']);
    // Required missing edges make npm fail, rather than publishing an incomplete graph.
    fs.rmSync(path.join(directory, 'node_modules/@fixture/dep'), { recursive: true });
    expect(() =>
      execFileSync(process.execPath, [npmExecPath, 'sbom', '--sbom-format=cyclonedx'], {
        cwd: directory,
        stdio: 'pipe',
      }),
    ).toThrow();
  });

  it('rejects silently omitted or phantom components', () => {
    const installed = [{ name: 'promptfoo', version: '1.0.0' }];
    expect(() => assertSbomCoverage(installed, { bomFormat: 'CycloneDX', components: [] })).toThrow(
      'actually installed',
    );
    expect(() =>
      assertSbomCoverage(installed, {
        bomFormat: 'CycloneDX',
        components: [
          ...installed.map((component) => ({ ...component, purl: 'pkg:npm/promptfoo@1.0.0' })),
          { name: 'dev-only', version: '1.0.0', purl: 'pkg:npm/dev-only@1.0.0' },
        ],
      }),
    ).toThrow('actually installed');
  });

  it('matches an npm alias by its canonical PURL, not its installation name', () => {
    expect(() =>
      assertSbomCoverage([{ name: '@openai/codex', version: '0.156.1-linux-x64' }], {
        bomFormat: 'CycloneDX',
        components: [
          {
            name: '@openai/codex-linux-x64',
            version: '0.156.1-linux-x64',
            purl: 'pkg:npm/%40openai/codex@0.156.1-linux-x64',
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertSbomCoverage([{ name: 'real', version: '1.0.0' }], {
        bomFormat: 'CycloneDX',
        components: [{ name: 'alias', version: '1.0.0', purl: 'pkg:npm/real@2.0.0' }],
      }),
    ).toThrow('PURL version');
  });

  it('does not count duplicate installations twice', () => {
    const directory = fixture();
    writePackage(path.join(directory, 'node_modules/a'), { name: 'a', version: '1.0.0' });
    writePackage(path.join(directory, 'node_modules/a/node_modules/a'), {
      name: 'a',
      version: '1.0.0',
    });
    expect(installedComponents(directory)).toEqual([{ name: 'a', version: '1.0.0' }]);
  });

  it('verifies browser hashes against installed bytes and rejects unreported assets', () => {
    const appDir = fixture();
    writeBrowser(appDir);
    expect(() => verifyPackedBrowserInventory(appDir)).not.toThrow();
    fs.writeFileSync(path.join(appDir, 'index.js'), 'tampered');
    expect(() => verifyPackedBrowserInventory(appDir)).toThrow('Packaged asset');
    writeBrowser(appDir);
    fs.writeFileSync(path.join(appDir, 'unreported.js'), 'extra');
    expect(() => verifyPackedBrowserInventory(appDir)).toThrow('cover all packaged assets');
  });
});

function writeBrowser(appDir: string) {
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'index.js'), 'browser');
  fs.writeFileSync(
    path.join(appDir, 'browser-inventory.json'),
    JSON.stringify({
      schemaVersion: 1,
      surface: 'app',
      assets: [
        { path: 'index.js', size: 7, sha256: createHash('sha256').update('browser').digest('hex') },
      ],
    }),
  );
}
