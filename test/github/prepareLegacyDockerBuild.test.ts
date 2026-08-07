import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

// The legacy Docker backfill patch (`PREPARE_LEGACY_BUILD_JS` in docker.yml) only ever
// runs during a manual `workflow_dispatch`, so no publish-path CI job exercises it. These
// tests execute the exact script embedded in the workflow against fixtures that mirror the
// real historical release trees, giving the dormant patch durable regression coverage on
// every PR. If this test breaks, the backfill is broken too.

const WORKFLOW = path.join(process.cwd(), '.github/workflows/docker.yml');

/** Server stage exactly as historical releases shipped it, pre-#9790. */
function legacyDockerfile(): string {
  return [
    '# syntax=docker/dockerfile:1',
    'FROM node:24.7.0-alpine AS base',
    '',
    'FROM base AS server',
    'WORKDIR /app',
    'COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules',
    'COPY --from=builder --chown=promptfoo:promptfoo /app/dist ./dist',
    '',
    'RUN npm link promptfoo && \\',
    '    chown promptfoo:promptfoo /app/node_modules/promptfoo && \\',
    '    mkdir -p /home/promptfoo/.promptfoo && chown promptfoo:promptfoo /home/promptfoo/.promptfoo',
    '',
    'USER promptfoo',
    '',
  ].join('\n');
}

/** Post-#9790 tree: the fix is already present, so a backfill must refuse it. */
function modernDockerfile(): string {
  return [
    'FROM base AS server',
    'WORKDIR /app',
    'COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules',
    'COPY --from=builder --chown=promptfoo:promptfoo /app/package.json ./package.json',
    'COPY --from=builder --chown=promptfoo:promptfoo /app/dist ./dist',
    '',
    'RUN ln -s /app /app/node_modules/promptfoo && \\',
    '    chown -h promptfoo:promptfoo /app/node_modules/promptfoo && \\',
    '    ln -s /app/dist/src/entrypoint.js /usr/local/bin/promptfoo && \\',
    '    ln -s /app/dist/src/entrypoint.js /usr/local/bin/pf && \\',
    '    mkdir -p /home/promptfoo/.promptfoo && chown promptfoo:promptfoo /home/promptfoo/.promptfoo',
    '',
  ].join('\n');
}

// 0.120.x used dist/src/main.js; 0.121.x used dist/src/entrypoint.js.
function packageJson(bin: string): string {
  return `${JSON.stringify({ name: 'promptfoo', version: '0.0.0', bin: { promptfoo: bin, pf: bin } }, null, 2)}\n`;
}

// tsconfig.app.json is JSONC and its `include` shape drifts across tags.
function tsconfig(include: string[]): string {
  return [
    '{',
    '  "compilerOptions": {',
    '    /* Bundler mode */',
    '    "moduleResolution": "bundler",',
    '    "strict": true',
    '  },',
    `  "include": ${JSON.stringify(include)}`,
    '}',
    '',
  ].join('\n');
}

let scriptPath: string;
let tmpRoot: string;

beforeAll(() => {
  const workflow = parseYaml(fs.readFileSync(WORKFLOW, 'utf8'));
  const script = workflow?.env?.PREPARE_LEGACY_BUILD_JS;
  expect(typeof script, 'docker.yml must define env.PREPARE_LEGACY_BUILD_JS').toBe('string');

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-legacy-'));
  scriptPath = path.join(tmpRoot, 'prepare-legacy-build.cjs');
  fs.writeFileSync(scriptPath, script);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

interface Fixture {
  dockerfile: string;
  bin: string;
  include?: string[];
}

interface RunResult {
  ok: boolean;
  stderr: string;
  dockerfile: string;
  tsconfig: string;
}

function run(fixture: Fixture, env: Record<string, string> = {}): RunResult {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'case-'));
  fs.writeFileSync(path.join(dir, 'Dockerfile'), fixture.dockerfile);
  fs.writeFileSync(path.join(dir, 'package.json'), packageJson(fixture.bin));
  fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
  const tsconfigPath = path.join(dir, 'src/app/tsconfig.app.json');
  fs.writeFileSync(tsconfigPath, tsconfig(fixture.include ?? ['./src']));

  let ok = true;
  let stderr = '';
  try {
    execFileSync(process.execPath, [scriptPath], {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err: any) {
    ok = false;
    stderr = String(err.stderr ?? '');
  }

  return {
    ok,
    stderr,
    dockerfile: fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8'),
    tsconfig: fs.readFileSync(tsconfigPath, 'utf8'),
  };
}

describe('legacy Docker backfill patch (embedded in docker.yml)', () => {
  it('rewrites the npm-link CLI stage for a 0.120.x-shaped tree', () => {
    const result = run({ dockerfile: legacyDockerfile(), bin: 'dist/src/main.js' });

    expect(result.ok).toBe(true);
    expect(result.dockerfile).not.toContain('npm link promptfoo');
    expect(result.dockerfile).toContain('ln -s /app/dist/src/main.js /usr/local/bin/promptfoo');
    expect(result.dockerfile).toContain('ln -s /app/dist/src/main.js /usr/local/bin/pf');
    // The runtime dir must survive the rewrite so the container can still boot.
    expect(result.dockerfile).toContain('mkdir -p /home/promptfoo/.promptfoo');
    // Exactly one CLI-link RUN chain: the old one is replaced, not appended.
    expect(result.dockerfile.match(/RUN ln -s \/app \/app\/node_modules\/promptfoo/g)).toHaveLength(
      1,
    );
  });

  it('adds the package.json COPY the historical server stage lacks', () => {
    const result = run({ dockerfile: legacyDockerfile(), bin: 'dist/src/main.js' });

    const copies = result.dockerfile.match(
      /COPY --from=builder --chown=promptfoo:promptfoo \/app\/package\.json \.\/package\.json/g,
    );
    expect(copies).toHaveLength(1);
  });

  it('uses the entrypoint.js bin for a 0.121.x-shaped tree', () => {
    const result = run({ dockerfile: legacyDockerfile(), bin: 'dist/src/entrypoint.js' });

    expect(result.ok).toBe(true);
    expect(result.dockerfile).toContain(
      'ln -s /app/dist/src/entrypoint.js /usr/local/bin/promptfoo',
    );
    expect(result.dockerfile).toContain('ln -s /app/dist/src/entrypoint.js /usr/local/bin/pf');
  });

  it('excludes test files from both historical tsconfig include shapes', () => {
    for (const include of [['./src'], ['./src', '../types/optional-deps.d.ts']]) {
      const result = run(
        { dockerfile: legacyDockerfile(), bin: 'dist/src/entrypoint.js', include },
        { EXCLUDE_LEGACY_FRONTEND_TESTS: 'true' },
      );

      expect(result.ok).toBe(true);
      const parsed = ts.parseConfigFileTextToJson('tsconfig.app.json', result.tsconfig);
      expect(
        parsed.error,
        `tsconfig must stay valid JSONC for include ${JSON.stringify(include)}`,
      ).toBeUndefined();
      expect(parsed.config.exclude).toEqual(['**/*.test.ts', '**/*.test.tsx']);
      // The original include is preserved so production sources still compile.
      expect(parsed.config.include).toEqual(include);
    }
  });

  it('leaves tsconfig untouched when the exclusion flag is off', () => {
    const original = tsconfig(['./src']);
    const result = run({ dockerfile: legacyDockerfile(), bin: 'dist/src/main.js' });

    expect(result.ok).toBe(true);
    expect(result.tsconfig).toBe(original);
  });

  it('refuses a tree that already carries the modern CLI links', () => {
    const result = run({ dockerfile: modernDockerfile(), bin: 'dist/src/entrypoint.js' });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('does not need legacy_backfill');
  });

  it('fails when the historical package.json omits a binary', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'nobin-'));
    fs.writeFileSync(path.join(dir, 'Dockerfile'), legacyDockerfile());
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: 'promptfoo', bin: { promptfoo: 'dist/src/main.js' } })}\n`,
    );
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app/tsconfig.app.json'), tsconfig(['./src']));

    let stderr = '';
    expect(() => {
      try {
        execFileSync(process.execPath, [scriptPath], {
          cwd: dir,
          env: { ...process.env },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch (err: any) {
        stderr = String(err.stderr ?? '');
        throw err;
      }
    }).toThrow();
    expect(stderr).toContain('promptfoo and pf binaries');
  });

  it('refuses to add a second exclude to a tsconfig that already has one', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'dup-exclude-'));
    fs.writeFileSync(path.join(dir, 'Dockerfile'), legacyDockerfile());
    fs.writeFileSync(path.join(dir, 'package.json'), packageJson('dist/src/entrypoint.js'));
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src/app/tsconfig.app.json'),
      '{\n  "exclude": ["dist"],\n  "include": ["./src"]\n}\n',
    );

    let stderr = '';
    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: dir,
        env: { ...process.env, EXCLUDE_LEGACY_FRONTEND_TESTS: 'true' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (err: any) {
      stderr = String(err.stderr ?? '');
    }
    expect(stderr).toContain('already declares "exclude"');
  });
});
