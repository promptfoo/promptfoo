import { describe, expect, it } from 'vitest';
import { renderPiiSocialOperatorReport } from '../../../scripts/redteam-research/renderPiiSocialOperatorReport';

describe('renderPiiSocialOperatorReport', () => {
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

  it('renders one operator-facing report from the suite evidence', () => {
    const markdown = renderPiiSocialOperatorReport(outputsByRegime);

    expect(markdown).toContain('# PII Social Operator Report');
    expect(markdown).toContain('- Retain: portfolio');
    expect(markdown).toContain(
      '- Next action queue: legacy-generic -> retire; family-overfit -> expand frontier; balanced-breadth -> increase conversion',
    );
    expect(markdown).toContain('## Frontier');
    expect(markdown).toContain('| portfolio | observed | 1/1 | 2/3 | 67% | yes | - | - | retain |');
    expect(markdown).toContain('## Per-Regime Evidence');
    expect(markdown).toContain('| permissive-self-recovery | portfolio | 1/1 | 1/1 |');
    expect(markdown).toContain('## Known Limitations');
  });
});
