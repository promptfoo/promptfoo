import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS_RUNNER_LABEL = 'windows-2025-vs2026';

type WorkflowStep = {
  id?: unknown;
  name?: unknown;
  run?: unknown;
  with?: Record<string, unknown>;
};

type MainWorkflow = {
  jobs?: {
    'ci-config'?: {
      steps?: WorkflowStep[];
    };
    test?: {
      steps?: WorkflowStep[];
    };
  };
};

type TestMatrixEntry = {
  node: string;
  os: string;
  shard: '' | number;
};

function readMainWorkflow() {
  const workflowYaml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/main.yml'), 'utf8');
  return yaml.load(workflowYaml) as MainWorkflow;
}

function getSetMatrixScript(workflow: MainWorkflow): string {
  const step = workflow.jobs?.['ci-config']?.steps?.find((step) => step.id === 'set-matrix');
  assert(step && typeof step.run === 'string', 'CI Config job must include the set-matrix script');
  return step.run;
}

function extractStaticMatrixEntries(script: string): TestMatrixEntry[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const entryMatch = line.match(/^,?(\{.*\}),?$/);
      if (!entryMatch) {
        return [];
      }
      return [JSON.parse(entryMatch[1]) as TestMatrixEntry];
    });
}

describe('main CI workflow', () => {
  it('keeps every Windows test matrix entry on the VS 2026 runner image', () => {
    const workflow = readMainWorkflow();
    const matrixEntries = extractStaticMatrixEntries(getSetMatrixScript(workflow));
    const windowsEntries = matrixEntries.filter((entry) => entry.os.startsWith('windows-'));

    expect(windowsEntries.length).toBeGreaterThan(0);
    expect(new Set(windowsEntries.map((entry) => entry.os))).toEqual(
      new Set([WINDOWS_RUNNER_LABEL]),
    );
    expect(windowsEntries).toEqual(
      expect.arrayContaining([
        { node: '20.20', os: WINDOWS_RUNNER_LABEL, shard: 1 },
        { node: '20.20', os: WINDOWS_RUNNER_LABEL, shard: 2 },
        { node: '20.20', os: WINDOWS_RUNNER_LABEL, shard: 3 },
        { node: '22.22', os: WINDOWS_RUNNER_LABEL, shard: 1 },
        { node: '22.22', os: WINDOWS_RUNNER_LABEL, shard: 2 },
        { node: '22.22', os: WINDOWS_RUNNER_LABEL, shard: 3 },
        { node: '24.x', os: WINDOWS_RUNNER_LABEL, shard: 1 },
        { node: '24.x', os: WINDOWS_RUNNER_LABEL, shard: 2 },
        { node: '24.x', os: WINDOWS_RUNNER_LABEL, shard: 3 },
      ]),
    );
  });

  it('uses the Windows Ruby fallback for runner labels beyond windows-latest', () => {
    const workflow = readMainWorkflow();
    const rubyStep = workflow.jobs?.test?.steps?.find((step) => step.name === 'Use Ruby');
    const rubyVersion = rubyStep?.with?.['ruby-version'];

    assert(typeof rubyVersion === 'string', 'Test job must configure a Ruby version');
    expect(rubyVersion).toContain("startsWith(matrix.os, 'windows-')");
    expect(rubyVersion).toContain("'4.0.0'");
    expect(rubyVersion).toContain("'4.0.1'");
    expect(rubyVersion).not.toContain("matrix.os == 'windows-latest'");
  });
});
