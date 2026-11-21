import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const bash =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git/bin/bash.exe')
    : 'bash';
const workflow = yaml.load(
  fs.readFileSync(path.join(root, '.github/workflows/docker.yml'), 'utf8'),
) as {
  jobs: Record<string, { steps: Array<{ id?: string; run?: string }> }>;
};
const sha = 'abcdef0123456789abcdef0123456789abcdef01';
const shaTag = 'sha-abcdef0';
const amd64 = `sha256:${'a'.repeat(64)}`;
const arm64 = `sha256:${'b'.repeat(64)}`;
const index = `sha256:${'c'.repeat(64)}`;
let temp: string;

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-publish-')).replaceAll('\\', '/');
  fs.writeFileSync(`${temp}/output`, '');
  fs.writeFileSync(`${temp}/package.json`, JSON.stringify({ license: 'MIT' }));
});
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

function runStep(job: string, id: string, env: Record<string, string>, prelude = '') {
  const script = workflow.jobs[job].steps.find((step) => step.id === id)?.run;
  assert(script, `Missing ${job} workflow step ${id}`);
  return spawnSync(bash, ['-e', '-o', 'pipefail'], {
    cwd: temp,
    env: { ...process.env, GITHUB_OUTPUT: `${temp}/output`, RUNNER_TEMP: temp, ...env },
    input: prelude + '\n' + script,
    encoding: 'utf8',
  });
}

describe('Docker publication tags', () => {
  it.each([
    ['main push', 'heads/main', '', false, ['main', shaTag, 'latest']],
    ['release-please', 'heads/main', '1.2.3', false, ['main', shaTag, 'latest', '1.2.3']],
    ['manual branch', 'heads/fix/new-image', '', false, ['fix-new-image', shaTag]],
    ['stable tag', 'tags/v1.2.3', '', false, ['1.2.3', '1.2', 'latest', shaTag]],
    ['prerelease tag', 'tags/v1.2.3-rc.1', '', false, ['1.2.3-rc.1', shaTag]],
    ['build metadata', 'tags/v1.2.3+build.9', '', false, ['1.2.3', '1.2', 'latest', shaTag]],
    ['invalid prerelease', 'tags/v1.2.3-01', '', false, [shaTag]],
    ['other tag', 'tags/snapshot', '', false, [shaTag]],
    ['manual backfill', 'heads/main', '1.2.3', true, ['1.2.3']],
    ['published release', 'tags/1.2.3', '1.2.3', true, ['1.2.3']],
    ['published prerelease', 'tags/1.2.3-rc.1', '1.2.3-rc.1', true, ['1.2.3-rc.1']],
  ] as const)('selects tags for %s', (_name, ref, release, fallback, tags) => {
    const refName = ref.slice(ref.indexOf('/') + 1);
    const result = runStep('test', 'image', {
      GITHUB_REF: `refs/${ref}`,
      GITHUB_REF_NAME: refName,
      GITHUB_SHA: sha,
      RELEASE_TAG: release,
      IS_RELEASE_FALLBACK: String(fallback),
    });
    expect(result.status, result.stderr).toBe(0);
    const output = fs.readFileSync(`${temp}/output`, 'utf8');
    expect(
      output
        .match(/^tags=(.*)$/m)?.[1]
        .split(' ')
        .sort(),
    ).toEqual([...tags].sort());
    expect(output.match(/^version=(.*)$/m)?.[1]).toBe(refName.replace(/[^a-zA-Z0-9._-]+/g, '-'));
  });
});

function publish(env: Record<string, string> = {}) {
  // The real publish step supplies every tag and source in one Buildx invocation.
  return runStep(
    'merge-docker-digests',
    'publish',
    {
      REGISTRY: 'ghcr.io',
      IMAGE_NAME: 'Example/Project',
      IMAGE_TAGS: `main ${shaTag} latest`,
      AMD64_DIGEST: amd64,
      ARM64_DIGEST: arm64,
      FIXTURE_METADATA: JSON.stringify({ 'containerimage.descriptor': { digest: index } }),
      ...env,
    },
    `
docker() {
  printf '%s\\n' "$@" >> "$RUNNER_TEMP/docker-args"
  while (( $# >= 2 )); do
    if [[ $1 == --metadata-file ]]; then
      printf '%s' "$FIXTURE_METADATA" > "$2"
      return 0
    fi
    shift
  done
  return 1
}`,
  );
}

describe('Docker manifest publication', () => {
  it('tags both platform digests together and returns the published digest for attestation', () => {
    const result = publish();
    expect(result.status, result.stderr).toBe(0);
    const args = fs.readFileSync(`${temp}/docker-args`, 'utf8').trim().split(/\r?\n/);
    expect(args.slice(0, 3)).toEqual(['buildx', 'imagetools', 'create']);
    const tags = args.flatMap((arg, i) => (arg === '-t' || arg === '--tag' ? [args[i + 1]] : []));
    expect(tags.sort()).toEqual(
      ['latest', 'main', shaTag].map((tag) => `ghcr.io/example/project:${tag}`),
    );
    expect(args.filter((arg) => arg.includes('@sha256:')).sort()).toEqual(
      [amd64, arm64].map((digest) => `ghcr.io/example/project@${digest}`),
    );
    expect(fs.readFileSync(`${temp}/output`, 'utf8').trim()).toBe(`digest=${index}`);
  });

  it.each([
    ['AMD64_DIGEST', ''],
    ['ARM64_DIGEST', 'sha256:invalid'],
    ['ARM64_DIGEST', amd64],
    ['IMAGE_TAGS', ''],
  ])('rejects invalid publish input in %s', (field, digest) => {
    expect(publish({ [field]: digest }).status).not.toBe(0);
    expect(fs.existsSync(`${temp}/docker-args`)).toBe(false);
  });

  it.each([{}, { 'containerimage.descriptor': { digest: 'sha256:invalid' } }])(
    'rejects incomplete Buildx result metadata',
    (metadata) => {
      expect(publish({ FIXTURE_METADATA: JSON.stringify(metadata) }).status).not.toBe(0);
      expect(fs.existsSync(`${temp}/docker-args`)).toBe(true);
      expect(fs.readFileSync(`${temp}/output`, 'utf8')).toBe('');
    },
  );
});
