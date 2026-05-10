import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  renderPiiSocialLiveOutcomeReplayMarkdown,
  summarizePiiSocialLiveOutcomeReplay,
} from './replayPiiSocialLiveOutcomes';
import { renderMarkdownTable } from './reportRenderingShared';

import type { ReplayTargetRegime } from './replayPiiSocialLiveOutcomes';

type ReplayResult = Parameters<typeof summarizePiiSocialLiveOutcomeReplay>[0];
type CohortId = 'legacy-generic' | 'portfolio';

export type PiiSocialTargetRegimeSuiteRow = {
  cohort: CohortId;
  leakReadyPromptRate: string;
  meanFailureRateAcrossRegimes: string;
  regimesWithAnyFailure: string;
  totalFailures: string;
};

export function summarizePiiSocialTargetRegimeSuite(
  outputsByRegime: Record<ReplayTargetRegime, ReplayResult>,
): PiiSocialTargetRegimeSuiteRow[] {
  const replayRows = Object.values(outputsByRegime).flatMap((output) =>
    summarizePiiSocialLiveOutcomeReplay(output),
  );

  return (['legacy-generic', 'portfolio'] as const).map((cohort) => {
    const cohortRows = replayRows.filter((row) => row.cohort === cohort);
    const [firstLeakReadyCount, promptCount] = cohortRows[0]?.leakReadyPrompts
      .split('/')
      .map(Number) ?? [0, 0];
    const totalFailures = cohortRows.reduce((sum, row) => {
      const [failureCount] = row.realizedFailures.split('/').map(Number);
      return sum + (failureCount ?? 0);
    }, 0);
    const totalPromptsAcrossRegimes = cohortRows.reduce((sum, row) => sum + row.totalPrompts, 0);
    const regimesWithAnyFailure = cohortRows.filter((row) => {
      const [failureCount] = row.realizedFailures.split('/').map(Number);
      return (failureCount ?? 0) > 0;
    }).length;
    const meanFailureRateAcrossRegimes =
      cohortRows.length === 0
        ? 0
        : cohortRows.reduce((sum, row) => {
            const [failureCount, denominator] = row.realizedFailures.split('/').map(Number);
            return sum + (denominator ? (failureCount ?? 0) / denominator : 0);
          }, 0) / cohortRows.length;

    return {
      cohort,
      leakReadyPromptRate: `${firstLeakReadyCount}/${promptCount}`,
      meanFailureRateAcrossRegimes: `${Math.round(meanFailureRateAcrossRegimes * 100)}%`,
      regimesWithAnyFailure: `${regimesWithAnyFailure}/${cohortRows.length}`,
      totalFailures: `${totalFailures}/${totalPromptsAcrossRegimes}`,
    };
  });
}

export function renderPiiSocialTargetRegimeSuiteMarkdown(
  outputsByRegime: Record<ReplayTargetRegime, ReplayResult>,
): string {
  const replayRows = Object.values(outputsByRegime).flatMap((output) =>
    summarizePiiSocialLiveOutcomeReplay(output),
  );
  const suiteRows = summarizePiiSocialTargetRegimeSuite(outputsByRegime);

  return [
    '# PII Social Target Regime Suite',
    '',
    ...renderMarkdownTable(
      [
        'Cohort',
        'Leak-ready prompts',
        'Mean failure rate across regimes',
        'Regimes with any failure',
        'Total realized failures',
      ],
      suiteRows.map((row) => ({
        cells: [
          row.cohort,
          row.leakReadyPromptRate,
          row.meanFailureRateAcrossRegimes,
          row.regimesWithAnyFailure,
          row.totalFailures,
        ],
      })),
    ),
    '',
    '## Per-Regime Detail',
    '',
    renderPiiSocialLiveOutcomeReplayMarkdown(replayRows).replace(
      '# PII Social Live Outcome Replay\n\n',
      '',
    ),
  ].join('\n');
}

async function main() {
  const [hardenedResultsPath, permissiveResultsPath] = process.argv.slice(2);

  if (!hardenedResultsPath || !permissiveResultsPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/summarizePiiSocialTargetRegimeSuite.ts <hardened-results.json> <permissive-results.json>',
    );
  }

  const [hardened, permissive] = await Promise.all(
    [hardenedResultsPath, permissiveResultsPath].map(async (path) =>
      JSON.parse(await fs.readFile(path, 'utf8')),
    ),
  );

  console.log(
    renderPiiSocialTargetRegimeSuiteMarkdown({
      'hardened-medical-agent': hardened,
      'permissive-family': permissive,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
