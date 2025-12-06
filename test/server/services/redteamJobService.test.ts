import { describe, it, expect } from 'vitest';
import {
  classifyVulnerabilitySeverity,
  createVulnerabilityEvent,
  isVulnerability,
  extractPluginId,
} from '../../../src/server/services/redteamJobService';
import type { EvaluateResult } from '../../../src/types';

describe('redteamJobService', () => {
  describe('classifyVulnerabilitySeverity', () => {
    it('should classify sql-injection as critical', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:sql-injection')).toBe('critical');
    });

    it('should classify shell-injection as critical', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:shell-injection')).toBe('critical');
    });

    it('should classify ssrf as critical', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:ssrf')).toBe('critical');
    });

    it('should classify rbac as critical', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:rbac')).toBe('critical');
    });

    it('should classify pii as high', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:pii:direct')).toBe('high');
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:pii:social')).toBe('high');
    });

    it('should classify harmful as medium', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:harmful:violent-crime')).toBe(
        'medium',
      );
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:harmful:hate')).toBe('medium');
    });

    it('should classify jailbreak as medium', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:jailbreak')).toBe('medium');
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:jailbreak:composite')).toBe('medium');
    });

    it('should classify hallucination as low', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:hallucination')).toBe('low');
    });

    it('should classify competitors as low', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:competitors')).toBe('low');
    });

    it('should classify unknown plugins as medium', () => {
      expect(classifyVulnerabilitySeverity('promptfoo:redteam:unknown-plugin')).toBe('medium');
    });

    it('should classify non-redteam plugins as medium', () => {
      expect(classifyVulnerabilitySeverity('some-other-plugin')).toBe('medium');
    });
  });

  describe('extractPluginId', () => {
    const createMockResult = (
      assertionType: string,
      pass: boolean = false,
    ): EvaluateResult => ({
      prompt: { raw: 'test', label: 'test' },
      vars: {},
      response: { output: 'test output' },
      success: !pass,
      score: pass ? 1 : 0.2,
      namedScores: {},
      latencyMs: 100,
      gradingResult: {
        pass,
        score: pass ? 1 : 0.2,
        componentResults: [
          {
            pass,
            score: pass ? 1 : 0.2,
            reason: pass ? 'Passed' : 'Failed',
            assertion: {
              type: assertionType as any,
            },
          },
        ],
      },
    });

    it('should extract plugin ID from failing assertion', () => {
      const result = createMockResult('promptfoo:redteam:sql-injection', false);
      expect(extractPluginId(result)).toBe('promptfoo:redteam:sql-injection');
    });

    it('should return undefined for passing assertions', () => {
      const result = createMockResult('promptfoo:redteam:sql-injection', true);
      expect(extractPluginId(result)).toBeUndefined();
    });

    it('should return undefined for non-redteam assertions', () => {
      const result = createMockResult('equals', false);
      expect(extractPluginId(result)).toBeUndefined();
    });
  });

  describe('isVulnerability', () => {
    const createMockResult = (
      assertionType: string,
      pass: boolean,
      score: number = pass ? 1 : 0.2,
    ): EvaluateResult => ({
      prompt: { raw: 'test', label: 'test' },
      vars: {},
      response: { output: 'test output' },
      success: pass,
      score,
      namedScores: {},
      latencyMs: 100,
      gradingResult: {
        pass,
        score,
        componentResults: [
          {
            pass,
            score,
            reason: pass ? 'Passed' : 'Vulnerability detected',
            assertion: {
              type: assertionType as any,
            },
          },
        ],
      },
    });

    it('should return true for failed redteam assertion with low score', () => {
      const result = createMockResult('promptfoo:redteam:sql-injection', false, 0.2);
      expect(isVulnerability(result)).toBe(true);
    });

    it('should return false for passed assertion', () => {
      const result = createMockResult('promptfoo:redteam:sql-injection', true, 1);
      expect(isVulnerability(result)).toBe(false);
    });

    it('should return false for high score even if failed', () => {
      const result = createMockResult('promptfoo:redteam:sql-injection', false, 0.8);
      expect(isVulnerability(result)).toBe(false);
    });

    it('should return false for non-redteam assertion', () => {
      const result = createMockResult('equals', false, 0.2);
      expect(isVulnerability(result)).toBe(false);
    });

    it('should return false when no component results', () => {
      const result: EvaluateResult = {
        prompt: { raw: 'test', label: 'test' },
        vars: {},
        response: { output: 'test' },
        success: false,
        score: 0.2,
        namedScores: {},
        latencyMs: 100,
        gradingResult: {
          pass: false,
          score: 0.2,
        },
      };
      expect(isVulnerability(result)).toBe(false);
    });
  });

  describe('createVulnerabilityEvent', () => {
    const createMockResult = (overrides: Partial<EvaluateResult> = {}): EvaluateResult => ({
      prompt: {
        raw: 'Test prompt',
        label: 'Test',
      },
      vars: {},
      response: {
        output: 'Test output',
      },
      success: false,
      score: 0.15,
      namedScores: {},
      latencyMs: 100,
      gradingResult: {
        pass: false,
        score: 0.15,
        componentResults: [
          {
            pass: false,
            score: 0.15,
            reason: 'Vulnerability detected',
            assertion: {
              type: 'promptfoo:redteam:sql-injection' as any,
            },
          },
        ],
      },
      ...overrides,
    });

    it('should create vulnerability event with correct fields', () => {
      const result = createMockResult();
      const event = createVulnerabilityEvent(result, 5);

      expect(event).toBeDefined();
      expect(event?.pluginId).toBe('promptfoo:redteam:sql-injection');
      expect(event?.severity).toBe('critical');
      expect(event?.prompt).toBe('Test prompt');
      expect(event?.output).toBe('Test output');
      expect(event?.testIndex).toBe(5);
      expect(event?.score).toBe(0.15);
      expect(event?.id).toBeDefined();
      expect(event?.timestamp).toBeDefined();
    });

    it('should extract plugin name from ID', () => {
      const result = createMockResult({
        gradingResult: {
          pass: false,
          score: 0.1,
          componentResults: [
            {
              pass: false,
              score: 0.1,
              reason: 'Detected',
              assertion: {
                type: 'promptfoo:redteam:pii:direct' as any,
              },
            },
          ],
        },
      });
      const event = createVulnerabilityEvent(result, 0);

      expect(event?.pluginName).toBe('Direct PII Disclosure');
    });

    it('should include strategy info when present in vars', () => {
      const result = createMockResult({
        vars: {
          __strategy: 'jailbreak',
        },
      });
      const event = createVulnerabilityEvent(result, 0);

      expect(event?.strategyId).toBe('jailbreak');
      expect(event?.strategyName).toBe('Jailbreak');
    });

    it('should return undefined for non-vulnerability results', () => {
      const result = createMockResult({
        success: true,
        score: 1,
        gradingResult: {
          pass: true,
          score: 1,
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Passed',
              assertion: {
                type: 'promptfoo:redteam:sql-injection' as any,
              },
            },
          ],
        },
      });
      const event = createVulnerabilityEvent(result, 0);

      expect(event).toBeUndefined();
    });

    it('should handle array output', () => {
      const result = createMockResult({
        response: {
          output: ['line 1', 'line 2'],
        },
      });
      const event = createVulnerabilityEvent(result, 0);

      expect(event?.output).toBe('["line 1","line 2"]');
    });

    it('should handle object output', () => {
      const result = createMockResult({
        response: {
          output: { message: 'test' },
        },
      });
      const event = createVulnerabilityEvent(result, 0);

      expect(event?.output).toBe('{"message":"test"}');
    });
  });
});
