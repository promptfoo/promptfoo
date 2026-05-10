import { describe, expect, it } from 'vitest';
import {
  renderPiiSocialTargetRegimeParetoFrontier,
  renderPiiSocialTargetRegimeParetoFrontierMarkdown,
} from '../../../scripts/redteam-research/renderPiiSocialTargetRegimeParetoFrontier';

describe('renderPiiSocialTargetRegimeParetoFrontier', () => {
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

  it('keeps only nondominated candidates on the frontier', () => {
    expect(renderPiiSocialTargetRegimeParetoFrontier(outputsByRegime)).toEqual([
      {
        candidate: 'legacy-generic',
        dominatedBy: ['portfolio', 'family-overfit', 'balanced-breadth'],
        dominanceGap: 'leak-ready +100pp, breadth +2, yield +67pp',
        leakReadyPromptRate: '0/1',
        meanFailureRateAcrossRegimes: '0%',
        onFrontier: false,
        recommendation: 'retire',
        regimesWithAnyFailure: '0/3',
        source: 'observed',
      },
      {
        candidate: 'portfolio',
        dominatedBy: [],
        dominanceGap: '-',
        leakReadyPromptRate: '1/1',
        meanFailureRateAcrossRegimes: '67%',
        onFrontier: true,
        recommendation: 'retain',
        regimesWithAnyFailure: '2/3',
        source: 'observed',
      },
      {
        candidate: 'family-overfit',
        dominatedBy: ['portfolio'],
        dominanceGap: 'breadth +1, yield +33pp',
        leakReadyPromptRate: '6/6',
        meanFailureRateAcrossRegimes: '33%',
        onFrontier: false,
        recommendation: 'expand frontier',
        regimesWithAnyFailure: '1/3',
        source: 'stress-profile',
      },
      {
        candidate: 'balanced-breadth',
        dominatedBy: ['portfolio'],
        dominanceGap: 'yield +44pp',
        leakReadyPromptRate: '6/6',
        meanFailureRateAcrossRegimes: '22%',
        onFrontier: false,
        recommendation: 'increase conversion',
        regimesWithAnyFailure: '2/3',
        source: 'stress-profile',
      },
    ]);
  });

  it('renders the dominance relation explicitly', () => {
    const markdown = renderPiiSocialTargetRegimeParetoFrontierMarkdown(
      renderPiiSocialTargetRegimeParetoFrontier(outputsByRegime),
    );

    expect(markdown).toContain('| portfolio | observed | 1/1 | 2/3 | 67% | yes | - | - | retain |');
    expect(markdown).toContain(
      '| family-overfit | stress-profile | 6/6 | 1/3 | 33% | no | portfolio | breadth +1, yield +33pp | expand frontier |',
    );
  });
});
