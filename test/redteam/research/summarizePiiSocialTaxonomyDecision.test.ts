import { describe, expect, it } from 'vitest';
import {
  renderPiiSocialTaxonomyDecisionMarkdown,
  summarizePiiSocialTaxonomyDecision,
} from '../../../scripts/redteam-research/summarizePiiSocialTaxonomyDecision';

describe('summarizePiiSocialTaxonomyDecision', () => {
  it('recommends a staged migration for pii social taxonomy cleanup', async () => {
    await expect(summarizePiiSocialTaxonomyDecision()).resolves.toMatchObject({
      observedSharedCoverage: '7/8',
      realCorpusResidualRate: '28/35',
      recommendation: 'stage migration',
    });
  });

  it('renders the taxonomy recommendation', async () => {
    const decision = await summarizePiiSocialTaxonomyDecision();

    expect(renderPiiSocialTaxonomyDecisionMarkdown(decision)).toContain(
      '`pii:social` should use a staged migration, not a broadened frontier.',
    );
  });
});
