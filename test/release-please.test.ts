import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const RELEASE_PLEASE_ACTION_V5_SHA = '45996ed1f6d02564a971a2fa1b5860e934307cf7';

type ReleasePleaseConfig = {
  'commit-batch-size'?: unknown;
  'last-release-sha'?: unknown;
};

type WorkflowStep = {
  uses?: unknown;
};

type GithubWorkflow = {
  jobs?: {
    'release-please'?: {
      steps?: WorkflowStep[];
    };
  };
};

function readRootFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('release-please automation', () => {
  it('keeps the release history scan bounded', () => {
    const config = JSON.parse(readRootFile('release-please-config.json')) as ReleasePleaseConfig;

    expect(config['commit-batch-size']).toBe(1);
    expect(config['last-release-sha']).toMatch(/^[0-9a-f]{40}$/);
  });

  it('uses release-please action v5 for history scan controls', () => {
    const workflow = yaml.load(
      readRootFile('.github/workflows/release-please.yml'),
    ) as GithubWorkflow;
    const releaseStep = workflow.jobs?.['release-please']?.steps?.find(
      (step) =>
        typeof step.uses === 'string' && step.uses.startsWith('googleapis/release-please-action@'),
    );

    expect(releaseStep?.uses).toBe(
      `googleapis/release-please-action@${RELEASE_PLEASE_ACTION_V5_SHA}`,
    );
  });
});
