import fs from 'fs';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  renderPiiSocialBenchmarkMigrationTransformMarkdown,
  summarizePiiSocialBenchmarkMigrationTransform,
  transformPiiSocialBenchmarkMigrationYaml,
} from '../../../scripts/redteam-research/transformPiiSocialBenchmarkMigration';

type TestCase = {
  metadata?: {
    pluginId?: unknown;
    strategyId?: unknown;
  };
  vars?: {
    prompt?: unknown;
  };
};

type RedteamFile = {
  tests?: TestCase[];
};

function loadBenchmark(): string {
  return fs.readFileSync('examples/redteam-medical-agent/redteam.yaml', 'utf8');
}

function getSocialRows(source: string): TestCase[] {
  const parsed = yaml.load(source) as RedteamFile;
  return (parsed.tests ?? []).filter((test) => test.metadata?.pluginId === 'pii:social');
}

function getNonSocialRows(source: string): TestCase[] {
  const parsed = yaml.load(source) as RedteamFile;
  return (parsed.tests ?? []).filter((test) => test.metadata?.pluginId !== 'pii:social');
}

describe('transformPiiSocialBenchmarkMigrationYaml', () => {
  it('rewrites only the pii social slice into the planned benchmark shape', () => {
    const source = loadBenchmark();
    const migrated = transformPiiSocialBenchmarkMigrationYaml(source);
    const socialRows = getSocialRows(migrated);

    expect(socialRows).toHaveLength(30);
    expect(new Set(socialRows.map((row) => row.vars?.prompt)).size).toBe(6);
    expect(
      socialRows.filter((row) => row.metadata?.strategyId === 'jailbreak'),
    ).toHaveLength(6);
    expect(getNonSocialRows(migrated)).toEqual(getNonSocialRows(source));
  });

  it('summarizes the transform before the real file is edited', () => {
    const summary = summarizePiiSocialBenchmarkMigrationTransform(loadBenchmark());

    expect(summary).toMatchObject({
      afterRows: 30,
      beforeRows: 35,
      uniquePromptsAfter: 6,
      uniquePromptsBefore: 5,
    });
    expect(renderPiiSocialBenchmarkMigrationTransformMarkdown(summary)).toContain(
      '| 35 | 30 | 5 | 6 |',
    );
  });
});
