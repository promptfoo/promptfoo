import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMMIT_BATCH_SIZE = 25;
const MAX_RELEASE_HISTORY_SEARCH_COMMITS = 500;
const MIN_RELEASE_HISTORY_HEADROOM = 100;
const RELEASE_PLEASE_ACTION = 'googleapis/release-please-action';

type ReleasePleaseConfig = {
  'commit-batch-size'?: unknown;
  'commit-search-depth'?: unknown;
  'last-release-sha'?: unknown;
};

type WorkflowStep = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};
type ReleasePleaseWorkflow = {
  jobs?: Record<
    string,
    {
      steps?: WorkflowStep[];
      permissions?: Record<string, string>;
      needs?: string | string[];
      if?: string;
    }
  >;
};
type ReleaseDriftWorkflow = {
  jobs?: {
    'check-drift'?: { steps?: { name?: unknown; env?: Record<string, unknown> }[] };
  };
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

  it('batches release history requests without exceeding the supported batch size', () => {
    const batchSize = readReleasePleaseConfig()['commit-batch-size'];
    assert(typeof batchSize === 'number', 'commit-batch-size must be a number');
    expect(batchSize).toBe(MAX_COMMIT_BATCH_SIZE);
  });

  it('pins the release history search depth', () => {
    const searchDepth = readReleasePleaseConfig()['commit-search-depth'];
    assert(typeof searchDepth === 'number', 'commit-search-depth must be a number');
    expect(searchDepth).toBe(MAX_RELEASE_HISTORY_SEARCH_COMMITS);
  });

  it('keeps the drift guard below the release history search limit', () => {
    const searchDepth = readReleasePleaseConfig()['commit-search-depth'];
    assert(typeof searchDepth === 'number', 'commit-search-depth must be a number');
    const workflow = yaml.load(
      readRepoFile('.github/workflows/release-please-sha-drift.yml'),
    ) as ReleaseDriftWorkflow;
    const driftStep = workflow.jobs?.['check-drift']?.steps?.find(
      (step) => step.name === 'Check last-release-sha drift',
    );
    assert(driftStep, 'release drift workflow must include the drift-check step');

    expect(Number(driftStep.env?.MAX_DRIFT)).toBe(searchDepth - MIN_RELEASE_HISTORY_HEADROOM);
  });

  it('pins the release-please job action to an immutable commit that Renovate can track', () => {
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
    const usesLine = workflowYaml
      .split('\n')
      .find((line) => line.includes(`uses: ${releaseStep.uses}`));
    expect(usesLine).toMatch(/#\s+v\d+(?:\.\d+){0,2}(?:[-+][\w.-]+)?\s*$/);
  });
});

describe('npm artifact publication', () => {
  const workflow = yaml.load(
    readRepoFile('.github/workflows/release-please.yml'),
  ) as ReleasePleaseWorkflow;

  it.each([
    ['build', 'publish-npm'],
    ['build-npm-backfill', 'publish-npm-backfill'],
  ])('keeps %s separate from publish credentials', (buildName, publishName) => {
    const build = workflow.jobs?.[buildName];
    const publish = workflow.jobs?.[publishName];
    expect(build?.permissions?.['id-token']).toBeUndefined();
    const checkout = build?.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    expect(publish?.permissions?.['id-token']).toBe('write');
    expect([publish?.needs].flat()).toContain(buildName);
    expect(publish?.if).toContain(`needs.${buildName}.result == 'success'`);
    expect(publish?.steps?.some((step) => step.uses?.startsWith('actions/checkout@'))).toBe(false);
    expect(publish?.steps?.some((step) => /npm (?:ci|install)/.test(step.run ?? ''))).toBe(false);
    const command = publish?.steps?.find((step) => step.run?.includes('npm publish'));
    expect(command?.env?.NODE_AUTH_TOKEN).toBe('');
    expect(command?.run).toContain('npm publish "${tarballs[0]}" --ignore-scripts');
  });

  it('uses the installed command for backfills with older package layouts', () => {
    const step = workflow.jobs?.['build-npm-backfill']?.steps?.find(
      (candidate) => candidate.name === 'Test package artifact',
    );
    expect(step?.run).toContain('node "$consumer_dir/node_modules/.bin/promptfoo" --version');
    expect(step?.run).not.toContain('/dist/src/entrypoint.js');
  });

  it.each(['build', 'build-npm-backfill'])(
    'snapshots %s artifacts before running installed code',
    (buildName) => {
      const steps = workflow.jobs?.[buildName]?.steps ?? [];
      const testIndex = steps.findIndex((step) => step.name === 'Test package artifact');
      const uploadIndex = steps.findIndex((step) =>
        step.uses?.startsWith('actions/upload-artifact@'),
      );
      expect(testIndex).toBeGreaterThan(-1);
      expect(uploadIndex).toBeGreaterThan(-1);
      expect(uploadIndex).toBeLessThan(testIndex);
      expect(steps[testIndex].env?.PACKAGE_TARBALL).toBe(
        '${{ steps.package-artifact.outputs.tarball }}',
      );
      expect(steps[uploadIndex].with?.path).toBe('${{ steps.package-artifact.outputs.tarball }}');
    },
  );
});
