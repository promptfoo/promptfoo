import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  renderPiiDirectOutcomeReplayMarkdown,
  summarizePiiDirectOutcomeReplay,
} from './replayPiiDirectOutcomes';
import { renderMarkdownTable } from './reportRenderingShared';

import type { PiiDirectReplayTargetRegime } from './replayPiiDirectOutcomes';

type ReplayResult = Parameters<typeof summarizePiiDirectOutcomeReplay>[0];

export type PiiDirectTargetRegimeSuiteSummary = {
  fieldVisiblePromptRate: string;
  meanFailureRateAcrossRegimes: string;
  regimesWithAnyFailure: string;
  totalFailures: string;
};

export function summarizePiiDirectTargetRegimeSuite(
  outputsByRegime: Record<PiiDirectReplayTargetRegime, ReplayResult>,
): PiiDirectTargetRegimeSuiteSummary {
  const replayRows = Object.values(outputsByRegime).flatMap((output) =>
    summarizePiiDirectOutcomeReplay(output),
  );
  const [fieldVisibleCount, promptCount] = replayRows[0]?.fieldVisiblePrompts
    .split('/')
    .map(Number) ?? [0, 0];
  const totalFailures = replayRows.reduce((sum, row) => {
    const [failureCount] = row.realizedFailures.split('/').map(Number);
    return sum + (failureCount ?? 0);
  }, 0);
  const totalPromptsAcrossRegimes = replayRows.reduce((sum, row) => {
    const [, denominator] = row.realizedFailures.split('/').map(Number);
    return sum + (denominator ?? 0);
  }, 0);
  const regimesWithAnyFailure = replayRows.filter((row) => {
    const [failureCount] = row.realizedFailures.split('/').map(Number);
    return (failureCount ?? 0) > 0;
  }).length;
  const meanFailureRateAcrossRegimes =
    replayRows.length === 0
      ? 0
      : replayRows.reduce((sum, row) => {
          const [failureCount, denominator] = row.realizedFailures.split('/').map(Number);
          return sum + (denominator ? (failureCount ?? 0) / denominator : 0);
        }, 0) / replayRows.length;

  return {
    fieldVisiblePromptRate: `${fieldVisibleCount}/${promptCount}`,
    meanFailureRateAcrossRegimes: `${Math.round(meanFailureRateAcrossRegimes * 100)}%`,
    regimesWithAnyFailure: `${regimesWithAnyFailure}/${replayRows.length}`,
    totalFailures: `${totalFailures}/${totalPromptsAcrossRegimes}`,
  };
}

export function renderPiiDirectTargetRegimeSuiteMarkdown(
  outputsByRegime: Record<PiiDirectReplayTargetRegime, ReplayResult>,
): string {
  const replayRows = Object.values(outputsByRegime).flatMap((output) =>
    summarizePiiDirectOutcomeReplay(output),
  );
  const suite = summarizePiiDirectTargetRegimeSuite(outputsByRegime);

  return [
    '# PII Direct Target Regime Suite',
    '',
    ...renderMarkdownTable(
      [
        'Field-visible prompts',
        'Mean failure rate across regimes',
        'Regimes with any failure',
        'Total realized failures',
      ],
      [
        {
          cells: [
            suite.fieldVisiblePromptRate,
            suite.meanFailureRateAcrossRegimes,
            suite.regimesWithAnyFailure,
            suite.totalFailures,
          ],
        },
      ],
    ),
    '',
    '## Per-Regime Detail',
    '',
    renderPiiDirectOutcomeReplayMarkdown(replayRows)
      .replace('# PII Direct Outcome Replay\n\n', '')
      .split('\n\n## Reading\n\n')[0]!,
    '',
    '## Reading',
    '',
    'The direct-PII suite is now large enough to separate one hardened target from one selectively weak target. The current frontier stays fully visible (`6/6`) while averaging `25%` realized failure across the two regimes, with at least one weakness exposed in `1/2` regimes. That is enough for stage `5`, but still not enough to call the target distribution mature.',
  ].join('\n');
}

async function main() {
  const [strictResultsPath, permissiveResultsPath] = process.argv.slice(2);

  if (!strictResultsPath || !permissiveResultsPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/summarizePiiDirectTargetRegimeSuite.ts <strict-results.json> <permissive-identity-results.json>',
    );
  }

  const [strictRefusal, permissiveIdentity] = await Promise.all(
    [strictResultsPath, permissiveResultsPath].map(async (path) =>
      JSON.parse(await fs.readFile(path, 'utf8')),
    ),
  );

  console.log(
    renderPiiDirectTargetRegimeSuiteMarkdown({
      'strict-refusal': strictRefusal,
      'permissive-identity': permissiveIdentity,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
