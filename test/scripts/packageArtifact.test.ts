import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { packPackageArtifact } from '../../scripts/packPackageArtifact';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function writeBuildAssets(source: string): void {
  for (const relativePath of [
    'drizzle/0000.sql',
    'dist/drizzle/0000.sql',
    'dist/src/app/index.html',
    'dist/src/app/assets/lazy.js',
  ]) {
    fs.mkdirSync(path.dirname(path.join(source, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(source, relativePath), 'fixture');
  }
}

describe('package artifact packing', () => {
  it('packs prebuilt bytes without hooks and inspects an unchanged archive with spaces in its path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-packer-'));
    directories.push(root);
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    writeBuildAssets(source);
    fs.writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({
        name: 'promptfoo',
        version: '1.2.3',
        files: ['index.js', 'dist'],
        scripts: { prepack: 'node -e "process.exit(99)"', prepare: 'node -e "process.exit(99)"' },
      }),
    );
    fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = "prebuilt";\n');
    const packed = packPackageArtifact(source, path.join(root, 'artifacts with spaces'));
    const renamed = path.join(path.dirname(packed), 'renamed archive.tgz');
    fs.renameSync(packed, renamed);
    const hash = () => createHash('sha512').update(fs.readFileSync(renamed)).digest('hex');
    const before = hash();
    const metadata = JSON.parse(
      execFileSync(
        process.execPath,
        [process.env.npm_execpath!, 'pack', renamed, '--dry-run', '--ignore-scripts', '--json'],
        { cwd: source, encoding: 'utf8' },
      ),
    );
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({ name: 'promptfoo', version: '1.2.3' });
    expect(metadata[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'index.js' })]),
    );
    expect(hash()).toBe(before);
    expect(fs.readdirSync(path.dirname(renamed))).toEqual(['renamed archive.tgz']);
  });

  it.each(['dist/drizzle/0000.sql', 'dist/src/app/assets/lazy.js'])(
    'rejects packing when the archive omits built asset %s',
    (omittedAsset) => {
      const source = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-missing-asset-'));
      directories.push(source);
      writeBuildAssets(source);
      fs.writeFileSync(
        path.join(source, 'package.json'),
        JSON.stringify({
          name: 'promptfoo',
          version: '1.2.3',
          files: [
            'dist/drizzle/0000.sql',
            'dist/src/app/index.html',
            'dist/src/app/assets/lazy.js',
          ].filter((file) => file !== omittedAsset),
        }),
      );
      expect(() => packPackageArtifact(source, path.join(source, 'artifacts'))).toThrow(
        `Missing packaged build assets: ${omittedAsset}`,
      );
    },
  );

  it('rejects a different package before emitting an artifact', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-packer-'));
    directories.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'other', version: '1.2.3' }),
    );
    const destination = path.join(root, 'output');
    expect(() => packPackageArtifact(root, destination)).toThrow('Expected the promptfoo package');
    expect(fs.existsSync(destination)).toBe(false);
  });
});

describe('standalone artifact tooling', () => {
  const script = path.resolve(__dirname, '../../scripts/preparePackageArtifactTest.mjs');

  it.each([0, 2])('rejects %i archives before creating a tooling directory', (count) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-tool-prepare-'));
    directories.push(root);
    for (let index = 0; index < count; index++) {
      fs.writeFileSync(path.join(root, `${index}.tgz`), 'fixture');
    }
    const result = spawnSync(
      process.execPath,
      [script, '--artifact-directory', root, '--temp-root', root],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Expected exactly one downloaded package archive');
    expect(fs.readdirSync(root)).toHaveLength(count);
  });

  it('prepares only the pinned test tools and preserves a selected archive with spaces', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact tools with spaces '));
    directories.push(root);
    const tarball = path.join(root, 'selected archive.tgz');
    fs.writeFileSync(tarball, 'selected bytes');
    const output = JSON.parse(
      execFileSync(process.execPath, [script, '--artifact-directory', root, '--temp-root', root], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: '' },
      }),
    );
    expect(output.tarball).toBe(tarball);
    expect(fs.readFileSync(tarball, 'utf8')).toBe('selected bytes');
    const manifest = JSON.parse(fs.readFileSync(path.join(output.tooling, 'package.json'), 'utf8'));
    expect(manifest.private).toBe(true);
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['semver', 'tsx', 'typescript']);
    for (const version of Object.values(manifest.dependencies)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }
    for (const excluded of ['src', 'dist', 'drizzle', 'node_modules', 'package-lock.json']) {
      expect(fs.existsSync(path.join(output.tooling, excluded))).toBe(false);
    }
  });
});
