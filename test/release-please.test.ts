import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMMIT_BATCH_SIZE = 25;
const MIN_RELEASE_PLEASE_MAJOR = 5;
const RELEASE_PLEASE_ACTION = 'googleapis/release-please-action';

type ReleasePleaseConfig = {
  'commit-batch-size'?: unknown;
  'last-release-sha'?: unknown;
};

type WorkflowStep = { uses?: unknown };
type ReleasePleaseWorkflow = {
  jobs?: { 'release-please'?: { steps?: WorkflowStep[] } };
};

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readReleasePleaseConfig(): ReleasePleaseConfig {
  return JSON.parse(readRepoFile('release-please-config.json')) as ReleasePleaseConfig;
}

function isShallowClone(): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return result.stdout.trim() === 'true';
}

// Regression coverage for ccf46b849 ("ci(release): harden release-please history scan").
// Without these bounds, release-please re-scans the full git history on every run and
// either times out or emits a giant changelog when something perturbs the prior tag.
describe('release-please automation', () => {
  it('pins last-release-sha to a 40-char commit SHA', () => {
    const sha = readReleasePleaseConfig()['last-release-sha'];
    assert(typeof sha === 'string', 'last-release-sha must be a string');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    // CI uses fetch-depth: 2, so the pinned SHA isn't reachable there. Only enforce
    // reachability in full local clones, which catches typos before they ship.
    if (!isShallowClone()) {
      const result = spawnSync('git', ['cat-file', '-e', sha], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      });
      expect(result.status).toBe(0);
    }
  });

  it('caps commit-batch-size to a small value', () => {
    const batchSize = readReleasePleaseConfig()['commit-batch-size'];
    assert(typeof batchSize === 'number', 'commit-batch-size must be a number');
    expect(batchSize).toBeGreaterThanOrEqual(1);
    expect(batchSize).toBeLessThanOrEqual(MAX_COMMIT_BATCH_SIZE);
  });

  it('pins the release-please job action to a SHA on the v5+ family', () => {
    const workflowYaml = readRepoFile('.github/workflows/release-please.yml');
    const workflow = yaml.load(workflowYaml) as ReleasePleaseWorkflow;

    // Scope to the actual step in the release-please job so the assertion can't
    // be satisfied by a stray match elsewhere (other job, commented-out line).
    const releaseStep = workflow.jobs?.['release-please']?.steps?.find(
      (step) => typeof step.uses === 'string' && step.uses.startsWith(`${RELEASE_PLEASE_ACTION}@`),
    );
    assert(
      releaseStep && typeof releaseStep.uses === 'string',
      `release-please job must include a ${RELEASE_PLEASE_ACTION} step`,
    );

    expect(releaseStep.uses).toMatch(new RegExp(`^${RELEASE_PLEASE_ACTION}@[0-9a-f]{40}$`));

    // Major comes from the `# vN.x.x` comment Renovate maintains alongside the
    // SHA pin — SHAs alone are opaque, so the comment is the only stable signal.
    const usesLine = workflowYaml
      .split('\n')
      .find((line) => line.includes(`uses: ${releaseStep.uses}`));
    assert(usesLine, 'release-please-action `uses:` line missing in raw YAML');
    const versionMatch = usesLine.match(/#\s*v(\d+)/);
    assert(
      versionMatch !== null,
      'release-please-action `uses:` must carry a `# vN` version comment',
    );
    expect(Number.parseInt(versionMatch[1], 10)).toBeGreaterThanOrEqual(MIN_RELEASE_PLEASE_MAJOR);
  });
});
