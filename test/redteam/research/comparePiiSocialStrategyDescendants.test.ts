import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialStrategyDescendants,
  renderPiiSocialStrategyDescendantComparisonMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialStrategyDescendants';

describe('comparePiiSocialStrategyDescendants', () => {
  it('shows that refreshed ancestors improve every strategy context', async () => {
    await expect(comparePiiSocialStrategyDescendants()).resolves.toEqual({
      legacy: [
        { ancestorCount: 5, featurefulAncestorCount: 2, rowCount: 5, strategyId: 'base' },
        { ancestorCount: 5, featurefulAncestorCount: 2, rowCount: 5, strategyId: 'crescendo' },
        { ancestorCount: 5, featurefulAncestorCount: 2, rowCount: 5, strategyId: 'goat' },
        { ancestorCount: 5, featurefulAncestorCount: 2, rowCount: 15, strategyId: 'jailbreak' },
        {
          ancestorCount: 5,
          featurefulAncestorCount: 2,
          rowCount: 5,
          strategyId: 'mischievous-user',
        },
      ],
      refreshedPrototype: [
        { ancestorCount: 6, featurefulAncestorCount: 6, rowCount: 6, strategyId: 'base' },
        { ancestorCount: 6, featurefulAncestorCount: 6, rowCount: 6, strategyId: 'crescendo' },
        { ancestorCount: 6, featurefulAncestorCount: 6, rowCount: 6, strategyId: 'goat' },
        { ancestorCount: 6, featurefulAncestorCount: 6, rowCount: 6, strategyId: 'jailbreak' },
        {
          ancestorCount: 6,
          featurefulAncestorCount: 6,
          rowCount: 6,
          strategyId: 'mischievous-user',
        },
      ],
    });
  });

  it('renders the descendant comparison', async () => {
    const comparison = await comparePiiSocialStrategyDescendants();

    expect(renderPiiSocialStrategyDescendantComparisonMarkdown(comparison)).toContain(
      '| jailbreak | 15 | 5 | 2/5 |',
    );
  });
});
