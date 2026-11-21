import { spawnSync } from 'node:child_process';
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

const scriptPath = path.resolve('.github/scripts/prepareLegacyDockerBuild.cjs');
let tmpRoot: string;
beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-legacy-'));
});

afterAll(() => {
  if (tmpRoot) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

interface Fixture {
  dockerfile?: string;
  bin?: string;
  manifest?: object;
  include?: string[];
  tsconfig?: string;
}

function run(fixture: Fixture, env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'case-'));
  const bin = fixture.bin ?? 'dist/src/main.js';
  const manifest = fixture.manifest ?? { version: '0.120.0', bin: { promptfoo: bin, pf: bin } };
  fs.writeFileSync(path.join(dir, 'Dockerfile'), fixture.dockerfile ?? legacyDockerfile());
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
  const tsconfigPath = path.join(dir, 'src/app/tsconfig.app.json');
  fs.writeFileSync(tsconfigPath, fixture.tsconfig ?? tsconfig(fixture.include ?? ['./src']));

  const result = spawnSync(process.execPath, [scriptPath], { cwd: dir, env, encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return {
    ok: result.status === 0,
    stderr: result.stderr,
    dockerfile: fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8'),
    tsconfig: fs.readFileSync(tsconfigPath, 'utf8'),
  };
}

describe('historical Docker backfill preparation', () => {
  it('rewrites the npm-link CLI stage for a 0.120.x-shaped tree', () => {
    const result = run({});

    expect(result.ok).toBe(true);
    expect(result.dockerfile).not.toContain('npm link promptfoo');
    expect(result.dockerfile.split('FROM base AS server')[1]).toContain(
      'ARG OS_PACKAGE_REFRESH=\nRUN apk upgrade --no-cache',
    );
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
    const result = run({});

    const copies = result.dockerfile.match(
      /COPY --from=builder --chown=promptfoo:promptfoo \/app\/package\.json \.\/package\.json/g,
    );
    expect(copies).toHaveLength(1);
  });

  it('uses the entrypoint.js bin for a 0.121.x-shaped tree', () => {
    const result = run({ bin: 'dist/src/entrypoint.js' });

    expect(result.ok).toBe(true);
    expect(result.dockerfile).toContain(
      'ln -s /app/dist/src/entrypoint.js /usr/local/bin/promptfoo',
    );
    expect(result.dockerfile).toContain('ln -s /app/dist/src/entrypoint.js /usr/local/bin/pf');
  });

  it('replaces the historical Python minor when requested', () => {
    const result = run({ bin: 'dist/src/entrypoint.js' }, { PYTHON_VERSION: '3.14' });

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
        { bin: 'dist/src/entrypoint.js', include },
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
    const result = run({});

    expect(result.ok).toBe(true);
    expect(result.tsconfig).toBe(original);
  });

  it('rejects publication of 0.120.x before changing any files', () => {
    const result = run({}, { RUN_CURRENT_IMAGE_CHECKS: 'true' });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('promptfoo/contracts');
    expect(result.stderr).toContain('PROMPTFOO_RUNNING_IN_DOCKER');
    expect(result.stderr).toContain('Disable publish_legacy_image to validate only');
    expect(result.dockerfile).toBe(legacyDockerfile());
  });

  it('requires the update markers even on releases that export contracts', () => {
    const manifest = { version: '0.121.16', exports: { './contracts': './contracts.js' } };
    const result = run({ manifest }, { RUN_CURRENT_IMAGE_CHECKS: 'true' });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('PROMPTFOO_OFFICIAL_DOCKER_IMAGE');
  });

  it('admits compatible tags unchanged and rejects legacy overrides', () => {
    const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const fixture = { dockerfile, manifest };
    expect(run(fixture, { RUN_CURRENT_IMAGE_CHECKS: 'true' })).toMatchObject({
      ok: true,
      dockerfile,
      tsconfig: tsconfig(['./src']),
    });
    expect(run(fixture, { PYTHON_VERSION: '3.14' }).ok).toBe(false);
  });

  it.each([
    { promptfoo: 'dist/src/main.js' },
    { promptfoo: 'untrusted; exit 1', pf: 'untrusted; exit 1' },
  ])('rejects missing or unsafe CLI paths', (bin) => {
    const result = run({ manifest: { bin } });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('promptfoo and pf binaries');
    expect(result.dockerfile).toBe(legacyDockerfile());
  });

  it('refuses to add a duplicate tsconfig exclude', () => {
    const result = run(
      { tsconfig: JSON.stringify({ exclude: ['dist'], include: ['./src'] }, null, 2) },
      { EXCLUDE_LEGACY_FRONTEND_TESTS: 'true' },
    );
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('already declares "exclude"');
  });
});

// The Docker workflow runs on Ubuntu; these cases execute its Bash blocks directly.
describe.runIf(process.platform !== 'win32')('legacy backfill publication guards', () => {
  it.each([
    { name: 'missing release tag', env: { LEGACY_BACKFILL: 'true', RELEASE_TAG: '' }, ok: false },
    {
      name: 'historical publication from another branch',
      env: { LEGACY_BACKFILL: 'true', PUBLISH_LEGACY_IMAGE: 'true', FROM_DEFAULT_BRANCH: 'false' },
      ok: false,
    },
    {
      name: 'historical publication from the default branch',
      env: { LEGACY_BACKFILL: 'true', PUBLISH_LEGACY_IMAGE: 'true' },
      ok: true,
    },
    {
      name: 'historical publication without backfill',
      env: { PUBLISH_LEGACY_IMAGE: 'true' },
      ok: false,
    },
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
        PUBLISH_LEGACY_IMAGE: 'false',
        FROM_DEFAULT_BRANCH: 'true',
        RELEASE_TAG: '0.120.0',
        PYTHON_VERSION: '',
        EXCLUDE_LEGACY_FRONTEND_TESTS: 'false',
        ...env,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status === 0, result.stdout + result.stderr).toBe(ok);
  });

  it('keeps registry writes behind the current final-image checks', () => {
    const jobs = workflow.jobs;
    const publish = jobs['build-docker-and-push-digests'];
    expect(workflow.on.workflow_dispatch.inputs.publish_legacy_image.default).toBe(false);
    expect(publish.if).toBe(
      "github.event_name != 'pull_request' && (!inputs.legacy_backfill || inputs.publish_legacy_image)",
    );
    expect(workflow.concurrency.group).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.legacy_backfill && !inputs.publish_legacy_image && format('docker-validate-{0}', github.run_id)",
    );
    expect(publish.needs).toEqual(['test']);
    expect(jobs.test.outputs.source_sha).toBe('${{ steps.source.outputs.sha }}');
    expect(publish.env.SOURCE_REF).toBe('${{ needs.test.outputs.source_sha }}');
    expect(
      publish.steps.find((item: { name: string }) => item.name === 'Checkout repository').with.ref,
    ).toBe('${{ env.SOURCE_REF }}');
    const step = (name: string) =>
      jobs.test.steps.find((item: { name: string }) => item.name === name);
    expect(workflow.env.RUN_CURRENT_IMAGE_CHECKS).toBe(
      "${{ (github.event_name != 'workflow_dispatch' || !inputs.legacy_backfill || inputs.publish_legacy_image) && 'true' || 'false' }}",
    );
    for (const name of [
      'Build custom Docker image for contract testing',
      'Test final-image runtime dependencies',
    ]) {
      expect(step(name).if).toBe("env.RUN_CURRENT_IMAGE_CHECKS == 'true'");
    }
    for (const name of ['Run Docker containers for testing', 'Run health check']) {
      expect(step(name).run).toContain(`if [[ "$RUN_CURRENT_IMAGE_CHECKS" == 'true' ]]; then`);
    }
    expect(step('Verify OS packages are current').if).toBeUndefined();
  });

  it.each([
    { fullChecks: 'false', expected: 0 },
    { fullChecks: 'true', expected: 1 },
  ])(
    'requires current update markers for historical publication ($fullChecks)',
    ({ fullChecks, expected }) => {
      const step = workflow.jobs.test.steps.find(
        (candidate: { name: string }) => candidate.name === 'Verify Python and promptfoo',
      );
      // A release-era CLI works, but this fixture image lacks the current Docker marker.
      const bash = `docker() {
      case "$*" in
        "exec promptfoo-container python --version") echo "Python 3" ;;
        "exec promptfoo-container promptfoo --version"|"exec promptfoo-container pf --version") echo "0.120.0" ;;
        *) return 1 ;;
      esac
    }
    ${step.run}`;
      const result = spawnSync('bash', ['-e', '-c', bash], {
        encoding: 'utf8',
        env: {
          LEGACY_BACKFILL: 'true',
          RUN_CURRENT_IMAGE_CHECKS: fullChecks,
          RELEASE_TAG: '0.120.0',
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(expected);
    },
  );

  it.each(['404', '200', '401', '500'])(
    'rechecks registry status %s before creating a manifest',
    (status) => {
      const dir = fs.mkdtempSync(path.join(tmpRoot, 'manifest-'));
      const marker = path.join(dir, 'published');
      fs.writeFileSync(path.join(dir, '1'.repeat(64)), '');
      const steps = workflow.jobs['merge-docker-digests'].steps;
      const create = steps.findIndex(
        (candidate: { name: string }) => candidate.name === 'Create manifest list and push',
      );
      expect(steps[create - 1]).toMatchObject({
        name: 'Ensure the legacy tag is not already published',
        if: "env.LEGACY_BACKFILL == 'true' && inputs.publish_legacy_image",
      });
      const script = [steps[create - 1].run, steps[create].run]
        .join('\n')
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
