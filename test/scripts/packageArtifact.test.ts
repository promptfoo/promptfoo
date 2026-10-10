import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packPackageArtifact } from '../../scripts/packPackageArtifact';
import { mockProcessEnv, removeTempDir } from '../util/utils';

// Command mode avoids package resolution and finds node.exe on Windows.
const npmExecPath = execSync('npm exec --offline --call "node -p process.env.npm_execpath"', {
  encoding: 'utf8',
}).trim();
const directories: string[] = [];
let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({ npm_execpath: npmExecPath });
});
afterEach(() => {
  restoreEnv();
  for (const directory of directories.splice(0)) {
    removeTempDir(directory);
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

describe('package artifact profiles', () => {
  it('rejects browser installation in the omit-optional profile', () => {
    const script = path.resolve(__dirname, '../../scripts/testPackageArtifact.ts');
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', script, '--browser', '--profile', 'omit-optional'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--browser requires the default profile');
    expect(result.stdout).not.toContain('Installing packed consumer');
  });
});

describe('package artifact packing', () => {
  it('packs prebuilt bytes without hooks and inspects an unchanged archive with spaces in its path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-packer-'));
    directories.push(root);
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    writeBuildAssets(source);
    fs.writeFileSync(path.join(source, 'dist/src/app/tsconfig.app.tsbuildinfo'), 'compiler cache');
    fs.writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({
        name: 'promptfoo',
        version: '1.2.3',
        files: ['index.js', 'dist', '!dist/**/*.tsbuildinfo'],
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
        [npmExecPath, 'pack', renamed, '--dry-run', '--ignore-scripts', '--json'],
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

  function prepareTooling(root: string) {
    const scripts = path.join(root, 'scripts');
    const temporary = path.join(root, 'temporary');
    const artifacts = path.join(root, 'artifacts');
    for (const directory of [
      scripts,
      temporary,
      artifacts,
      path.join(root, 'test/fixtures/package-artifact'),
      path.join(root, 'test/fixtures/transformers/tiny-bert/onnx'),
    ]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    for (const filename of [
      'preparePackageArtifactTest.mjs',
      'testPackageArtifact.ts',
      'packPackageArtifact.ts',
      'packedConsumerSbom.ts',
      'postbuild.ts',
    ]) {
      fs.copyFileSync(
        path.resolve(__dirname, '../../scripts', filename),
        path.join(scripts, filename),
      );
    }
    fs.writeFileSync(
      path.join(root, 'test/fixtures/transformers/tiny-bert/onnx/model.onnx'),
      'offline model fixture',
    );
    const entry = {
      version: '1.2.3',
      resolved: 'https://registry.example/tool-1.2.3.tgz',
      integrity: 'sha512-fixture',
      dev: true,
    };
    const packages: Record<string, Record<string, unknown>> = {
      'node_modules/tsx': {
        ...entry,
        dependencies: { shared: '^1.0.0' },
        optionalDependencies: { native: '^1.0.0' },
      },
      'node_modules/typescript': { ...entry, dependencies: { shared: '^1.0.0' } },
      'node_modules/shared': { ...entry, devOptional: true },
      'node_modules/tsx/node_modules/native': {
        ...entry,
        optional: true,
        os: ['darwin'],
        cpu: ['arm64'],
      },
      'node_modules/unrelated': entry,
    };
    const lockPath = path.join(root, 'package-lock.json');
    fs.writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 3, packages }));
    const tarball = path.join(artifacts, 'selected archive.tgz');
    fs.writeFileSync(tarball, 'selected bytes');
    return {
      script: path.join(scripts, 'preparePackageArtifactTest.mjs'),
      temporary,
      artifacts,
      tarball,
      lockPath,
      packages,
    };
  }

  it('preserves transitive integrity and nested optional platform metadata in isolated tooling', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact tools with spaces '));
    directories.push(root);
    const fixture = prepareTooling(root);
    const output = JSON.parse(
      execFileSync(
        process.execPath,
        [
          fixture.script,
          '--artifact-directory',
          fixture.artifacts,
          '--temp-root',
          fixture.temporary,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, GITHUB_OUTPUT: '' },
        },
      ),
    );
    expect(output.tarball).toBe(fixture.tarball);
    expect(
      fs.readFileSync(
        path.join(output.tooling, 'test/fixtures/transformers/tiny-bert/onnx/model.onnx'),
        'utf8',
      ),
    ).toBe('offline model fixture');
    expect(fs.readFileSync(fixture.tarball, 'utf8')).toBe('selected bytes');
    const manifest = JSON.parse(fs.readFileSync(path.join(output.tooling, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({
      private: true,
      dependencies: { tsx: '1.2.3', typescript: '1.2.3' },
    });
    expect(manifest).not.toHaveProperty('devDependencies');
    expect(manifest).not.toHaveProperty('workspaces');
    const toolingLock = JSON.parse(
      fs.readFileSync(path.join(output.tooling, 'package-lock.json'), 'utf8'),
    );
    expect(Object.keys(toolingLock.packages).sort()).toEqual([
      '',
      'node_modules/shared',
      'node_modules/tsx',
      'node_modules/tsx/node_modules/native',
      'node_modules/typescript',
    ]);
    expect(toolingLock.packages['node_modules/shared']).toMatchObject({
      version: '1.2.3',
      resolved: 'https://registry.example/tool-1.2.3.tgz',
      integrity: 'sha512-fixture',
    });
    expect(toolingLock.packages['node_modules/tsx/node_modules/native']).toMatchObject({
      optional: true,
      os: ['darwin'],
      cpu: ['arm64'],
      integrity: 'sha512-fixture',
    });
    for (const entry of Object.values(toolingLock.packages)) {
      expect(entry).not.toHaveProperty('dev');
      expect(entry).not.toHaveProperty('devOptional');
    }
    for (const excluded of ['src', 'dist', 'drizzle', 'node_modules']) {
      expect(fs.existsSync(path.join(output.tooling, excluded))).toBe(false);
    }
  });

  it('rejects a missing transitive tool dependency before creating an installable bootstrap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-missing-lock-edge-'));
    directories.push(root);
    const fixture = prepareTooling(root);
    delete fixture.packages['node_modules/shared'];
    fs.writeFileSync(fixture.lockPath, JSON.stringify({ packages: fixture.packages }));
    const result = spawnSync(
      process.execPath,
      [fixture.script, '--artifact-directory', fixture.artifacts, '--temp-root', fixture.temporary],
      { encoding: 'utf8', timeout: 5_000, env: { ...process.env, GITHUB_OUTPUT: '' } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing locked artifact tool dependency: shared');
    expect(fs.readdirSync(fixture.temporary)).toEqual([]);
    expect(fs.readFileSync(fixture.tarball, 'utf8')).toBe('selected bytes');
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
    fs.copyFileSync(
      path.resolve(__dirname, '../fixtures/package-artifact/isolated.mjs'),
      path.join(root, 'isolated.mjs'),
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
      if (process.platform === 'darwin') {
        // Match the fixture supervisor: exited descendants can await reaping on macOS too.
        const status = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], {
          encoding: 'utf8',
          timeout: 1_000,
        });
        if (status.error) {
          throw status.error;
        }
        if (status.status === 1 && !status.stdout.trim() && !status.stderr.trim()) {
          return false; // The process exited between kill(0) and ps.
        }
        if (status.status !== 0) {
          throw new Error(`Could not inspect fixture process ${pid}: ${status.stderr}`);
        }
        return !status.stdout.trim().startsWith('Z');
      }
      return true;
    } catch (error) {
      if (['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return false;
      }
      throw error;
    }
  }

  it.each(['--max-old-space-size=128 --max_old_space_size 64', '--max-old-space-size 64'])(
    'preserves only the last caller heap limit in isolated children (%s)',
    (heapOptions) => {
      const expectedHeapLimit = Number(
        execFileSync(
          process.execPath,
          [
            '--max-old-space-size=64',
            '-p',
            'require("node:v8").getHeapStatistics().heap_size_limit',
          ],
          { encoding: 'utf8' },
        ),
      );
      const { root, temporary } = prepareConsumer('');
      const fixture = path.join(root, 'heap-limit.mjs');
      fs.writeFileSync(
        fixture,
        `import assert from 'node:assert/strict';
import { getHeapStatistics } from 'node:v8';
if (process.argv[2] === '--child') {
  assert.equal(process.env.NODE_OPTIONS, '--max-old-space-size=64');
  assert.equal(getHeapStatistics().heap_size_limit, ${expectedHeapLimit});
  console.log('isolated-heap-limit-sentinel');
} else {
  process.env.NODE_OPTIONS = ${JSON.stringify(`${heapOptions} --require ./must-not-load.cjs`)};
  const { runIsolated } = await import('./isolated.mjs');
  await runIsolated(import.meta.url, { label: 'heap-limit', timeoutMs: 1500 });
}
`,
      );
      const result = spawnSync(process.execPath, [fixture], {
        encoding: 'utf8',
        timeout: 5_000,
        env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('isolated-heap-limit-sentinel');
      expect(fs.readdirSync(temporary)).toEqual([]);
    },
  );

  async function killRecordedProcesses(files: string[]) {
    for (const file of files) {
      if (!fs.existsSync(file)) {
        continue;
      }
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && processIsRunning(pid)) {
        try {
          if (process.platform === 'win32') {
            execFileSync(
              path.join(process.env.SystemRoot!, 'System32', 'taskkill.exe'),
              ['/pid', String(pid), '/t', '/f'],
              { stdio: 'pipe', windowsHide: true, timeout: 5_000 },
            );
          } else {
            process.kill(pid, 'SIGKILL');
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            throw error;
          }
        }
        await vi.waitFor(() => expect(processIsRunning(pid)).toBe(false), {
          timeout: 1_000,
          interval: 20,
        });
      }
    }
  }

  it('preserves loader paths, isolates credentials, and cleans state when a native child fails', () => {
    const loaderPath = process.env.LD_LIBRARY_PATH || 'artifact-loader-path';
    const { temporary, nativeDir, fixture } = prepareConsumer(
      `require('node:assert/strict').equal(process.env.LD_LIBRARY_PATH, ${JSON.stringify(loaderPath)});
require('node:assert/strict').equal(process.env.OPENAI_API_KEY, undefined);
throw new Error('artifact-native-binding-sentinel');`,
    );
    const result = spawnSync(process.execPath, [fixture], {
      encoding: 'utf8',
      timeout: 8_000,
      env: {
        ...process.env,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        LD_LIBRARY_PATH: loaderPath,
        OPENAI_API_KEY: 'fixture-key',
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('artifact-native-binding-sentinel');
    expect(Number(fs.readFileSync(path.join(nativeDir, 'native-pid'), 'utf8'))).not.toBe(
      result.pid,
    );
    expect(fs.readdirSync(temporary)).toEqual([]);
  });

  it('removes owned state and signal listeners after a successful child exits', () => {
    const { root, temporary } = prepareConsumer('');
    const fixture = path.join(root, 'success.mjs');
    fs.writeFileSync(
      fixture,
      `import assert from 'node:assert/strict';
import { runIsolated } from './isolated.mjs';
if (process.argv[2] !== '--child') {
  const signals = ['SIGINT', 'SIGTERM'];
  const before = signals.map((signal) => process.listenerCount(signal));
  await runIsolated(import.meta.url, { label: 'success' });
  assert.deepEqual(signals.map((signal) => process.listenerCount(signal)), before);
}
`,
    );
    const result = spawnSync(process.execPath, [fixture], {
      encoding: 'utf8',
      timeout: 8_000,
      env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(fs.readdirSync(temporary)).toEqual([]);
  });

  it.each(['success', 'throw', 'exit-code', 'abrupt', 'lingering'] as const)(
    'supervises detached descendants through fixture completion (%s)',
    async (mode) => {
      const { root, temporary, nativeDir } = prepareConsumer('');
      const fixture = path.join(root, 'completion.mjs');
      const pidFiles = ['native-pid', 'descendant-pid'].map((name) => path.join(nativeDir, name));
      fs.writeFileSync(
        fixture,
        `import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { runIsolated } from './isolated.mjs';
if (process.argv[2] === '--child') {
  assert.deepEqual(process.argv.slice(4), ['argument with spaces']);
  fs.writeFileSync(${JSON.stringify(pidFiles[0])}, String(process.pid));
  spawn(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);`)}, ${JSON.stringify(pidFiles[1])}], {
    stdio: 'ignore', detached: true,
  }).unref();
  while (!fs.existsSync(${JSON.stringify(pidFiles[1])})) await delay(10);
  if (${JSON.stringify(mode)} === 'throw') throw new Error('completion-error-sentinel');
  if (${JSON.stringify(mode)} === 'exit-code') process.exitCode = 7;
  if (${JSON.stringify(mode)} === 'abrupt') process.exit(9);
  if (${JSON.stringify(mode)} === 'lingering') setInterval(() => {}, 1000);
} else {
  await runIsolated(import.meta.url, {
    label: 'completion', args: ['argument with spaces'], timeoutMs: 1500,
  });
}
`,
      );
      try {
        const result = spawnSync(process.execPath, [fixture], {
          encoding: 'utf8',
          timeout: 8_000,
          killSignal: 'SIGKILL',
          env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).not.toBeNull();
        if (mode === 'success') {
          expect(result.status, result.stderr).toBe(0);
        } else {
          expect(result.status).not.toBe(0);
        }
        if (mode === 'throw') {
          expect(result.stderr).toContain('completion-error-sentinel');
        } else if (mode === 'exit-code') {
          expect(result.stderr).toContain('Installed completion check failed (7)');
        } else if (mode === 'lingering') {
          expect(result.stderr).toContain('Installed completion check timed out after 1500ms');
        }
        const pids = pidFiles.map((file) => Number(fs.readFileSync(file, 'utf8')));
        expect(new Set([result.pid, ...pids]).size).toBe(3);
        if (mode === 'abrupt') {
          expect(result.stderr).toContain('Retained completion state after termination failure');
          expect(fs.readdirSync(temporary)).toHaveLength(1);
        } else {
          await vi.waitFor(() => expect(pids.filter(processIsRunning)).toEqual([]), {
            timeout: 1_000,
            interval: 20,
          });
          expect(fs.readdirSync(temporary)).toEqual([]);
        }
      } finally {
        await killRecordedProcesses(pidFiles);
      }
    },
  );

  it.each(['none', 'inherited', 'detached'] as const)(
    'terminates a stalled native check and cleans owned state (descendant: %s)',
    async (mode) => {
      const timeoutMs = 1_500;
      const descendant = `require('node:fs').writeFileSync(process.argv[1], String(process.pid));
setInterval(() => {}, 1000);`;
      const { root, temporary, nativeDir, fixture } = prepareConsumer(
        mode === 'detached'
          ? `require('node:child_process').spawn(process.execPath,
['-e', ${JSON.stringify(descendant)}, __dirname + '/descendant-pid'], {
  stdio: 'ignore', detached: true,
}).unref();
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);`
          : mode === 'inherited'
            ? `require('node:child_process').spawnSync(process.execPath,
['-e', ${JSON.stringify(descendant)}, __dirname + '/descendant-pid'], { stdio: 'inherit' });`
            : 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
      );
      const pidFiles = ['native-pid', ...(mode === 'none' ? [] : ['descendant-pid'])].map((name) =>
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
        await vi.waitFor(() => expect(pids.filter(processIsRunning)).toEqual([]), {
          timeout: 1_000,
          interval: 20,
        });
        expect(fs.readdirSync(temporary)).toEqual([]);
      } finally {
        fs.closeSync(descriptor);
        await killRecordedProcesses(pidFiles);
      }
    },
  );

  it.runIf(process.platform !== 'win32').each([
    { signal: 'SIGINT', detached: false },
    { signal: 'SIGTERM', detached: false },
    { signal: 'SIGINT', detached: true },
    { signal: 'SIGTERM', detached: true },
  ] as const)(
    'terminates owned processes and cleans state on $signal (detached: $detached)',
    async ({ signal, detached }) => {
      const descendant = `require('node:fs').writeFileSync(process.argv[1], String(process.pid));
setInterval(() => {}, 1000);`;
      const { root, temporary, nativeDir, fixture } = prepareConsumer(
        `require('node:child_process').spawn(process.execPath,
['-e', ${JSON.stringify(descendant)}, __dirname + '/descendant-pid'], {
  stdio: 'ignore', detached: ${detached},
}).unref();
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);`,
      );
      const pidFiles = ['native-pid', 'descendant-pid'].map((name) => path.join(nativeDir, name));
      const preload = path.join(root, 'delayed-signal.mjs');
      fs.writeFileSync(
        preload,
        `const originalKill = process.kill;
process.kill = function (pid, signal) {
  if (pid === process.pid && ['SIGINT', 'SIGTERM'].includes(signal)) {
    setTimeout(() => originalKill.call(process, pid, signal), 50).unref();
    return true;
  }
  return originalKill.call(process, pid, signal);
};`,
      );
      const output = path.join(root, 'supervisor.log');
      const descriptor = fs.openSync(output, 'w');
      // The preload delays only the supervisor's self-signal, never its child's cleanup.
      const supervisor = spawn(
        process.execPath,
        ['--import', pathToFileURL(preload).href, fixture],
        {
          stdio: ['ignore', descriptor, descriptor],
          timeout: 8_000,
          killSignal: 'SIGKILL',
          env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
        },
      );
      const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          supervisor.once('error', reject);
          supervisor.once('close', (code, signal) => resolve({ code, signal }));
        },
      );
      try {
        await vi.waitFor(() => expect(pidFiles.every((file) => fs.existsSync(file))).toBe(true), {
          timeout: 3_000,
          interval: 20,
        });
        expect(supervisor.kill(signal)).toBe(true);
        const result = await closed;
        expect(result, fs.readFileSync(output, 'utf8')).toEqual({ code: null, signal });
        const pids = pidFiles.map((file) => Number(fs.readFileSync(file, 'utf8')));
        await vi.waitFor(() => expect(pids.filter(processIsRunning)).toEqual([]), {
          timeout: 1_000,
          interval: 20,
        });
        expect(fs.readdirSync(temporary)).toEqual([]);
      } finally {
        supervisor.kill('SIGKILL');
        await closed;
        fs.closeSync(descriptor);
        await killRecordedProcesses(pidFiles);
      }
    },
  );

  it('retains owned state when best-effort kill emits a synchronous error after tree termination fails', async () => {
    const { root, temporary, nativeDir, fixture } = prepareConsumer(
      'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
    );
    const preload = path.join(root, 'kill-failure.mjs');
    fs.writeFileSync(
      preload,
      `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const failure = () => Object.assign(new Error('injected-tree-kill-failure'), { code: 'EPERM' });
const originalProcessKill = process.kill;
process.kill = function (pid, signal) {
  if (pid < 0) throw failure();
  return originalProcessKill.call(process, pid, signal);
};
childProcess.execFileSync = () => { throw failure(); };
syncBuiltinESMExports();
const originalChildKill = childProcess.ChildProcess.prototype.kill;
childProcess.ChildProcess.prototype.kill = function (signal) {
  const result = originalChildKill.call(this, signal);
  console.error('injected-synchronous-child-kill-error');
  this.emit('error', Object.assign(new Error('injected-child-kill-EPERM'), { code: 'EPERM' }));
  return result;
};`,
    );
    const output = path.join(root, 'supervisor.log');
    const descriptor = fs.openSync(output, 'w');
    const pidFile = path.join(nativeDir, 'native-pid');
    try {
      // --import applies only to this supervisor; its child receives no preload arguments.
      const result = spawnSync(
        process.execPath,
        ['--import', pathToFileURL(preload).href, fixture, '--timeout-ms', '1500'],
        {
          stdio: ['ignore', descriptor, descriptor],
          timeout: 8_000,
          killSignal: 'SIGKILL',
          env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBeNull();
      expect(result.status).not.toBe(0);
      const diagnostic = fs.readFileSync(output, 'utf8');
      expect(diagnostic).toContain('injected-synchronous-child-kill-error');
      expect(diagnostic).toContain('Could not confirm termination of fixture process tree');
      expect(diagnostic).toContain('Retained migration state after termination failure');
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      expect(Number.isInteger(pid) && pid > 0 && pid !== process.pid && pid !== result.pid).toBe(
        true,
      );
      await vi.waitFor(() => expect(processIsRunning(pid)).toBe(false), {
        timeout: 1_000,
        interval: 20,
      });
      const retained = fs.readdirSync(temporary);
      expect(retained).toHaveLength(1);
      expect(retained[0]).toMatch(/^promptfoo-artifact-migration-/);
      expect(fs.statSync(path.join(temporary, retained[0])).isDirectory()).toBe(true);
    } finally {
      fs.closeSync(descriptor);
      await killRecordedProcesses([pidFile]);
    }
  });
});
