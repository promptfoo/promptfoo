import { pathToFileURL } from 'node:url';

import { auditPiiSocialCorpusResiduals } from './auditPiiSocialCorpusResiduals';
import { auditPiiSocialFrontierReadiness } from './auditPiiSocialFrontierReadiness';
import { renderMarkdownTable } from './reportRenderingShared';

export type PiiSocialTaxonomyDecision = {
  recommendation: 'stage migration';
  options: {
    option: string;
    upside: string;
    downside: string;
    fit: 'poor' | 'acceptable' | 'best';
  }[];
  observedSharedCoverage: string;
  realCorpusResidualRate: string;
  rationale: string[];
};

export async function summarizePiiSocialTaxonomyDecision(): Promise<PiiSocialTaxonomyDecision> {
  const readiness = await auditPiiSocialFrontierReadiness();
  const residuals = await auditPiiSocialCorpusResiduals();

  return {
    observedSharedCoverage: `${readiness.sharedFeatureCoverage.observedFeatureCount}/${readiness.sharedFeatureCoverage.featureCount}`,
    options: [
      {
        downside:
          'Collapses generic unauthorized PII access and explicit manipulation back into one blurry frontier.',
        fit: 'poor',
        option: 'Broaden pii:social until it covers the legacy corpus',
        upside: 'Keeps one public plugin and maximizes short-term benchmark coverage.',
      },
      {
        downside:
          'Creates a breaking taxonomy move and immediately strands historical configs, docs, and benchmarks.',
        fit: 'acceptable',
        option: 'Split into new public plugins immediately',
        upside: 'Restores semantic clarity fastest.',
      },
      {
        downside:
          'Requires a bridge period with two views over overlapping historical data.',
        fit: 'best',
        option: 'Stage migration under the existing public plugin',
        upside:
          'Preserves the public social-engineering contract now while allowing legacy direct-request prompts to be measured and retired deliberately.',
      },
    ],
    rationale: [
      `The curated positive-claim frontier now exposes ${readiness.sharedFeatureCount}/${readiness.sharedFeatureVocabularyCount} shared predicates and ${readiness.sharedFeatureCoverage.observedFeatureCount}/${readiness.sharedFeatureCoverage.featureCount} observed coverage.`,
      `The real benchmark still leaves ${residuals.zeroFeatureRowCount}/${residuals.totalPromptCount} rows and ${residuals.zeroFeaturePromptCount}/${residuals.uniquePromptCount} unique prompts without shared social evidence.`,
      'The documented public meaning of pii:social is social engineering, so broadening it to absorb generic direct requests would make the name less true rather than more useful.',
    ],
    realCorpusResidualRate: `${residuals.zeroFeatureRowCount}/${residuals.totalPromptCount}`,
    recommendation: 'stage migration',
  };
}

export function renderPiiSocialTaxonomyDecisionMarkdown(
  decision: PiiSocialTaxonomyDecision,
): string {
  return [
    '# PII Social Taxonomy Decision',
    '',
    ...renderMarkdownTable(
      ['Option', 'Upside', 'Downside', 'Fit'],
      decision.options.map((option) => ({
        cells: [option.option, option.upside, option.downside, option.fit],
      })),
    ),
    '',
    '## Recommendation',
    '',
    '`pii:social` should use a staged migration, not a broadened frontier.',
    '',
    '## Why',
    '',
    ...decision.rationale.map((line) => `- ${line}`),
    '',
    '## Proposed Migration',
    '',
    '1. Keep `pii:social` publicly anchored to explicit social-engineering attacks.',
    '2. Continue using the new positive-claim shared predicates for the modern frontier.',
    '3. Track legacy direct-request residuals as a separate compatibility view during migration.',
    '4. Refresh the benchmark corpus so future `pii:social` examples match the documented public contract.',
    '5. Only after that refresh, decide whether generic unauthorized PII access deserves its own separately named frontier or should remain covered by `pii:direct` plus grader behavior.',
    '',
    '## Reading',
    '',
    `Current evidence points away from “make \`pii:social\` cover everything old.” The modern shared layer is already useful on positive-claim social attacks (${decision.observedSharedCoverage}), while the historical benchmark remains mostly residual (${decision.realCorpusResidualRate}) because it encodes a different concept. The lowest-regret path is to preserve the truthful public meaning and migrate the legacy corpus toward it.`,
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialTaxonomyDecisionMarkdown(await summarizePiiSocialTaxonomyDecision()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
