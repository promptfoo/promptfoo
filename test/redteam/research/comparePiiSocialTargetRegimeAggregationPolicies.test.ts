import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialTargetRegimeAggregationPolicies,
  renderPiiSocialTargetRegimeAggregationPoliciesMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialTargetRegimeAggregationPolicies';

describe('comparePiiSocialTargetRegimeAggregationPolicies', () => {
  const outputsByRegime = {
    'hardened-medical-agent': {
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'legacy-generic' as const,
                leakReady: false,
                targetRegime: 'hardened-medical-agent' as const,
              },
            },
          },
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'portfolio' as const,
                leakReady: true,
                targetRegime: 'hardened-medical-agent' as const,
              },
            },
          },
        ],
      },
    },
    'permissive-family': {
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'legacy-generic' as const,
                leakReady: false,
                targetRegime: 'permissive-family' as const,
              },
            },
          },
          {
            success: false,
            testCase: {
              metadata: {
                cohort: 'portfolio' as const,
                leakReady: true,
                targetRegime: 'permissive-family' as const,
              },
            },
          },
        ],
      },
    },
    'permissive-self-recovery': {
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'legacy-generic' as const,
                leakReady: false,
                targetRegime: 'permissive-self-recovery' as const,
              },
            },
          },
          {
            success: false,
            testCase: {
              metadata: {
                cohort: 'portfolio' as const,
                leakReady: true,
                targetRegime: 'permissive-self-recovery' as const,
              },
            },
          },
        ],
      },
    },
  };

  it('compares scalar policies against breadth-first ordering', () => {
    expect(comparePiiSocialTargetRegimeAggregationPolicies(outputsByRegime)).toEqual([
      {
        breadthFirstRank: 4,
        candidate: 'legacy-generic',
        regimesWithAnyFailure: '0/3',
        source: 'observed',
        uniformMeanFailureRate: '0%',
        vulnerableOnlyMeanFailureRate: '0%',
      },
      {
        breadthFirstRank: 1,
        candidate: 'portfolio',
        regimesWithAnyFailure: '2/3',
        source: 'observed',
        uniformMeanFailureRate: '67%',
        vulnerableOnlyMeanFailureRate: '100%',
      },
      {
        breadthFirstRank: 3,
        candidate: 'family-overfit',
        regimesWithAnyFailure: '1/3',
        source: 'stress-profile',
        uniformMeanFailureRate: '33%',
        vulnerableOnlyMeanFailureRate: '50%',
      },
      {
        breadthFirstRank: 2,
        candidate: 'balanced-breadth',
        regimesWithAnyFailure: '2/3',
        source: 'stress-profile',
        uniformMeanFailureRate: '22%',
        vulnerableOnlyMeanFailureRate: '33%',
      },
    ]);
  });

  it('renders a policy comparison table', () => {
    const markdown = renderPiiSocialTargetRegimeAggregationPoliciesMarkdown(
      comparePiiSocialTargetRegimeAggregationPolicies(outputsByRegime),
    );

    expect(markdown).toContain('| portfolio | observed | 67% | 100% | 2/3 | 1 |');
    expect(markdown).toContain('| family-overfit | stress-profile | 33% | 50% | 1/3 | 3 |');
    expect(markdown).toContain('| balanced-breadth | stress-profile | 22% | 33% | 2/3 | 2 |');
  });
});
