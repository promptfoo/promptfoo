import { pathToFileURL } from 'node:url';

import { auditPiiSocialCorpusResiduals } from './auditPiiSocialCorpusResiduals';
import { comparePiiSocialPredicateVisibility } from './comparePiiSocialPredicateVisibility';
import { renderMarkdownTable } from './reportRenderingShared';

export type PiiSocialBenchmarkRefreshPlan = {
  compatibilityView: {
    legacyFeaturelessRows: number;
    legacyResidualExamples: string[];
  };
  requiredFamilies: {
    authorizationStory: string;
    familyId: string;
    relationship: string;
    requiredSignals: string[];
  }[];
  successCriteria: {
    criterion: string;
    target: string;
  }[];
};

export async function planPiiSocialBenchmarkRefresh(): Promise<PiiSocialBenchmarkRefreshPlan> {
  const residuals = await auditPiiSocialCorpusResiduals();
  const visibleRows = await comparePiiSocialPredicateVisibility();

  return {
    compatibilityView: {
      legacyFeaturelessRows: residuals.zeroFeatureRowCount,
      legacyResidualExamples: residuals.rows
        .filter((row) => row.featureIds.length === 0)
        .map((row) => row.prompt),
    },
    requiredFamilies: visibleRows.map((row, index) => ({
      authorizationStory: row.authorizationStory,
      familyId: [
        'family-identity-claim',
        'coworker-operational-need',
        'self-lost-access',
        'third-party-operational-need',
        'family-aftercare-claim',
        'self-session-recovery',
      ][index]!,
      relationship: row.relationship,
      requiredSignals: row.afterFeatureIds,
    })),
    successCriteria: [
      {
        criterion: 'Unique retained social prompts',
        target: '>= 6',
      },
      {
        criterion: 'Positive-claim prompt visibility',
        target: '6/6',
      },
      {
        criterion: 'Observed shared predicate coverage',
        target: '>= 7/8',
      },
      {
        criterion: 'Relationship coverage',
        target: 'family, coworker, self, unknown-third-party',
      },
      {
        criterion: 'Authorization-story coverage',
        target: 'identity-claim, operational-need, lost-access',
      },
      {
        criterion: 'Legacy residual tracking',
        target: `${residuals.zeroFeatureRowCount}/${residuals.totalPromptCount} rows reported separately`,
      },
    ],
  };
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

export function renderPiiSocialBenchmarkRefreshPlanMarkdown(
  plan: PiiSocialBenchmarkRefreshPlan,
): string {
  return [
    '# PII Social Benchmark Refresh Plan',
    '',
    '## Required Modern Families',
    '',
    ...renderMarkdownTable(
      ['Family', 'Relationship', 'Authorization story', 'Required shared signals'],
      plan.requiredFamilies.map((family) => ({
        cells: [
          family.familyId,
          family.relationship,
          family.authorizationStory,
          formatList(family.requiredSignals),
        ],
      })),
    ),
    '',
    '## Success Criteria',
    '',
    ...renderMarkdownTable(
      ['Criterion', 'Target'],
      plan.successCriteria.map((criterion) => ({
        cells: [criterion.criterion, criterion.target],
      })),
    ),
    '',
    '## Legacy Compatibility View',
    '',
    `- featureless legacy rows to track separately: ${plan.compatibilityView.legacyFeaturelessRows}`,
    ...plan.compatibilityView.legacyResidualExamples.map((prompt) => `- ${prompt}`),
    '',
    '## Implementation Sequence',
    '',
    '1. Replace the benchmark social slice with the six modern positive-claim families.',
    '2. Keep the current legacy residual set in a separate compatibility report during migration.',
    '3. Re-run readiness, visibility, and corpus residual audits on every benchmark refresh.',
    '4. Use the shared semantic frontier to prevent future regressions back toward direct-request-only prompts.',
    '',
    '## Reading',
    '',
    'A truthful `pii:social` benchmark should exercise explicit social-engineering families, not just unauthorized direct requests. The refresh should therefore promote the six positive-claim families into the benchmark itself, keep legacy residuals visible during transition, and judge success by retained-family diversity plus shared-predicate observability rather than raw row count.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialBenchmarkRefreshPlanMarkdown(await planPiiSocialBenchmarkRefresh()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
