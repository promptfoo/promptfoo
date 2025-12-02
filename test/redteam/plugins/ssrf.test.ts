import { describe, expect, it } from 'vitest';
import { SsrfGrader, type SsrfSeverity } from '../../../src/redteam/plugins/ssrf';

describe('SsrfGrader', () => {
  const grader = new SsrfGrader();

  describe('rubric content', () => {
    it('should have severity tiers defined in rubric', () => {
      expect(grader.rubric).toContain('critical');
      expect(grader.rubric).toContain('high');
      expect(grader.rubric).toContain('medium');
      expect(grader.rubric).toContain('low');
      expect(grader.rubric).toContain('none');
    });

    it('should define credentials as critical severity', () => {
      expect(grader.rubric).toContain('API keys');
      expect(grader.rubric).toContain('password');
      expect(grader.rubric).toContain('token');
    });

    it('should define network info as medium severity', () => {
      expect(grader.rubric).toContain('Internal IP addresses');
      expect(grader.rubric).toContain('Internal hostnames');
    });

    it('should request severity in reason output', () => {
      expect(grader.rubric).toContain('severity:');
      expect(grader.rubric).toContain('critical|high|medium|low|none');
    });
  });

  describe('suggestions', () => {
    it('should return mitigation suggestions', () => {
      const suggestions = grader.getSuggestions({
        rawPrompt: 'test prompt',
        renderedValue: undefined,
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('ssrf-mitigation');
      expect(suggestions[0].value).toContain('SSRF Mitigation Tips');
      expect(suggestions[0].value).toContain('allow-list');
    });
  });

  describe('plugin id', () => {
    it('should have correct plugin id', () => {
      expect(grader.id).toBe('promptfoo:redteam:ssrf');
    });
  });
});

describe('SSRF severity threshold logic', () => {
  const SEVERITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'] as const;

  function severityMeetsThreshold(detected: SsrfSeverity, threshold: SsrfSeverity): boolean {
    if (detected === 'none') {
      return false;
    }
    const detectedIndex = SEVERITY_ORDER.indexOf(detected);
    const thresholdIndex = SEVERITY_ORDER.indexOf(threshold);
    return detectedIndex >= thresholdIndex;
  }

  describe('none severity always passes', () => {
    it.each([
      'low',
      'medium',
      'high',
      'critical',
    ] as SsrfSeverity[])('none does not meet threshold %s', (threshold) => {
      expect(severityMeetsThreshold('none', threshold)).toBe(false);
    });
  });

  describe('threshold: low', () => {
    it.each([
      { detected: 'low' as SsrfSeverity, expected: true },
      { detected: 'medium' as SsrfSeverity, expected: true },
      { detected: 'high' as SsrfSeverity, expected: true },
      { detected: 'critical' as SsrfSeverity, expected: true },
    ])('$detected meets threshold low: $expected', ({ detected, expected }) => {
      expect(severityMeetsThreshold(detected, 'low')).toBe(expected);
    });
  });

  describe('threshold: medium', () => {
    it.each([
      { detected: 'low' as SsrfSeverity, expected: false },
      { detected: 'medium' as SsrfSeverity, expected: true },
      { detected: 'high' as SsrfSeverity, expected: true },
      { detected: 'critical' as SsrfSeverity, expected: true },
    ])('$detected meets threshold medium: $expected', ({ detected, expected }) => {
      expect(severityMeetsThreshold(detected, 'medium')).toBe(expected);
    });
  });

  describe('threshold: high', () => {
    it.each([
      { detected: 'low' as SsrfSeverity, expected: false },
      { detected: 'medium' as SsrfSeverity, expected: false },
      { detected: 'high' as SsrfSeverity, expected: true },
      { detected: 'critical' as SsrfSeverity, expected: true },
    ])('$detected meets threshold high: $expected', ({ detected, expected }) => {
      expect(severityMeetsThreshold(detected, 'high')).toBe(expected);
    });
  });

  describe('threshold: critical', () => {
    it.each([
      { detected: 'low' as SsrfSeverity, expected: false },
      { detected: 'medium' as SsrfSeverity, expected: false },
      { detected: 'high' as SsrfSeverity, expected: false },
      { detected: 'critical' as SsrfSeverity, expected: true },
    ])('$detected meets threshold critical: $expected', ({ detected, expected }) => {
      expect(severityMeetsThreshold(detected, 'critical')).toBe(expected);
    });
  });
});
