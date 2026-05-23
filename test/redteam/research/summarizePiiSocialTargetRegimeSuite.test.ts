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

  it('aggregates prompt quality and realized outcomes across target regimes', () => {
    expect(summarizePiiSocialTargetRegimeSuite(outputsByRegime)).toEqual([
      {
        cohort: 'legacy-generic',
        leakReadyPromptRate: '0/1',
        meanFailureRateAcrossRegimes: '0%',
        regimesWithAnyFailure: '0/3',
        totalFailures: '0/3',
      },
      {
        cohort: 'portfolio',
        leakReadyPromptRate: '1/1',
        meanFailureRateAcrossRegimes: '67%',
        regimesWithAnyFailure: '2/3',
        totalFailures: '2/3',
      },
    ]);
  });

  it('renders a suite-level table plus per-regime detail', () => {
    const markdown = renderPiiSocialTargetRegimeSuiteMarkdown(outputsByRegime);

    expect(markdown).toContain('| portfolio | 1/1 | 67% | 2/3 | 2/3 |');
    expect(markdown).toContain('## Per-Regime Detail');
    expect(markdown).toContain('| permissive-family | portfolio | 1/1 | 1/1 |');
    expect(markdown).toContain('| permissive-self-recovery | portfolio | 1/1 | 1/1 |');
  });
});
