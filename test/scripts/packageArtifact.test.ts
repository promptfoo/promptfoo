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

describe('installed migration fixture lifetime', () => {
  function prepareConsumer(nativeSource: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-lifetime-'));
    directories.push(root);
    const temporary = path.join(root, 'temporary');
    const packageDir = path.join(root, 'node_modules', 'promptfoo');
    const nativeDir = path.join(root, 'node_modules', '@libsql', 'client');
    fs.mkdirSync(temporary);
    fs.mkdirSync(path.join(packageDir, 'dist', 'src'), { recursive: true });
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({ name: 'promptfoo', exports: './dist/src/index.cjs' }),
    );
    fs.writeFileSync(path.join(packageDir, 'dist', 'src', 'index.cjs'), 'module.exports = {};');
    fs.cpSync(path.resolve(__dirname, '../../drizzle'), path.join(packageDir, 'dist', 'drizzle'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(nativeDir, 'index.js'),
      `require('node:fs').writeFileSync(__dirname + '/native-pid', String(process.pid));
${nativeSource}`,
    );
    const fixture = path.join(root, 'migrations.mjs');
    fs.copyFileSync(
      path.resolve(__dirname, '../fixtures/package-artifact/migrations.mjs'),
      fixture,
    );
    return { root, temporary, nativeDir, fixture };
  }

  function processIsRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      if (process.platform === 'linux') {
        // A killed grandchild may await reaping by init; a zombie cannot hold the database open.
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
      }
      return true;
    } catch (error) {
      if (['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return false;
      }
      throw error;
    }
  }

  it('loads native bindings in a child and cleans owned state when that child fails', () => {
    const { temporary, nativeDir, fixture } = prepareConsumer(
      "throw new Error('artifact-native-binding-sentinel');",
    );
    const result = spawnSync(process.execPath, [fixture], {
      encoding: 'utf8',
      timeout: 8_000,
      env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('artifact-native-binding-sentinel');
    expect(Number(fs.readFileSync(path.join(nativeDir, 'native-pid'), 'utf8'))).not.toBe(
      result.pid,
    );
    expect(fs.readdirSync(temporary)).toEqual([]);
  });

  it.each([false, true])(
    'terminates a stalled native check and cleans owned state (descendant: %s)',
    async (withDescendant) => {
      const timeoutMs = 1_500;
      const descendant = `require('node:fs').writeFileSync(process.argv[1], String(process.pid));
setInterval(() => {}, 1000);`;
      const { root, temporary, nativeDir, fixture } = prepareConsumer(
        withDescendant
          ? `require('node:child_process').spawnSync(process.execPath,
['-e', ${JSON.stringify(descendant)}, __dirname + '/descendant-pid'], { stdio: 'inherit' });`
          : 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
      );
      const pidFiles = ['native-pid', ...(withDescendant ? ['descendant-pid'] : [])].map((name) =>
        path.join(nativeDir, name),
      );
      const output = path.join(root, 'supervisor.log');
      const descriptor = fs.openSync(output, 'w');
      try {
        // File descriptors prevent orphaned inherited pipes from hanging the outer watchdog.
        const result = spawnSync(process.execPath, [fixture, '--timeout-ms', String(timeoutMs)], {
          stdio: ['ignore', descriptor, descriptor],
          timeout: 8_000,
          killSignal: 'SIGKILL',
          env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).not.toBeNull();
        expect(result.status).not.toBe(0);
        expect(fs.readFileSync(output, 'utf8')).toContain(
          `Installed migration check timed out after ${timeoutMs}ms`,
        );
        const pids = pidFiles.map((file) => Number(fs.readFileSync(file, 'utf8')));
        expect(new Set([result.pid, ...pids]).size).toBe(pids.length + 1);
        for (const pid of pids) {
          expect(Number.isInteger(pid) && pid > 0 && pid !== process.pid).toBe(true);
        }
        const deadline = Date.now() + 1_000;
        while (pids.some(processIsRunning) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(pids.filter(processIsRunning)).toEqual([]);
        expect(fs.readdirSync(temporary)).toEqual([]);
      } finally {
        fs.closeSync(descriptor);
        // Clean only PIDs recorded by these owned fixtures, even if the supervisor regresses.
        for (const file of pidFiles) {
          if (!fs.existsSync(file)) {
            continue;
          }
          const pid = Number(fs.readFileSync(file, 'utf8'));
          if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && processIsRunning(pid)) {
            try {
              process.kill(pid, 'SIGKILL');
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
                throw error;
              }
            }
          }
        }
      }
    },
  );
});
