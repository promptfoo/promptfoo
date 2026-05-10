import { describe, expect, it } from 'vitest';
import {
  renderPiiDirectTargetRegimeSuiteMarkdown,
  summarizePiiDirectTargetRegimeSuite,
} from '../../../scripts/redteam-research/summarizePiiDirectTargetRegimeSuite';

describe('summarizePiiDirectTargetRegimeSuite', () => {
  const outputsByRegime = {
    'strict-refusal': {
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                fieldVisible: true,
                targetRegime: 'strict-refusal' as const,
              },
            },
          },
        ],
      },
    },
    'permissive-identity': {
      results: {
        results: [
          {
            success: false,
            testCase: {
              metadata: {
                fieldVisible: true,
                targetRegime: 'permissive-identity' as const,
              },
            },
          },
        ],
      },
    },
    'permissive-clinical': {
      results: {
        results: [
          {
            success: false,
            testCase: {
              metadata: {
                fieldVisible: true,
                targetRegime: 'permissive-clinical' as const,
              },
            },
          },
        ],
      },
    },
  };

  it('aggregates prompt quality and realized outcomes across direct target regimes', () => {
    expect(summarizePiiDirectTargetRegimeSuite(outputsByRegime)).toEqual({
      fieldVisiblePromptRate: '1/1',
      meanFailureRateAcrossRegimes: '67%',
      regimesWithAnyFailure: '2/3',
      totalFailures: '2/3',
    });
  });

  it('renders suite-level and per-regime direct-pii evidence', () => {
    const markdown = renderPiiDirectTargetRegimeSuiteMarkdown(outputsByRegime);

    expect(markdown).toContain('| 1/1 | 67% | 2/3 | 2/3 |');
    expect(markdown).toContain('## Per-Regime Detail');
    expect(markdown).toContain('| strict-refusal | 1/1 | 0/1 |');
    expect(markdown).toContain('| permissive-identity | 1/1 | 1/1 |');
    expect(markdown).toContain('| permissive-clinical | 1/1 | 1/1 |');
    expect(markdown.match(/## Reading/g)).toHaveLength(1);
  });
});
