import { pathToFileURL } from 'node:url';

import { getAnalyzerSemanticAlignment } from './analyzeGeneratedAttacks';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';
import {
  extractPiiSocialFeatures,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';

export type PiiSocialFrontierReadinessAudit = {
  recommendation: 'expand shared vocabulary first' | 'ready to onboard';
  sharedFeatureCount: number;
  sharedFeatureCoverage: ReturnType<typeof summarizeObservedPluginFeatureCoverage>;
  sharedFeatureIds: string[];
  sharedDimensionCount: number;
  separateConceptDimensionCount: number;
  separateConceptDimensionIds: string[];
};

export async function auditPiiSocialFrontierReadiness(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialFrontierReadinessAudit> {
  const { entities } = await loadPiiContext(inputPath);
  const attacks = buildPiiPortfolio(entities, 'pii:social');
  const alignments = getAnalyzerSemanticAlignment('pii:social');
  const sharedDimensionCount = alignments.filter(
    (alignment) => alignment.kind !== 'separate-concept',
  ).length;
  const separateConceptDimensionIds = alignments
    .filter((alignment) => alignment.kind === 'separate-concept')
    .map((alignment) => alignment.dimension)
    .sort();
  const sharedFeatureCoverage = summarizeObservedPluginFeatureCoverage(
    'pii:social',
    attacks.map((attack) => attack.prompt),
  );
  const sharedFeatureIds = [...new Set(attacks.flatMap((attack) => extractPiiSocialFeatures(attack.prompt)))];
  const recommendation =
    sharedDimensionCount === 0 || separateConceptDimensionIds.length > sharedDimensionCount
      ? 'expand shared vocabulary first'
      : 'ready to onboard';

  return {
    recommendation,
    separateConceptDimensionCount: separateConceptDimensionIds.length,
    separateConceptDimensionIds,
    sharedDimensionCount,
    sharedFeatureCount: sharedFeatureIds.length,
    sharedFeatureCoverage,
    sharedFeatureIds,
  };
}

export function renderPiiSocialFrontierReadinessMarkdown(
  audit: PiiSocialFrontierReadinessAudit,
): string {
  return [
    '# PII Social Frontier Readiness',
    '',
    ...renderMarkdownTable(
      [
        'Shared features',
        'Shared dimensions',
        'Separate-concept dimensions',
        'Observed shared coverage',
        'Recommendation',
      ],
      [
        {
          cells: [
            String(audit.sharedFeatureCount),
            String(audit.sharedDimensionCount),
            String(audit.separateConceptDimensionCount),
            `${audit.sharedFeatureCoverage.observedFeatureCount}/${audit.sharedFeatureCoverage.featureCount}`,
            audit.recommendation,
          ],
        },
      ],
    ),
    '',
    '## Details',
    '',
    `- shared feature ids: ${audit.sharedFeatureIds.join(', ')}`,
    `- separate-concept dimensions: ${audit.separateConceptDimensionIds.join(', ')}`,
    '',
    '## Reading',
    '',
    '`pii:social` is the most informative next frontier shape, but it is not production-ready yet. The shared layer currently defines only two predicates, the current research portfolio exercises just one of them, and both are tied to one coarse sensitive-field rollup while tactic, relationship, and authorization-story remain analyzer-only concepts. The next honest step is to expand the shared vocabulary before attempting a production frontier migration.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialFrontierReadinessMarkdown(await auditPiiSocialFrontierReadiness()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
