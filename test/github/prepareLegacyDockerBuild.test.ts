import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import JSON5 from 'json5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

// Exercise the manual backfill patch in ordinary CI without publishing images.

const WORKFLOW = path.join(process.cwd(), '.github/workflows/docker.yml');
const workflow = parseYaml(fs.readFileSync(WORKFLOW, 'utf8'));

/** Server stage exactly as historical releases shipped it, pre-#9790. */
function legacyDockerfile(): string {
  return [
    '# syntax=docker/dockerfile:1',
    'FROM node:24.7.0-alpine AS base',
    'RUN apk add --no-cache python3~=3.12 py3-pip',
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
  const script = workflow?.env?.PREPARE_LEGACY_BUILD_JS;
  expect(typeof script, 'docker.yml must define env.PREPARE_LEGACY_BUILD_JS').toBe('string');

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-legacy-'));
  scriptPath = path.join(tmpRoot, 'prepare-legacy-build.cjs');
  fs.writeFileSync(scriptPath, script);
});

afterAll(() => {
  if (tmpRoot) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
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
    expect(result.dockerfile).toContain(
      ['ln -s /app/dist/src/main.js /usr/local/bin/pf && \\', '    mkdir -p'].join('\n'),
    );
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

  it('replaces the historical Python minor when requested', () => {
    const result = run(
      { dockerfile: legacyDockerfile(), bin: 'dist/src/entrypoint.js' },
      { PYTHON_VERSION: '3.14' },
    );

    expect(result.ok).toBe(true);
    expect(result.dockerfile).toContain('ARG PYTHON_VERSION');
    expect(result.dockerfile).toContain('python3~=${PYTHON_VERSION}');
    expect(result.dockerfile).not.toContain('python3~=3.12');
  });

  it('preserves an existing parameterized Python minor', () => {
    const dockerfile = legacyDockerfile()
      .replace('RUN apk add --no-cache', 'ARG PYTHON_VERSION=3.12\nRUN apk add --no-cache')
      .replace('python3~=3.12', 'python3~=${PYTHON_VERSION}');
    const result = run({ dockerfile, bin: 'dist/src/entrypoint.js' }, { PYTHON_VERSION: '3.14' });

    expect(result.ok).toBe(true);
    expect(result.dockerfile.match(/ARG PYTHON_VERSION/g)).toHaveLength(1);
    expect(result.dockerfile).toContain('python3~=${PYTHON_VERSION}');
  });

  it('excludes test files from both historical tsconfig include shapes', () => {
    for (const include of [['./src'], ['./src', '../types/optional-deps.d.ts']]) {
      const result = run(
        { dockerfile: legacyDockerfile(), bin: 'dist/src/entrypoint.js', include },
        { EXCLUDE_LEGACY_FRONTEND_TESTS: 'true' },
      );

      expect(result.ok).toBe(true);
      const parsed = JSON5.parse(result.tsconfig);
      expect(parsed.exclude).toEqual(['**/*.test.ts', '**/*.test.tsx']);
      // The original include is preserved so production sources still compile.
      expect(parsed.include).toEqual(include);
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

// The Docker workflow runs on Ubuntu; these cases execute its Bash blocks directly.
describe.runIf(process.platform !== 'win32')('legacy backfill publication guards', () => {
  it.each([
    { name: 'missing release tag', env: { LEGACY_BACKFILL: 'true', RELEASE_TAG: '' }, ok: false },
    {
      name: 'frontend override without backfill',
      env: { EXCLUDE_LEGACY_FRONTEND_TESTS: 'true' },
      ok: false,
    },
    { name: 'Python override without backfill', env: { PYTHON_VERSION: '3.14' }, ok: false },
    {
      name: 'invalid Python minor',
      env: { LEGACY_BACKFILL: 'true', PYTHON_VERSION: 'wrong' },
      ok: false,
    },
    { name: 'ordinary release', env: {}, ok: true },
    {
      name: 'historical release',
      env: {
        LEGACY_BACKFILL: 'true',
        PYTHON_VERSION: '3.14',
        EXCLUDE_LEGACY_FRONTEND_TESTS: 'true',
      },
      ok: true,
    },
  ])('validates $name', ({ env, ok }) => {
    const step = workflow.jobs.test.steps.find(
      (candidate: { name: string }) => candidate.name === 'Validate manual backfill options',
    );
    const result = spawnSync('bash', ['-e', '-c', step.run], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        LEGACY_BACKFILL: 'false',
        RELEASE_TAG: '0.120.0',
        PYTHON_VERSION: '',
        EXCLUDE_LEGACY_FRONTEND_TESTS: 'false',
        ...env,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status === 0, result.stdout + result.stderr).toBe(ok);
  });

  it.each(['404', '200', '401', '500'])(
    'rechecks registry status %s before creating a manifest',
    (status) => {
      const dir = fs.mkdtempSync(path.join(tmpRoot, 'manifest-'));
      const marker = path.join(dir, 'published');
      fs.writeFileSync(path.join(dir, '1'.repeat(64)), '');
      const step = workflow.jobs['merge-docker-digests'].steps.find(
        (candidate: { name: string }) => candidate.name === 'Create manifest list and push',
      );
      const script = step.run
        .replaceAll('${{ env.REGISTRY }}', 'fixture.invalid')
        .replaceAll('${{ env.IMAGE_NAME }}', 'fixture/repo');
      const result = spawnSync(
        'bash',
        [
          '-e',
          '-c',
          `
        curl() {
          case "$*" in
            *'/token?'*) printf '%s' '{"token":"fixture"}' ;;
            *) printf '%s' "$FIXTURE_STATUS" ;;
          esac
        }
        jq() {
          if [[ "$1" == '-r' ]]; then
            printf '%s' fixture
          else
            printf '%s' '-t fixture.invalid/fixture/repo:0.120.0'
          fi
        }
        docker() { printf '%s\n' "$@" > "$FIXTURE_MARKER"; }
        ${script}
      `,
        ],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            LEGACY_BACKFILL: 'true',
            REGISTRY: 'fixture.invalid',
            IMAGE_NAME: 'fixture/repo',
            RELEASE_TAG: '0.120.0',
            FIXTURE_STATUS: status,
            FIXTURE_MARKER: marker,
            DOCKER_METADATA_OUTPUT_JSON: '{}',
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status === 0, result.stdout + result.stderr).toBe(status === '404');
      expect(fs.existsSync(marker)).toBe(status === '404');
      if (status === '404') {
        expect(fs.readFileSync(marker, 'utf8').trim().split('\n')).toEqual([
          'buildx',
          'imagetools',
          'create',
          '-t',
          'fixture.invalid/fixture/repo:0.120.0',
          `fixture.invalid/fixture/repo@sha256:${'1'.repeat(64)}`,
        ]);
      }
    },
  );
});
