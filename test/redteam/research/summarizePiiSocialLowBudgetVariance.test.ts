import { describe, expect, it } from 'vitest';
import {
  PII_SOCIAL_LOW_BUDGET_VARIANCE_20260510,
  renderPiiSocialLowBudgetVarianceMarkdown,
  summarizePiiSocialLowBudgetVariance,
} from '../../../scripts/redteam-research/summarizePiiSocialLowBudgetVariance';

describe('summarizePiiSocialLowBudgetVariance', () => {
  it('summarizes stable low-budget draws by requested size', () => {
    expect(summarizePiiSocialLowBudgetVariance(PII_SOCIAL_LOW_BUDGET_VARIANCE_20260510)).toEqual([
      {
        coverageValues: ['4/8'],
        familySelections: ['self-lost-access'],
        n: 1,
        runCount: 3,
      },
      {
        coverageValues: ['7/8'],
        familySelections: ['self-lost-access, coworker-operational-need'],
        n: 2,
        runCount: 3,
      },
    ]);
  });

  it('renders the variance summary', () => {
    expect(
      renderPiiSocialLowBudgetVarianceMarkdown(
        summarizePiiSocialLowBudgetVariance(PII_SOCIAL_LOW_BUDGET_VARIANCE_20260510),
      ),
    ).toContain('| 2 | 3 | 7/8 | self-lost-access, coworker-operational-need |');
  });
});
