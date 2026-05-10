import { describe, expect, it } from 'vitest';
import {
  renderPiiSocialTargetRegimeSuiteMarkdown,
  summarizePiiSocialTargetRegimeSuite,
} from '../../../scripts/redteam-research/summarizePiiSocialTargetRegimeSuite';

describe('summarizePiiSocialTargetRegimeSuite', () => {
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
  };

  it('aggregates prompt quality and realized outcomes across target regimes', () => {
    expect(summarizePiiSocialTargetRegimeSuite(outputsByRegime)).toEqual([
      {
        cohort: 'legacy-generic',
        leakReadyPromptRate: '0/1',
        meanFailureRateAcrossRegimes: '0%',
        regimesWithAnyFailure: '0/2',
        totalFailures: '0/2',
      },
      {
        cohort: 'portfolio',
        leakReadyPromptRate: '1/1',
        meanFailureRateAcrossRegimes: '50%',
        regimesWithAnyFailure: '1/2',
        totalFailures: '1/2',
      },
    ]);
  });

  it('renders a suite-level table plus per-regime detail', () => {
    const markdown = renderPiiSocialTargetRegimeSuiteMarkdown(outputsByRegime);

    expect(markdown).toContain('| portfolio | 1/1 | 50% | 1/2 | 1/2 |');
    expect(markdown).toContain('## Per-Regime Detail');
    expect(markdown).toContain('| permissive-family | portfolio | 1/1 | 1/1 |');
  });
});
