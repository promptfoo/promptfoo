import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  needs?: string | string[];
  if?: string;
  permissions: Record<string, string>;
  steps: Step[];
};
const workflow = yaml.load(
  fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release-please.yml'), 'utf8'),
) as {
  concurrency: { 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('exact artifact release', () => {
  it('builds and validates before an OIDC-only publisher, retaining release controls', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    for (const [buildName, publishName] of [
      ['build-npm', 'publish-npm'],
      ['build-npm-backfill', 'publish-npm-backfill'],
    ]) {
      const build = workflow.jobs[buildName];
      const publisher = workflow.jobs[publishName];
      expect(build.permissions['id-token']).toBeUndefined();
      expect(
        build.steps.find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.[
          'persist-credentials'
        ],
      ).toBe(false);
      const buildIndex = build.steps.findIndex((s) => s.run === 'npm run prepublishOnly');
      const validateIndex = build.steps.findIndex(
        (s) => s.name?.startsWith('Validate ') && s.env?.PACKAGE_TARBALL,
      );
      const uploadIndex = build.steps.findIndex((s) =>
        s.uses?.startsWith('actions/upload-artifact@'),
      );
      expect(buildIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeGreaterThan(buildIndex);
      expect(uploadIndex).toBeGreaterThan(validateIndex);
      expect(build.steps[buildIndex].env?.PROMPTFOO_POSTHOG_KEY).toBeDefined();
      expect(publisher.permissions['id-token']).toBe('write');
      expect([publisher.needs].flat()).toContain(buildName);
      expect(publisher.if).toContain(`needs.${buildName}.result == 'success'`);
      expect(publisher.steps.some((s) => s.uses?.startsWith('actions/checkout@'))).toBe(false);
      expect(publisher.steps.map((s) => s.run ?? '').join('\n')).not.toMatch(
        /npm (?:ci|install|run)/,
      );
      const publish = publisher.steps.find((s) => s.name === 'Publish verified npm package')!;
      expect(publish.env?.NODE_AUTH_TOKEN).toBe('');
      expect(publish.run).toContain(
        'npm publish "${tarballs[0]}" --ignore-scripts --provenance --access public',
      );
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

  for (const jobName of ['publish-npm', 'publish-npm-backfill']) {
    it(`${jobName} rejects wrong identity, version, and publish configuration before publishing`, () => {
      const run = workflow.jobs[jobName].steps.find(
        (s) => s.name === 'Publish verified npm package',
      )!.run!;
      const script = run.match(/<<'NODE'\n([\s\S]*?)\nNODE\n/)?.[1];
      expect(script).toBeDefined();
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-'));
      directories.push(root);
      const manifestPath = path.join(root, 'package.json');
      for (const [manifest, valid] of [
        [{ name: 'promptfoo', version: '1.2.3' }, true],
        [{ name: 'other', version: '1.2.3' }, false],
        [{ name: 'promptfoo', version: '9.9.9' }, false],
        [
          {
            name: 'promptfoo',
            version: '1.2.3',
            publishConfig: { registry: 'https://example.invalid' },
          },
          false,
        ],
      ] as const) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        const result = spawnSync(process.execPath, ['-', manifestPath, '1.2.3'], {
          input: script,
          encoding: 'utf8',
        });
        expect(result.status === 0).toBe(valid);
        if (!valid) {
          expect(result.stderr).toContain('Downloaded artifact has unexpected publish metadata');
        }
      }
    });
  }
});
