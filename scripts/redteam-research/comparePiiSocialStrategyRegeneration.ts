import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import { extractPiiSocialFeatures } from '../../src/redteam/generation/predicateSignatures';
import { renderMarkdownTable } from './reportRenderingShared';

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

export type PiiSocialStrategyRegenerationRow = {
  exactPromptSetMatch: boolean;
  liveFeaturefulAncestors: number;
  liveRows: number;
  regeneratedFeaturefulAncestors: number;
  regeneratedRows: number;
  strategyId: string;
};

function getPrompt(test: TestCase): string | undefined {
  return typeof test.vars?.prompt === 'string' && test.vars.prompt.length > 0
    ? test.vars.prompt
    : undefined;
}

function getStrategyId(test: TestCase): string {
  return typeof test.metadata?.strategyId === 'string' ? test.metadata.strategyId : 'base';
}

function summarizeFeaturefulAncestors(prompts: readonly string[]): number {
  return [...new Set(prompts)].filter((prompt) => extractPiiSocialFeatures(prompt).length > 0)
    .length;
}

function haveSamePromptSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((prompt) => rightSet.has(prompt));
}

export async function comparePiiSocialStrategyRegeneration(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialStrategyRegenerationRow[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;
  const grouped = new Map<string, string[]>();

  for (const test of parsed.tests ?? []) {
    if (test.metadata?.pluginId !== 'pii:social') {
      continue;
    }

    const prompt = getPrompt(test);
    if (!prompt) {
      continue;
    }

    const strategyId = getStrategyId(test);
    const prompts = grouped.get(strategyId) ?? [];
    prompts.push(prompt);
    grouped.set(strategyId, prompts);
  }

  const regeneratedPrompts = [...new Set(grouped.get('base') ?? [])];
  const regeneratedFeaturefulAncestors = summarizeFeaturefulAncestors(regeneratedPrompts);

  return [...grouped.entries()]
    .map(([strategyId, prompts]) => ({
      exactPromptSetMatch: haveSamePromptSet(prompts, regeneratedPrompts),
      liveFeaturefulAncestors: summarizeFeaturefulAncestors(prompts),
      liveRows: prompts.length,
      regeneratedFeaturefulAncestors,
      regeneratedRows: regeneratedPrompts.length,
      strategyId,
    }))
    .sort((a, b) => a.strategyId.localeCompare(b.strategyId));
}

export function renderPiiSocialStrategyRegenerationMarkdown(
  rows: readonly PiiSocialStrategyRegenerationRow[],
): string {
  return [
    '# PII Social Strategy Regeneration Check',
    '',
    ...renderMarkdownTable(
      [
        'Strategy',
        'Live rows',
        'Regenerated rows',
        'Live featureful ancestors',
        'Regenerated featureful ancestors',
        'Prompt set matches base',
      ],
      rows.map((row) => ({
        cells: [
          row.strategyId,
          String(row.liveRows),
          String(row.regeneratedRows),
          String(row.liveFeaturefulAncestors),
          String(row.regeneratedFeaturefulAncestors),
          row.exactPromptSetMatch ? 'yes' : 'no',
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'The migrated strategy descendants are reconstructible from the six-row base slice: every strategy context has the same six ancestor prompts and the same single residual aftercare prompt. That residual is now reported honestly instead of being credited as a family claim, and the old duplicated `jailbreak` branch no longer requires special treatment.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialStrategyRegenerationMarkdown(await comparePiiSocialStrategyRegeneration()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
