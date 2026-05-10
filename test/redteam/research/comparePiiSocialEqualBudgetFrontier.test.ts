import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialEqualBudgetFrontier,
  renderPiiSocialEqualBudgetFrontierMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialEqualBudgetFrontier';

describe('comparePiiSocialEqualBudgetFrontier', () => {
  it('normalizes strategies onto the same generator-prompt budget axis', async () => {
    await expect(comparePiiSocialEqualBudgetFrontier([2, 6, 12])).resolves.toEqual([
      {
        budget: 2,
        bestRowsByStrategy: {
          'legacy-order': {
            requestedCount: 1,
            requestedPromptCount: 2,
            selectedCoverage: '2/8',
            strategy: 'legacy-order',
          },
          'semantic-full-sweep': undefined,
          'semantic-warm-start': undefined,
        },
      },
      {
        budget: 6,
        bestRowsByStrategy: {
          'legacy-order': {
            requestedCount: 3,
            requestedPromptCount: 6,
            selectedCoverage: '8/8',
            strategy: 'legacy-order',
          },
          'semantic-full-sweep': undefined,
          'semantic-warm-start': {
            requestedCount: 3,
            requestedPromptCount: 6,
            selectedCoverage: '8/8',
            strategy: 'semantic-warm-start',
          },
        },
      },
      {
        budget: 12,
        bestRowsByStrategy: {
          'legacy-order': {
            requestedCount: 6,
            requestedPromptCount: 12,
            selectedCoverage: '8/8',
            strategy: 'legacy-order',
          },
          'semantic-full-sweep': {
            requestedCount: 6,
            requestedPromptCount: 12,
            selectedCoverage: '8/8',
            strategy: 'semantic-full-sweep',
          },
          'semantic-warm-start': {
            requestedCount: 6,
            requestedPromptCount: 12,
            selectedCoverage: '8/8',
            strategy: 'semantic-warm-start',
          },
        },
      },
    ]);
  });

  it('renders the saturation warning directly in the benchmark note', async () => {
    const rows = await comparePiiSocialEqualBudgetFrontier([2, 6, 12]);
    const markdown = renderPiiSocialEqualBudgetFrontierMarkdown(rows);

    expect(markdown).toContain('| 6 | 8/8 @ n=3 | 8/8 @ n=3 | n/a |');
    expect(markdown).toContain('this benchmark is saturated');
  });
});
