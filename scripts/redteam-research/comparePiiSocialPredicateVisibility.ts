import { pathToFileURL } from 'node:url';

import { extractPiiSocialFeatures } from '../../src/redteam/generation/predicateSignatures';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

type LegacyPiiSocialPredicate = 'requestsPrescriptionDetails' | 'requestsRefillDates';

const LEGACY_PII_SOCIAL_RULES: Record<LegacyPiiSocialPredicate, RegExp[]> = {
  requestsPrescriptionDetails: [/\bprescription details?\b/i],
  requestsRefillDates: [/\brefill dates?\b/i],
};

export type PiiSocialPredicateVisibilityRow = {
  addedFeatureIds: string[];
  afterFeatureIds: string[];
  authorizationStory: string;
  beforeFeatureIds: string[];
  prompt: string;
  relationship: string;
};

function extractLegacyPiiSocialFeatures(prompt: string): string[] {
  return (Object.keys(LEGACY_PII_SOCIAL_RULES) as LegacyPiiSocialPredicate[]).filter((predicate) =>
    LEGACY_PII_SOCIAL_RULES[predicate].some((rule) => rule.test(prompt)),
  );
}

function formatFeatures(features: readonly string[]): string {
  return features.length === 0 ? 'none' : features.join(', ');
}

export async function comparePiiSocialPredicateVisibility(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialPredicateVisibilityRow[]> {
  const { entities } = await loadPiiContext(inputPath);

  return buildPiiPortfolio(entities, 'pii:social').map((attack) => {
    const beforeFeatureIds = extractLegacyPiiSocialFeatures(attack.prompt);
    const afterFeatureIds = extractPiiSocialFeatures(attack.prompt);

    return {
      addedFeatureIds: afterFeatureIds.filter((feature) => !beforeFeatureIds.includes(feature)),
      afterFeatureIds,
      authorizationStory: attack.authorizationStory,
      beforeFeatureIds,
      prompt: attack.prompt,
      relationship: attack.relationship,
    };
  });
}

export function renderPiiSocialPredicateVisibilityMarkdown(
  rows: readonly PiiSocialPredicateVisibilityRow[],
): string {
  const beforeVisiblePromptCount = rows.filter((row) => row.beforeFeatureIds.length > 0).length;
  const afterVisiblePromptCount = rows.filter((row) => row.afterFeatureIds.length > 0).length;
  const newlyVisiblePromptCount = rows.filter(
    (row) => row.beforeFeatureIds.length === 0 && row.afterFeatureIds.length > 0,
  ).length;

  return [
    '# PII Social Predicate Visibility Before / After',
    '',
    ...renderMarkdownTable(
      ['Before-visible prompts', 'After-visible prompts', 'Newly visible prompts'],
      [
        {
          cells: [
            `${beforeVisiblePromptCount}/${rows.length}`,
            `${afterVisiblePromptCount}/${rows.length}`,
            `${newlyVisiblePromptCount}/${rows.length}`,
          ],
        },
      ],
    ),
    '',
    ...renderMarkdownTable(
      ['Relationship', 'Authorization story', 'Before', 'After', 'Newly visible'],
      rows.map((row) => ({
        cells: [
          row.relationship,
          row.authorizationStory,
          formatFeatures(row.beforeFeatureIds),
          formatFeatures(row.afterFeatureIds),
          formatFeatures(row.addedFeatureIds),
        ],
      })),
    ),
    '',
    '## Example Attacks',
    '',
    ...rows.map((row, index) => `${index + 1}. ${row.prompt}`),
    '',
    '## Reading',
    '',
    'Under the legacy two-predicate view, only the refill-date prompt was visible at all. The expanded shared vocabulary makes every social-PII attack in the six-prompt research portfolio inspectable, and the added predicates explain why each prompt is socially adversarial instead of merely showing that one happens to mention a prescription field.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialPredicateVisibilityMarkdown(await comparePiiSocialPredicateVisibility()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
