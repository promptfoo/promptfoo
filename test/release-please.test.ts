import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMMIT_BATCH_SIZE = 25;
const MIN_RELEASE_PLEASE_MAJOR = 5;
const RELEASE_PLEASE_ACTION = 'googleapis/release-please-action';

type ReleasePleaseConfig = {
  'commit-batch-size'?: unknown;
  'last-release-sha'?: unknown;
};

type WorkflowStep = {
  name?: unknown;
  uses?: unknown;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};
type WorkflowJob = {
  if?: unknown;
  needs?: unknown;
  permissions?: Record<string, unknown>;
  steps?: WorkflowStep[];
};
type ReleasePleaseWorkflow = {
  jobs?: Record<string, WorkflowJob>;
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

  it('gates code-scan mirror publication on an isolated attestation of the complete payload', () => {
    const workflow = yaml.load(
      readRepoFile('.github/workflows/release-please.yml'),
    ) as ReleasePleaseWorkflow;
    const buildJob = workflow.jobs?.['build-code-scan-action-release'];
    const attestJob = workflow.jobs?.['attest-code-scan-action'];
    const publishJob = workflow.jobs?.['publish-code-scan-action'];

    assert(buildJob, 'code-scan release build job is required');
    assert(attestJob, 'code-scan release attestation job is required');
    assert(publishJob, 'code-scan release publication job is required');

    expect(buildJob.permissions).toEqual({ contents: 'read' });
    expect(JSON.stringify(buildJob)).not.toMatch(/(?:GH_TOKEN|GITHUB_TOKEN|NODE_AUTH_TOKEN)/);
    expect(
      buildJob.steps?.some((step) => String(step.uses).includes('create-github-app-token')),
    ).toBe(false);

    const uploadStep = buildJob.steps?.find(
      (step) => step.name === 'Upload release payload for attestation',
    );
    assert(uploadStep?.with, 'build job must upload the code-scan release payload');
    expect(uploadStep.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(uploadStep.with.name).toBe('code-scan-action-release-payload');
    expect(uploadStep.with['if-no-files-found']).toBe('error');
    expect(uploadStep.with['include-hidden-files']).toBe(true);
    expect(
      String(uploadStep.with.path)
        .trim()
        .split('\n')
        .map((entry) => entry.trim()),
    ).toEqual([
      '${{ runner.temp }}/code-scan-action-export/dist',
      '${{ runner.temp }}/code-scan-action-export/action.yml',
      '${{ runner.temp }}/code-scan-action-export/README.md',
      '${{ runner.temp }}/code-scan-action-export/CHANGELOG.md',
      '${{ runner.temp }}/code-scan-action-export/.release-source.json',
    ]);

    expect(attestJob.needs).toEqual(['build-code-scan-action-release']);
    expect(attestJob.if).toBe(
      "${{ always() && !cancelled() && needs.build-code-scan-action-release.result == 'success' }}",
    );
    expect(attestJob.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      attestations: 'write',
    });
    const attestDownload = attestJob.steps?.find(
      (step) => step.name === 'Download release payload',
    );
    const attestStep = attestJob.steps?.find(
      (step) => step.name === 'Attest build provenance for mirrored artifacts',
    );
    expect(attestDownload?.uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}$/);
    expect(attestDownload?.with?.name).toBe('code-scan-action-release-payload');
    expect(attestStep?.uses).toMatch(/^actions\/attest-build-provenance@[0-9a-f]{40}$/);
    expect(
      String(attestStep?.with?.['subject-path'])
        .trim()
        .split('\n')
        .map((entry) => entry.trim()),
    ).toEqual([
      '${{ runner.temp }}/code-scan-action-attest/dist/*',
      '${{ runner.temp }}/code-scan-action-attest/action.yml',
    ]);

    expect(publishJob.needs).toEqual(['release-please', 'attest-code-scan-action']);
    expect(publishJob.if).toBe(
      "${{ always() && !cancelled() && needs.attest-code-scan-action.result == 'success' }}",
    );
    expect(publishJob.permissions).toEqual({ contents: 'read' });
    const publishDownloadIndex = publishJob.steps?.findIndex(
      (step) => step.name === 'Download attested release payload',
    );
    const tokenStepIndex = publishJob.steps?.findIndex(
      (step) => step.name === 'Create app token for code-scan-action mirror',
    );
    assert(publishDownloadIndex !== undefined && publishDownloadIndex >= 0);
    assert(tokenStepIndex !== undefined && tokenStepIndex > publishDownloadIndex);
    expect(publishJob.steps?.[publishDownloadIndex]?.uses).toMatch(
      /^actions\/download-artifact@[0-9a-f]{40}$/,
    );
    expect(publishJob.steps?.[publishDownloadIndex]?.with?.name).toBe(
      'code-scan-action-release-payload',
    );
  });
});
