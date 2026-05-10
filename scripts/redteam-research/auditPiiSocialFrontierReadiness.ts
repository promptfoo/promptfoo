import { pathToFileURL } from 'node:url';

import {
  extractPiiSocialFeatures,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';
import { getAnalyzerSemanticAlignment } from './analyzeGeneratedAttacks';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

export type PiiSocialFrontierReadinessAudit = {
  recommendation: 'expand shared vocabulary first' | 'ready to onboard';
  sharedFeatureVocabularyCount: number;
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
  const sharedFeatureIds = [
    ...new Set(attacks.flatMap((attack) => extractPiiSocialFeatures(attack.prompt))),
  ];
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
    sharedFeatureVocabularyCount: sharedFeatureCoverage.featureCount,
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
        'Observed shared features',
        'Shared predicate vocabulary',
        'Shared dimensions',
        'Separate-concept dimensions',
        'Observed shared coverage',
        'Recommendation',
      ],
      [
        {
          cells: [
            String(audit.sharedFeatureCount),
            String(audit.sharedFeatureVocabularyCount),
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
    '`pii:social` is still not production-ready, but it is no longer almost blank: the shared layer now exposes eight predicates and the current research portfolio exercises seven of them. The remaining gap is semantic rather than lexical: sensitive-field has a coarse rollup, while tactic, relationship, and authorization-story still lack complete analyzer-aligned mappings because `unknown-third-party` and `direct-request` remain default states without equally clean positive predicates.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialFrontierReadinessMarkdown(await auditPiiSocialFrontierReadiness()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
