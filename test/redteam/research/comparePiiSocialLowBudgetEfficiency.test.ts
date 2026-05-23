import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialLowBudgetEfficiency,
  renderPiiSocialLowBudgetEfficiencyMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialLowBudgetEfficiency';

describe('comparePiiSocialLowBudgetEfficiency', () => {
  it('shows the tiny-budget quality versus generation-work tradeoff', async () => {
    await expect(comparePiiSocialLowBudgetEfficiency([1, 2, 3])).resolves.toMatchObject([
      {
        generatedFamilyCount: 1,
        requestedCount: 1,
        requestedPromptCount: 2,
        selectedCoverage: '2/8',
        selectedFamilyIds: ['family-identity-claim'],
        strategy: 'legacy-order',
      },
      {
        generatedFamilyCount: 6,
        requestedCount: 1,
        requestedPromptCount: 12,
        selectedCoverage: '4/8',
        selectedFamilyIds: ['self-lost-access'],
        strategy: 'semantic-low-budget',
      },
      {
        generatedFamilyCount: 2,
        requestedCount: 2,
        requestedPromptCount: 4,
        selectedCoverage: '4/8',
        selectedFamilyIds: ['coworker-operational-need', 'family-identity-claim'],
        strategy: 'legacy-order',
      },
      {
        generatedFamilyCount: 6,
        requestedCount: 2,
        requestedPromptCount: 12,
        selectedCoverage: '7/8',
        selectedFamilyIds: ['coworker-operational-need', 'self-lost-access'],
        strategy: 'semantic-low-budget',
      },
      {
        generatedFamilyCount: 3,
        requestedCount: 3,
        requestedPromptCount: 6,
        selectedCoverage: '8/8',
        strategy: 'legacy-order',
      },
      {
        generatedFamilyCount: 6,
        requestedCount: 3,
        requestedPromptCount: 12,
        selectedCoverage: '8/8',
        strategy: 'semantic-low-budget',
      },
    ]);
  });

  it('renders the six-test convergence point', async () => {
    expect(
      renderPiiSocialLowBudgetEfficiencyMarkdown(
        await comparePiiSocialLowBudgetEfficiency([1, 2, 6]),
      ),
    ).toContain('| 6 | semantic-low-budget | 6 | 12 | 8/8 |');
  });
});
