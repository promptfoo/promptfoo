import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  buildPiiSocialTargetRegimeProfiles,
  countPiiSocialRegimesWithAnyFailure,
  PII_SOCIAL_TARGET_REGIMES,
  PII_SOCIAL_TARGET_REGIME_STRESS_PROFILES,
} from './comparePiiSocialTargetRegimeAggregationPolicies';
import { renderMarkdownTable } from './reportRenderingShared';

import type {
  CandidateProfile,
  ReplayResult,
} from './comparePiiSocialTargetRegimeAggregationPolicies';
import type { ReplayTargetRegime } from './replayPiiSocialLiveOutcomes';

export type PiiSocialTargetRegimeParetoRow = {
  candidate: CandidateProfile['candidate'];
  dominatedBy: CandidateProfile['candidate'][];
  leakReadyPromptRate: string;
  meanFailureRateAcrossRegimes: string;
  onFrontier: boolean;
  regimesWithAnyFailure: string;
  source: CandidateProfile['source'];
};

function divide({ failures, prompts }: CandidateProfile['leakReadyPrompts']): number {
  return prompts === 0 ? 0 : failures / prompts;
}

function meanFailureRate(profile: CandidateProfile): number {
  return (
    PII_SOCIAL_TARGET_REGIMES.reduce((sum, regime) => {
      const { failures, prompts } = profile.failuresByRegime[regime];
      return sum + (prompts === 0 ? 0 : failures / prompts);
    }, 0) / PII_SOCIAL_TARGET_REGIMES.length
  );
}

function dominates(left: CandidateProfile, right: CandidateProfile): boolean {
  const leftAxes = [
    divide(left.leakReadyPrompts),
    countPiiSocialRegimesWithAnyFailure(left),
    meanFailureRate(left),
  ];
  const rightAxes = [
    divide(right.leakReadyPrompts),
    countPiiSocialRegimesWithAnyFailure(right),
    meanFailureRate(right),
  ];

  return (
    leftAxes.every((value, index) => value >= (rightAxes[index] ?? 0)) &&
    leftAxes.some((value, index) => value > (rightAxes[index] ?? 0))
  );
}

function formatRate({ failures, prompts }: CandidateProfile['leakReadyPrompts']): string {
  return `${failures}/${prompts}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderPiiSocialTargetRegimeParetoFrontier(
  outputsByRegime: Record<ReplayTargetRegime, ReplayResult>,
): PiiSocialTargetRegimeParetoRow[] {
  const profiles = [
    ...buildPiiSocialTargetRegimeProfiles(outputsByRegime),
    ...PII_SOCIAL_TARGET_REGIME_STRESS_PROFILES,
  ];

  return profiles.map((profile) => {
    const dominatedBy = profiles
      .filter((candidate) => candidate.candidate !== profile.candidate && dominates(candidate, profile))
      .map((candidate) => candidate.candidate);

    return {
      candidate: profile.candidate,
      dominatedBy,
      leakReadyPromptRate: formatRate(profile.leakReadyPrompts),
      meanFailureRateAcrossRegimes: formatPercent(meanFailureRate(profile)),
      onFrontier: dominatedBy.length === 0,
      regimesWithAnyFailure: `${countPiiSocialRegimesWithAnyFailure(profile)}/${PII_SOCIAL_TARGET_REGIMES.length}`,
      source: profile.source,
    };
  });
}

export function renderPiiSocialTargetRegimeParetoFrontierMarkdown(
  rows: readonly PiiSocialTargetRegimeParetoRow[],
): string {
  return [
    '# PII Social Target Regime Pareto Frontier',
    '',
    ...renderMarkdownTable(
      [
        'Candidate',
        'Source',
        'Leak-ready prompts',
        'Regimes with any failure',
        'Mean failure rate',
        'On frontier',
        'Dominated by',
      ],
      rows.map((row) => ({
        cells: [
          row.candidate,
          row.source,
          row.leakReadyPromptRate,
          row.regimesWithAnyFailure,
          row.meanFailureRateAcrossRegimes,
          row.onFrontier ? 'yes' : 'no',
          row.dominatedBy.join(', ') || '-',
        ],
      })),
    ),
  ].join('\n');
}

async function main() {
  const [hardenedResultsPath, permissiveFamilyResultsPath, selfRecoveryResultsPath] =
    process.argv.slice(2);

  if (!hardenedResultsPath || !permissiveFamilyResultsPath || !selfRecoveryResultsPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/renderPiiSocialTargetRegimeParetoFrontier.ts <hardened-results.json> <permissive-family-results.json> <permissive-self-recovery-results.json>',
    );
  }

  const [hardened, permissiveFamily, permissiveSelfRecovery] = await Promise.all(
    [hardenedResultsPath, permissiveFamilyResultsPath, selfRecoveryResultsPath].map(
      async (path) => JSON.parse(await fs.readFile(path, 'utf8')),
    ),
  );

  console.log(
    renderPiiSocialTargetRegimeParetoFrontierMarkdown(
      renderPiiSocialTargetRegimeParetoFrontier({
        'hardened-medical-agent': hardened,
        'permissive-family': permissiveFamily,
        'permissive-self-recovery': permissiveSelfRecovery,
      }),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
