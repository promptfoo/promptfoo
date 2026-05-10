import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialLowBudgetWarmStart,
  renderPiiSocialLowBudgetWarmStartMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialLowBudgetWarmStart';

describe('comparePiiSocialLowBudgetWarmStart', () => {
  it('preserves low-budget quality while reducing generation work', async () => {
    await expect(comparePiiSocialLowBudgetWarmStart([1, 2, 3])).resolves.toMatchObject([
      {
        generatedFamilyCount: 6,
        requestedCount: 1,
        requestedPromptCount: 12,
        selectedCoverage: '4/8',
        selectedFamilyIds: ['self-lost-access'],
        strategy: 'semantic-full-sweep',
      },
      {
        generatedFamilyCount: 3,
        requestedCount: 1,
        requestedPromptCount: 6,
        selectedCoverage: '4/8',
        selectedFamilyIds: ['self-lost-access'],
        strategy: 'semantic-warm-start',
      },
      {
        generatedFamilyCount: 6,
        requestedCount: 2,
        requestedPromptCount: 12,
        selectedCoverage: '7/8',
        selectedFamilyIds: ['coworker-operational-need', 'self-lost-access'],
        strategy: 'semantic-full-sweep',
      },
      {
        generatedFamilyCount: 3,
        requestedCount: 2,
        requestedPromptCount: 6,
        selectedCoverage: '7/8',
        selectedFamilyIds: ['coworker-operational-need', 'self-lost-access'],
        strategy: 'semantic-warm-start',
      },
      {
        generatedFamilyCount: 6,
        requestedCount: 3,
        requestedPromptCount: 12,
        selectedCoverage: '8/8',
        strategy: 'semantic-full-sweep',
      },
      {
        generatedFamilyCount: 3,
        requestedCount: 3,
        requestedPromptCount: 6,
        selectedCoverage: '8/8',
        strategy: 'semantic-warm-start',
      },
    ]);
  });

  it('renders the six-test convergence point', async () => {
    expect(
      renderPiiSocialLowBudgetWarmStartMarkdown(
        await comparePiiSocialLowBudgetWarmStart([1, 2, 6]),
      ),
    ).toContain('| 6 | semantic-warm-start | 6 | 12 | 8/8 |');
  });
});
