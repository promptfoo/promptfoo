import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = path.resolve(__dirname, '../..');

describe('contracts workspace configuration', () => {
  it('registers the same workspaces for npm and pnpm', () => {
    const npm = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pnpm = parse(fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));

    expect(npm.workspaces).toContain('packages/contracts');
    expect([...pnpm.packages].sort()).toEqual([...npm.workspaces].sort());
  });

  it('runs the isolated install without persisted credentials, secrets, or write permissions', () => {
    const workflow = parse(fs.readFileSync(path.join(root, '.github/workflows/main.yml'), 'utf8'));
    const jobs = Object.values(workflow.jobs) as Array<{
      permissions?: Record<string, string>;
      env?: Record<string, string>;
      steps: Array<{
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
        env?: Record<string, string>;
      }>;
    }>;
    const installJobs = jobs.filter((job) =>
      job.steps.some((step) => step.run?.includes('run test:contracts-workspace')),
    );
    expect(installJobs).toHaveLength(1);
    const job = installJobs[0];
    expect(job.permissions).toEqual({ contents: 'read' });
    const checkouts = job.steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with?.['persist-credentials']).toBe(false);
    const jobConfiguration = JSON.stringify([workflow.env, job]);
    expect(jobConfiguration).not.toMatch(/secrets\.|github\.token/);
    expect(jobConfiguration).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|NODE_AUTH_TOKEN/);
  });
});
