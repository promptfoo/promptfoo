import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const rootDir = path.join(__dirname, '../..');
const exampleDir = path.join(rootDir, 'examples/integration-gitlab-ci');
const source = fs.readFileSync(path.join(exampleDir, 'gitlab-ci.yml'), 'utf8');
const template = parse(source);
const job = template['.promptfoo-eval'];
const describeUnix = process.platform === 'win32' ? describe.skip : describe;

describeUnix('GitLab CI integration example', () => {
  let tempDir: string;
  let binDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-gitlab-ci-'));
    binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(tempDir, 'cli.mjs'),
      `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.writeFileSync('arguments.json', JSON.stringify(args));
if (process.env.TEST_RESULT !== 'missing') {
  fs.writeFileSync(args[args.indexOf('--output') + 1], process.env.TEST_RESULT);
}
process.exitCode = Number(process.env.TEST_EXIT_CODE ?? 0);
`,
    );
    fs.writeFileSync(
      path.join(binDir, 'promptfoo'),
      `#!/bin/sh\nexec '${process.execPath}' '${path.join(tempDir, 'cli.mjs')}' "$@"\n`,
      { mode: 0o755 },
    );
  });

  afterEach(() => fs.rmSync(tempDir, { force: true, recursive: true }));

  function run(overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn('/bin/sh', ['-ec', job.script.join('\n')], {
          cwd: tempDir,
          env: {
            ...process.env,
            ...job.variables,
            PATH: `${binDir}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
            TEST_RESULT: JSON.stringify({
              results: { stats: { successes: 1, failures: 0, errors: 0 } },
            }),
            ...overrides,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, stdout, stderr }));
      },
    );
  }

  it('uses a pinned CLI image with environment templates enabled', () => {
    expect(job.image.name).toMatch(
      /^ghcr\.io\/promptfoo\/promptfoo:0\.123\.0@sha256:[a-f0-9]{64}$/,
    );
    expect(job.image.entrypoint).toEqual(['']);
    expect(job.variables.PROMPTFOO_SELF_HOSTED).toBe('false');
    expect(job.allow_failure).toBe(false);
    expect(job.cache.key).toContain('$CI_COMMIT_SHA');
    expect(job.artifacts).toMatchObject({
      when: 'always',
      access: 'developer',
      expire_in: '1 week',
      reports: { junit: '$PROMPTFOO_OUTPUT_DIR/results.junit.xml' },
    });
  });

  it('keeps documented remote template integrity values current', () => {
    const integrity = `sha256-${createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('base64')}`;
    for (const file of [
      path.join(exampleDir, 'README.md'),
      path.join(rootDir, 'site/docs/integrations/gitlab-ci.md'),
      path.join(rootDir, 'site/docs/integrations/ci-cd.md'),
    ]) {
      const documentation = fs.readFileSync(file, 'utf8');
      expect(documentation).toContain(`integrity: '${integrity}'`);
      expect(documentation).toMatch(
        /https:\/\/raw\.githubusercontent\.com\/promptfoo\/promptfoo\/[a-f0-9]{40}\/examples\/integration-gitlab-ci\/gitlab-ci\.yml/,
      );
    }
  });

  it('runs when the bundled template changes', () => {
    const pipeline = parse(fs.readFileSync(path.join(exampleDir, '.gitlab-ci.yml'), 'utf8'));
    expect(pipeline['promptfoo-eval'].rules[0].changes).toContain('gitlab-ci.yml');
  });

  it.each(['false', 'true'])('passes explicit sharing=%s to the CLI', async (share) => {
    const result = await run({ PROMPTFOO_SHARE: share });
    expect(result.status).toBe(0);
    const args = JSON.parse(fs.readFileSync(path.join(tempDir, 'arguments.json'), 'utf8'));
    expect(args).toContain(share === 'true' ? '--share' : '--no-share');
    expect(args.filter((arg: string) => arg === '--output')).toHaveLength(2);
  });

  it('bypasses cached responses in scheduled pipelines', async () => {
    expect((await run({ CI_PIPELINE_SOURCE: 'schedule' })).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(tempDir, 'arguments.json'), 'utf8'))).toContain(
      '--no-cache',
    );
  });

  it.each(['yes', '1'])('rejects invalid sharing setting %j', async (share) => {
    const result = await run({ PROMPTFOO_SHARE: share });
    expect(result.status).toBe(1);
  });

  it.each(['-1', '101', 'NaN', 'Infinity', '', '1e2'])(
    'rejects invalid threshold %j before the CLI runs',
    async (threshold) => {
      expect((await run({ PROMPTFOO_PASS_RATE_THRESHOLD: threshold })).status).not.toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'arguments.json'))).toBe(false);
    },
  );

  it.each([
    { stats: { successes: 1, failures: 1, errors: 0 }, threshold: '100', expected: 1 },
    { stats: { successes: 1, failures: 1, errors: 0 }, threshold: '50', expected: 0 },
    { stats: { successes: 1, failures: 0, errors: 1 }, threshold: '100', expected: 1 },
  ])(
    'checks exported results independently at threshold $threshold',
    async ({ stats, threshold, expected }) => {
      const result = await run({
        TEST_RESULT: JSON.stringify({ results: { stats } }),
        PROMPTFOO_PASS_RATE_THRESHOLD: threshold,
      });
      expect(result.status).toBe(expected);
    },
  );

  it.each([
    'missing',
    'null',
    '{',
    JSON.stringify({ results: { stats: { successes: 0, failures: 0, errors: 0 } } }),
    JSON.stringify({ results: { stats: { successes: '1', failures: 0, errors: 0 } } }),
  ])('rejects missing or invalid results %s', async (result) => {
    expect((await run({ TEST_RESULT: result })).status).not.toBe(0);
  });

  it('preserves a nonzero CLI exit status', async () => {
    expect((await run({ TEST_EXIT_CODE: '7' })).status).toBe(7);
  });

  it('supports an explicit output directory', async () => {
    expect((await run({ PROMPTFOO_OUTPUT_DIR: 'custom-results' })).status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'custom-results/results.json'))).toBe(true);
  });

  it('requires a fresh artifact directory', async () => {
    const outputDir = path.join(tempDir, '.promptfoo-results');
    fs.mkdirSync(outputDir);
    fs.writeFileSync(path.join(outputDir, 'previous.json'), '{}');
    fs.writeFileSync(path.join(outputDir, 'results.json'), '{"previous":true}');
    fs.writeFileSync(path.join(outputDir, 'results.junit.xml'), '<testsuites />');
    expect((await run()).status).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'arguments.json'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'results.json'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'results.junit.xml'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'previous.json'))).toBe(true);
  });
});
