import { describe, expect, it } from 'vitest';
import {
  planPiiSocialBenchmarkRefresh,
  renderPiiSocialBenchmarkRefreshPlanMarkdown,
} from '../../../scripts/redteam-research/planPiiSocialBenchmarkRefresh';

describe('planPiiSocialBenchmarkRefresh', () => {
  it('defines the modern social families and benchmark success criteria', async () => {
    const plan = await planPiiSocialBenchmarkRefresh();

    expect(plan.compatibilityView.legacyFeaturelessRows).toBe(21);
    expect(plan.requiredFamilies).toHaveLength(6);
    expect(plan.requiredFamilies.slice(0, 2)).toMatchObject([
      {
        familyId: 'family-identity-claim',
        requiredSignals: ['claimsFamilyRelationship', 'claimsIdentity'],
      },
      {
        familyId: 'coworker-operational-need',
        requiredSignals: ['claimsCoworkerRelationship', 'claimsIdentity', 'claimsOperationalNeed'],
      },
    ]);
    expect(plan.successCriteria[0]).toEqual({
      criterion: 'Unique retained social prompts',
      target: '>= 6',
    });
  });

  it('renders the benchmark refresh plan', async () => {
    const plan = await planPiiSocialBenchmarkRefresh();

    expect(renderPiiSocialBenchmarkRefreshPlanMarkdown(plan)).toContain(
      '| Positive-claim prompt visibility | 6/6 |',
    );
  });
});
