import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  renderPiiSocialTargetRegimeParetoFrontier,
  renderPiiSocialTargetRegimeParetoFrontierMarkdown,
} from './renderPiiSocialTargetRegimeParetoFrontier';
import { renderPiiSocialTargetRegimeSuiteMarkdown } from './summarizePiiSocialTargetRegimeSuite';

import type { ReplayResult } from './comparePiiSocialTargetRegimeAggregationPolicies';
import type { ReplayTargetRegime } from './replayPiiSocialLiveOutcomes';

export function renderPiiSocialOperatorReport(
  outputsByRegime: Record<ReplayTargetRegime, ReplayResult>,
): string {
  const paretoRows = renderPiiSocialTargetRegimeParetoFrontier(outputsByRegime);
  const retainedCandidates = paretoRows.filter((row) => row.recommendation === 'retain');
  const nextActionRows = paretoRows.filter((row) => row.recommendation !== 'retain');

  return [
    '# PII Social Operator Report',
    '',
    '## Executive Summary',
    '',
    `- Retain: ${retainedCandidates.map((row) => row.candidate).join(', ') || '-'}`,
    `- Next action queue: ${nextActionRows
      .map((row) => `${row.candidate} -> ${row.recommendation}`)
      .join('; ')}`,
    '',
    '## Frontier',
    '',
    renderPiiSocialTargetRegimeParetoFrontierMarkdown(paretoRows).replace(
      '# PII Social Target Regime Pareto Frontier\n\n',
      '',
    ),
    '',
    '## Per-Regime Evidence',
    '',
    renderPiiSocialTargetRegimeSuiteMarkdown(outputsByRegime)
      .replace('# PII Social Target Regime Suite\n\n', '')
      .replace('\n## Per-Regime Detail\n\n', '\n'),
    '',
    '## Known Limitations',
    '',
    '1. The replay suite still covers only one plugin family: `pii:social`.',
    '2. Two susceptible targets are deterministic research providers, not naturally occurring production targets.',
    '3. The recommendation labels are policy aids, not final model-selection rules.',
  ].join('\n');
}

async function main() {
  const [hardenedResultsPath, permissiveFamilyResultsPath, selfRecoveryResultsPath] =
    process.argv.slice(2);

  if (!hardenedResultsPath || !permissiveFamilyResultsPath || !selfRecoveryResultsPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/renderPiiSocialOperatorReport.ts <hardened-results.json> <permissive-family-results.json> <permissive-self-recovery-results.json>',
    );
  }

  const [hardened, permissiveFamily, permissiveSelfRecovery] = await Promise.all(
    [hardenedResultsPath, permissiveFamilyResultsPath, selfRecoveryResultsPath].map(async (path) =>
      JSON.parse(await fs.readFile(path, 'utf8')),
    ),
  );

  console.log(
    renderPiiSocialOperatorReport({
      'hardened-medical-agent': hardened,
      'permissive-family': permissiveFamily,
      'permissive-self-recovery': permissiveSelfRecovery,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
