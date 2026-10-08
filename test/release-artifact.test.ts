import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  name?: string;
  strategy?: { matrix: { node: string[] } };
  needs?: string | string[];
  if?: string;
  permissions: Record<string, string>;
  outputs?: Record<string, string>;
  steps: Step[];
};
const workflow = yaml.load(
  fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release-please.yml'), 'utf8'),
) as {
  concurrency: { 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};
const directories: string[] = [];
// npm and npx expose sibling entrypoints; other runners can still use npm from PATH.
const npmCli = process.env.npm_execpath
  ? path.join(path.dirname(process.env.npm_execpath), 'npm-cli.js')
  : undefined;
const directNpm = npmCli && fs.existsSync(npmCli);
const bash =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git/bin/bash.exe')
    : 'bash';
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('exact artifact release', () => {
  it.each(['build', 'package-build'])('runs smoke examples after %s', (jobName) => {
    const ci = yaml.load(
      fs.readFileSync(path.resolve(__dirname, '../.github/workflows/main.yml'), 'utf8'),
    ) as { jobs: Record<string, Job> };
    const smokeCommand = 'npm run test:smoke -- test/smoke/agent-skill-examples.test.ts';
    const buildSteps = ci.jobs[jobName].steps;
    const buildIndex = buildSteps.findIndex((step) => step.run === 'npm run build');
    const smokeIndex = buildSteps.findIndex((step) => step.run === smokeCommand);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(smokeIndex).toBeGreaterThan(buildIndex);
    expect(ci.jobs['artifact-consumer'].steps.some((step) => step.run === smokeCommand)).toBe(
      false,
    );
  });

  it.each(['success', 'failure', 'cancelled', 'skipped', ''])(
    'requires a successful package producer when its result is %j',
    (result) => {
      const ci = yaml.load(
        fs.readFileSync(path.resolve(__dirname, '../.github/workflows/main.yml'), 'utf8'),
      ) as { jobs: Record<string, Job> };
      const producer = ci.jobs['package-build'];
      const acceptance = ci.jobs['package-acceptance'];
      expect(producer.name).toBe('Prepare package on Node ${{ matrix.node }}');
      expect(acceptance.name).toBe('Build on Node ${{ matrix.node }}');
      for (const job of [producer, acceptance]) {
        expect(job.strategy?.matrix.node).toEqual(['24.x']);
      }
      expect(acceptance.name?.replace('${{ matrix.node }}', '24.x')).toBe('Build on Node 24.x');
      const upload = producer.steps.find((step) =>
        step.uses?.startsWith('actions/upload-artifact@'),
      )!;
      expect(upload.with?.['if-no-files-found']).toBe('error');

      for (const consumer of [acceptance, ci.jobs['artifact-consumer']]) {
        expect(consumer.needs).toBe('package-build');
        // A skipped required job is accepted by branch protection. Run the guard
        // after producer failures/skips, while letting workflow cancellation stop it.
        expect(consumer.if).toBe('${{ !cancelled() }}');
        expect(consumer.permissions).toEqual({ contents: 'read' });
        const guard = consumer.steps[0];
        expect(guard.env).toEqual({ PACKAGE_BUILD_RESULT: '${{ needs.package-build.result }}' });
        const checked = spawnSync(bash, ['-e', '-o', 'pipefail'], {
          input: guard.run,
          env: { ...process.env, PACKAGE_BUILD_RESULT: result },
          encoding: 'utf8',
        });
        expect(checked.status, checked.stderr).toBe(result === 'success' ? 0 : 1);
        const download = consumer.steps.find((step) =>
          step.uses?.startsWith('actions/download-artifact@'),
        )!;
        expect(download.with).toEqual({
          name: upload.with?.name,
          path: '${{ runner.temp }}/package-artifact',
        });
      }
      expect(ci.jobs['sbom-comparison'].needs).toContain('package-acceptance');
    },
  );

  it.each([0, 1, 2])('accepts exactly one downloaded archive when given %i', (count) => {
    const ci = yaml.load(
      fs.readFileSync(path.resolve(__dirname, '../.github/workflows/main.yml'), 'utf8'),
    ) as { jobs: Record<string, Job> };
    const locate = ci.jobs['package-acceptance'].steps.find(
      (step) => step.name === 'Locate downloaded package',
    )!;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-package-locate-'));
    directories.push(root);
    for (let index = 0; index < count; index++) {
      fs.writeFileSync(path.join(root, `package ${index}.tgz`), 'fixture archive');
    }
    const output = path.join(root, 'outputs');
    const checked = spawnSync(bash, ['-e', '-o', 'pipefail'], {
      input: locate.run,
      env: {
        ...process.env,
        ARTIFACT_DIRECTORY: root.replaceAll('\\', '/'),
        GITHUB_OUTPUT: output.replaceAll('\\', '/'),
      },
      encoding: 'utf8',
    });
    expect(checked.status, checked.stderr).toBe(count === 1 ? 0 : 1);
    if (count === 1) {
      expect(fs.readFileSync(output, 'utf8').trim()).toBe(
        `tarball=${root.replaceAll('\\', '/')}/package 0.tgz`,
      );
    } else {
      expect(fs.existsSync(output)).toBe(false);
    }
  });

  it('isolates validation from immutable uploads and the OIDC-only publisher', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    const publisher = workflow.jobs['publish-npm'];
    const validator = workflow.jobs['validate-npm'];
    expect(validator.permissions).toEqual({ contents: 'read' });
    expect(validator.outputs).toBeUndefined();
    expect(validator.steps.some((s) => s.uses?.startsWith('actions/upload-artifact@'))).toBe(false);
    expect(validator.steps.find((s) => s.uses?.startsWith('actions/checkout@'))?.with).toEqual({
      ref: "${{ inputs.tag_name && format('refs/tags/{0}', inputs.tag_name) || github.sha }}",
      'persist-credentials': false,
    });
    expect(
      validator.steps.find((s) => s.uses?.startsWith('actions/setup-node@'))?.with?.[
        'package-manager-cache'
      ],
    ).toBe(false);
    expect(
      validator.steps.find((s) => s.uses?.startsWith('actions/setup-node@'))?.with?.cache,
    ).toBeUndefined();
    expect(validator.steps.some((s) => s.uses?.startsWith('actions/cache'))).toBe(false);
    expect(publisher.needs).toContain('validate-npm');
    expect(publisher.if).toContain("needs.validate-npm.result == 'success'");
    for (const buildName of ['build-npm', 'build-npm-backfill']) {
      const build = workflow.jobs[buildName];
      expect(build.permissions['id-token']).toBeUndefined();
      expect(
        build.steps.find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.[
          'persist-credentials'
        ],
      ).toBe(false);
      const buildIndex = build.steps.findIndex((s) => s.run === 'npm run prepublishOnly');
      expect(build.steps.some((s) => s.run?.includes('test:package-artifact'))).toBe(false);
      const uploadIndex = build.steps.findIndex((s) =>
        s.uses?.startsWith('actions/upload-artifact@'),
      );
      expect(buildIndex).toBeGreaterThan(-1);
      expect(uploadIndex).toBeGreaterThan(buildIndex);
      expect(build.outputs).toEqual({
        'artifact-id': '${{ steps.upload.outputs.artifact-id }}',
        sha512: '${{ steps.package-artifact.outputs.sha512 }}',
      });
      for (const consumer of [validator, publisher]) {
        expect(consumer.if).toContain('always() && !cancelled()');
        expect(consumer.needs).toContain(buildName);
        expect(consumer.if).toContain(`needs.${buildName}.result == 'success'`);
        const download = consumer.steps.find((s) =>
          s.uses?.startsWith('actions/download-artifact@'),
        )!;
        expect(download.with?.name).toBeUndefined();
        expect(download.with?.['artifact-ids']).toBe(
          '${{ needs.build-npm.outputs.artifact-id || needs.build-npm-backfill.outputs.artifact-id }}',
        );
        expect(consumer.steps.find((s) => s.env?.EXPECTED_SHA512)?.env?.EXPECTED_SHA512).toBe(
          '${{ needs.build-npm.outputs.sha512 || needs.build-npm-backfill.outputs.sha512 }}',
        );
      }
      expect(build.steps[buildIndex].env?.PROMPTFOO_POSTHOG_KEY).toBeDefined();
      expect(publisher.permissions['id-token']).toBe('write');
      expect(publisher.steps.some((s) => s.uses?.startsWith('actions/checkout@'))).toBe(false);
      expect(publisher.steps.map((s) => s.run ?? '').join('\n')).not.toMatch(
        /npm (?:ci|install|run|rebuild)/,
      );
      const publish = publisher.steps.find((s) => s.name === 'Publish verified npm package')!;
      expect(publish.env?.NODE_AUTH_TOKEN).toBe('');
      expect(publish.run).toContain(
        'npm publish "${tarballs[0]}" --ignore-scripts --provenance --access public',
      );
    }
  });

  it.each(['', '1.2.3'])('runs the expected modern profiles for tag %j', (tag) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-profiles-'));
    directories.push(root);
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'scripts/testPackageArtifact.ts'), '// --tarball');
    const tarball = path.join(root, 'promptfoo.tgz');
    fs.writeFileSync(tarball, 'fixture archive');
    const validate = workflow.jobs['validate-npm'].steps.find(
      (step) => step.name === 'Validate npm package',
    )!.run!;
    const result = spawnSync(bash, ['-e', '-o', 'pipefail'], {
      input: 'npm() { printf "%s\\n" "$*"; }\n' + validate,
      cwd: root,
      env: {
        ...process.env,
        PACKAGE_DIR: root.replaceAll('\\', '/'),
        EXPECTED_SHA512: createHash('sha512').update(fs.readFileSync(tarball)).digest('hex'),
        TAG_NAME: tag,
      },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const calls = result.stdout.trim().split('\n');
    expect(calls).toHaveLength(tag ? 1 : 2);
    expect(calls[0]).toBe(
      `run test:package-artifact -- --tarball ${tarball.replaceAll('\\', '/')}`,
    );
    if (!tag) {
      expect(calls[1]).toBe(`${calls[0]} --profile omit-optional`);
    }
  });

  it('keeps npm artifact acceptance separate from the shared code-scan test gate', () => {
    expect(workflow.jobs.build.steps.some((step) => step.run === 'npm test')).toBe(true);
    expect(workflow.jobs.build.steps.some((step) => step.run?.includes('package-artifact'))).toBe(
      false,
    );
    const mirror = workflow.jobs['publish-code-scan-action'];
    expect(mirror.if).toContain("needs.build.result == 'success'");
    expect(mirror.if).not.toContain('needs.build-npm');
    expect(mirror.if).not.toContain('needs.publish-npm.result');
  });

  it.each([
    { npm: 'success', mirror: 'success', cancelled: false, runs: true },
    { npm: 'skipped', mirror: 'success', cancelled: false, runs: true },
    { npm: 'failure', mirror: 'success', cancelled: false, runs: true },
    { npm: 'success', mirror: 'failure', cancelled: false, runs: false },
    { npm: 'skipped', mirror: 'skipped', cancelled: false, runs: false },
    { npm: 'skipped', mirror: 'cancelled', cancelled: false, runs: false },
    { npm: 'success', mirror: 'success', cancelled: true, runs: false },
  ])('schedules action provenance for publication results %j', (scenario) => {
    const attestation = workflow.jobs['attest-code-scan-action'];
    const expression = (attestation.if ?? 'success()')
      .replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '')
      .replaceAll('needs.publish-code-scan-action.result', 'mirrorResult');
    // GitHub implicitly requires success across the dependency chain unless
    // the guard uses a status function. Evaluate this guard's JS-compatible
    // expression against the skipped npm ancestor of an action-only release.
    const hasStatusFunction = /\b(always|cancelled|success|failure)\s*\(/.test(expression);
    const scheduled = runInNewContext(
      hasStatusFunction ? expression : 'success() && (' + expression + ')',
      {
        always: () => true,
        cancelled: () => scenario.cancelled,
        success: () =>
          !scenario.cancelled && scenario.npm === 'success' && scenario.mirror === 'success',
        mirrorResult: scenario.mirror,
      },
    );
    expect(scheduled).toBe(scenario.runs);
  });

  it('detects current packers and legacy native SQLite from tag manifests', () => {
    const steps = workflow.jobs['build-npm-backfill'].steps;
    const pack = steps.find((step) => step.name === 'Pack npm package')!.run!;
    const validate = workflow.jobs['validate-npm'].steps.find(
      (step) => step.name === 'Validate npm package',
    )!.run!;
    const packProbe = pack.match(/if node -e "([^"]+)"/)?.[1];
    const nativeProbe = validate.match(/if node -e "([^"]+)"/)?.[1];
    expect(packProbe).toBeDefined();
    expect(nativeProbe).toBeDefined();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-capabilities-'));
    directories.push(root);
    const manifestPath = path.join(root, 'package.json');
    for (const [manifest, hasPacker, needsNativeBuild] of [
      [
        {
          scripts: { 'package:pack': 'tsx scripts/packPackageArtifact.ts' },
          dependencies: { '@libsql/client': '^0.17.0' },
        },
        true,
        false,
      ],
      [{ dependencies: { 'better-sqlite3': '^12.8.0' } }, false, true],
      [
        {
          dependencies: { '@libsql/client': '^0.17.0' },
          devDependencies: { 'better-sqlite3': '^12.8.0' },
        },
        false,
        false,
      ],
    ] as const) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(spawnSync(process.execPath, ['-e', packProbe!], { cwd: root }).status === 0).toBe(
        hasPacker,
      );
      expect(
        spawnSync(process.execPath, ['-e', nativeProbe!, manifestPath], { cwd: root }).status === 0,
      ).toBe(needsNativeBuild);
    }
    expect(pack).toContain('npm run --silent package:pack -- --destination');
    // Older releases only export per-test rows when their isolated database is written.
    expect(validate).not.toContain('--no-write');
    expect(validate).toContain('PROMPTFOO_CONFIG_DIR="$consumer_dir/config"');
  });

  it.each(['none', 'rebuild', 'result', 'version', 'blank-version'])(
    'runs legacy backfill acceptance with %s failure',
    (failure) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-acceptance-'));
      directories.push(root);
      const fixture = path.join(root, 'fixture', 'package');
      const native = path.join(root, 'native', 'package');
      const packageDir = path.join(root, 'artifact');
      const tarball = path.join(packageDir, 'promptfoo-0.0.0.tgz').replaceAll('\\', '/');
      const nativeTarball = path.join(root, 'better-sqlite3-0.0.0.tgz').replaceAll('\\', '/');
      fs.mkdirSync(fixture, { recursive: true });
      fs.mkdirSync(native, { recursive: true });
      fs.mkdirSync(packageDir);
      // Newer npm requires explicit approval even for these local test lifecycle scripts.
      fs.writeFileSync(
        path.join(root, 'fixtures.npmrc'),
        `allow-scripts=file:${tarball},file:${nativeTarball}\n`,
      );
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        JSON.stringify({
          name: 'promptfoo',
          version: '0.0.0',
          bin: { promptfoo: 'cli.cjs' },
          dependencies: { 'better-sqlite3': `file:${nativeTarball}` },
          scripts: { install: 'node -e "process.exit(99)"' },
        }),
      );
      fs.writeFileSync(
        path.join(native, 'package.json'),
        JSON.stringify({
          name: 'better-sqlite3',
          version: '0.0.0',
          main: 'binding.cjs',
          scripts: { install: 'node install.cjs' },
        }),
      );
      fs.writeFileSync(
        path.join(native, 'install.cjs'),
        `const fs = require('node:fs');
require('node:assert/strict').equal(fs.existsSync('binding.cjs'), false);
if (process.env.BACKFILL_FAILURE === 'rebuild') throw new Error('fixture native rebuild failed');
fs.writeFileSync('binding.cjs', 'module.exports = true;');
`,
      );
      fs.writeFileSync(
        path.join(fixture, 'cli.cjs'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.equal(require('better-sqlite3'), true);
fs.appendFileSync(process.env.BACKFILL_EVIDENCE, process.argv[2] + '\\n');
if (process.argv[2] === '--version') {
  console.log(process.env.BACKFILL_FAILURE === 'version' ? '9.9.9' :
    process.env.BACKFILL_FAILURE === 'blank-version' ? '' : '  0.0.0  ');
}
else {
  assert.equal(process.argv[2], 'eval');
  const config = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--config') + 1]));
  assert.deepEqual(config.providers, ['echo']);
  assert(process.argv.includes('--no-cache'));
  fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], JSON.stringify({
    results: { results: [{ success: true, score: process.env.BACKFILL_FAILURE === 'result' ? 0 : 1,
      response: { output: config.prompts[0] } }] }
  }));
}
`,
      );
      const validate = workflow.jobs['validate-npm'].steps.find(
        (step) => step.name === 'Validate npm package',
      )!.run!;
      const evidence = path.join(root, 'cli-calls');
      const result = spawnSync(bash, ['-e', '-o', 'pipefail'], {
        // Git Bash's npm launcher starts several helper processes to rediscover Node and npm.
        // Use this runner's entrypoints, while still running the real npm install and rebuild.
        // Relative archive paths avoid GNU tar treating Windows drive letters as remote hosts.
        input:
          (directNpm ? 'npm() { "$NODE_BINARY" "$NPM_CLI" "$@"; }\n' : '') +
          'tar -czf better-sqlite3-0.0.0.tgz -C native package\n' +
          'tar -czf artifact/promptfoo-0.0.0.tgz -C fixture package\n' +
          'cd fixture/package\n' +
          'export EXPECTED_SHA512="$(node -e \'console.log(require("node:crypto").createHash("sha512").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))\' "$PACKAGE_TARBALL")"\n' +
          validate,
        cwd: root,
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          NODE_BINARY: process.execPath.replaceAll('\\', '/'),
          NPM_CLI: npmCli?.replaceAll('\\', '/'),
          RUNNER_TEMP: root.replaceAll('\\', '/'),
          PACKAGE_TARBALL: tarball,
          PACKAGE_DIR: packageDir.replaceAll('\\', '/'),
          TAG_NAME: '0.0.0',
          BACKFILL_EVIDENCE: evidence,
          BACKFILL_FAILURE: failure,
          npm_config_offline: 'true',
          npm_config_userconfig: path.join(root, '.npmrc'),
          npm_config_globalconfig: path.join(root, 'fixtures.npmrc'),
          npm_config_cache: path.join(root, 'npm-cache'),
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.error, output).toBeUndefined();
      expect(result.status === 0, output).toBe(failure === 'none');
      expect(fs.existsSync(evidence)).toBe(failure !== 'rebuild');
      if (failure === 'rebuild') {
        expect(result.stderr).toContain('fixture native rebuild failed');
      } else if (failure.endsWith('version')) {
        expect(result.stderr).toContain('Installed CLI version does not match tag');
        expect(fs.readFileSync(evidence, 'utf8')).toBe('--version\n');
      } else {
        expect(fs.readFileSync(evidence, 'utf8')).toBe('--version\neval\n');
      }
      expect(
        fs.readdirSync(root).some((name) => name.startsWith('promptfoo-backfill-consumer.')),
      ).toBe(false);
    },
  );

  it('checks the builder checksum and manifest before publishing', () => {
    const run = workflow.jobs['publish-npm'].steps.find(
      (s) => s.name === 'Publish verified npm package',
    )!.run!;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-'));
    directories.push(root);
    fs.mkdirSync(path.join(root, 'package'));
    const manifestPath = path.join(root, 'package', 'package.json');
    const tarball = path.join(root, 'promptfoo.tgz');
    const evidence = path.join(root, 'published');
    const env = {
      ...process.env,
      RUNNER_TEMP: root.replaceAll('\\', '/'),
      // GNU tar treats Windows drive letters as remote archive paths.
      PACKAGE_DIR: '.',
      PUBLISH_EVIDENCE: evidence.replaceAll('\\', '/'),
      EXPECTED_VERSION: '1.2.3',
      REGISTRY_URL: 'https://registry.invalid/',
    };
    const pack = () => {
      const result = spawnSync(bash, ['-e', '-o', 'pipefail'], {
        input: 'tar -czf "$PACKAGE_DIR/promptfoo.tgz" package\n',
        cwd: root,
        env,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
    };
    for (const [manifest, failure] of [
      [{ name: 'promptfoo', version: '1.2.3' }, 'none'],
      [{ name: 'other', version: '1.2.3' }, 'metadata'],
      [{ name: 'promptfoo', version: '9.9.9' }, 'metadata'],
      [
        {
          name: 'promptfoo',
          version: '1.2.3',
          publishConfig: { registry: 'https://example.invalid' },
        },
        'metadata',
      ],
      [{ name: 'promptfoo', version: '1.2.3' }, 'tampered'],
      [{ name: 'promptfoo', version: '1.2.3' }, 'blank-checksum'],
      [{ name: 'promptfoo', version: '1.2.3' }, 'missing'],
      [{ name: 'promptfoo', version: '1.2.3' }, 'multiple'],
    ] as const) {
      fs.rmSync(evidence, { force: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      fs.writeFileSync(path.join(root, 'package', 'payload'), 'original');
      pack();
      const checksum = createHash('sha512').update(fs.readFileSync(tarball)).digest('hex');
      if (failure === 'tampered') {
        fs.writeFileSync(path.join(root, 'package', 'payload'), 'changed after validation');
        pack();
      } else if (failure === 'missing') {
        fs.rmSync(tarball);
      } else if (failure === 'multiple') {
        fs.copyFileSync(tarball, path.join(root, 'extra.tgz'));
      }
      const result = spawnSync(bash, ['-e', '-o', 'pipefail'], {
        input: 'npm() { printf "%s\\n" "$@" > "$PUBLISH_EVIDENCE"; }\n' + run,
        env: { ...env, EXPECTED_SHA512: failure === 'blank-checksum' ? '' : checksum },
        cwd: root,
        encoding: 'utf8',
      });
      expect(result.error).toBeUndefined();
      expect(result.status === 0, result.stderr).toBe(failure === 'none');
      expect(fs.existsSync(evidence)).toBe(failure === 'none');
      if (failure === 'metadata') {
        expect(result.stderr).toContain('Downloaded artifact has unexpected publish metadata');
      } else if (failure === 'missing' || failure === 'multiple') {
        expect(result.stdout).toContain('Expected exactly one verified npm tarball');
      } else if (failure === 'none') {
        expect(fs.readFileSync(evidence, 'utf8')).toContain('publish\n');
        expect(fs.readFileSync(evidence, 'utf8')).toContain('--ignore-scripts\n');
      } else {
        expect(result.stderr).toContain('Npm artifact checksum mismatch');
      }
    }
  });
});
