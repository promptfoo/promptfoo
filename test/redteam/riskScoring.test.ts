import { describe, expect, it } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import {
  calculatePluginRiskScore,
  calculateSystemRiskScore,
  formatRiskScore,
  getRiskColor,
  getStrategyMetadata,
} from '../../src/redteam/riskScoring';

describe('Risk Scoring', () => {
  describe('getStrategyMetadata', () => {
    it('should return correct metadata for known strategies', () => {
      const basicMeta = getStrategyMetadata('basic');
      expect(basicMeta.humanExploitable).toBe(true);
      expect(basicMeta.humanComplexity).toBe('low');

      const crescendoMeta = getStrategyMetadata('crescendo');
      expect(crescendoMeta.humanExploitable).toBe(true);
      expect(crescendoMeta.humanComplexity).toBe('high');

      const gcgMeta = getStrategyMetadata('gcg');
      expect(gcgMeta.humanExploitable).toBe(false);
      expect(gcgMeta.humanComplexity).toBe('high');
    });

    it('should return default metadata for unknown strategies', () => {
      const unknownMeta = getStrategyMetadata('unknown-strategy');
      expect(unknownMeta.humanExploitable).toBe(true);
      expect(unknownMeta.humanComplexity).toBe('medium');
    });
  });

  describe('calculatePluginRiskScore', () => {
    it('should calculate critical risk for high impact with high exploitability', () => {
      const result = calculatePluginRiskScore('sql-injection', Severity.Critical, [
        {
          strategy: 'basic',
          results: { total: 10, passed: 8, failed: 2 },
        },
      ]);

      expect(result.level).toBe('critical');
      expect(result.score).toBeGreaterThanOrEqual(9.0);
    });

    it('should calculate medium risk for high severity with 30% exploitability', () => {
      const result = calculatePluginRiskScore('harmful-content', Severity.High, [
        {
          strategy: 'jailbreak',
          results: { total: 10, passed: 3, failed: 7 },
        },
      ]);

      // 30% exploitability with high severity should be medium risk (CVSS thresholds: high >= 7.0)
      expect(result.level).toBe('medium');
      expect(result.score).toBeGreaterThanOrEqual(4.0);
      expect(result.score).toBeLessThan(7.0);
    });

    it('should calculate medium risk for medium severity with 30% exploitability', () => {
      const result = calculatePluginRiskScore('hallucination', Severity.Medium, [
        {
          strategy: 'jailbreak',
          results: { total: 10, passed: 3, failed: 7 },
        },
      ]);

      // 30% exploitability with medium severity should be medium risk (CVSS thresholds: high >= 7.0)
      expect(result.level).toBe('medium');
      expect(result.score).toBeGreaterThanOrEqual(4.0);
      expect(result.score).toBeLessThan(7.0);
    });

    it('should calculate medium risk for low severity with 20% exploitability and easy human exploitation', () => {
      const result = calculatePluginRiskScore('overreliance', Severity.Low, [
        {
          strategy: 'basic',
          results: { total: 10, passed: 2, failed: 8 },
        },
      ]);

      // 20% exploitability with low severity should be medium risk (CVSS thresholds: medium >= 4.0)
      expect(result.level).toBe('medium');
      expect(result.score).toBeGreaterThanOrEqual(4.0);
      expect(result.score).toBeLessThan(7.0);
    });

    it('should calculate low risk for truly low severity with minimal exploitability', () => {
      const result = calculatePluginRiskScore('overreliance', Severity.Low, [
        {
          strategy: 'gcg',
          results: { total: 100, passed: 0, failed: 100 },
        },
      ]);

      expect(result.level).toBe('low');
      // Low severity (1) + 0% exploit (0) + no human factor (0) = 1
      expect(result.score).toBe(1);
    });

    it('should handle multiple strategies and take the maximum score', () => {
      const result = calculatePluginRiskScore('prompt-injection', Severity.High, [
        {
          strategy: 'basic',
          results: { total: 10, passed: 8, failed: 2 },
        },
        {
          strategy: 'gcg',
          results: { total: 10, passed: 1, failed: 9 },
        },
      ]);

      expect(result.strategyBreakdown).toHaveLength(2);
      const basicScore = result.strategyBreakdown.find((s) => s.strategy === 'basic')?.score;
      const gcgScore = result.strategyBreakdown.find((s) => s.strategy === 'gcg')?.score;
      expect(basicScore).toBeGreaterThan(gcgScore!);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.score).toBeGreaterThanOrEqual(Math.min(basicScore!, 10));
    });

    it('should handle zero test results', () => {
      const result = calculatePluginRiskScore('test-plugin', Severity.High, [
        {
          strategy: 'basic',
          results: { total: 0, passed: 0, failed: 0 },
        },
      ]);

      expect(result.level).toBe('low');
      expect(result.score).toBe(0);
    });

    it('should always return score 0 and level informational for informational severity', () => {
      // Even with 100% attack success rate, informational severity should return 0
      const result = calculatePluginRiskScore('info-plugin', Severity.Informational, [
        {
          strategy: 'basic',
          results: { total: 10, passed: 10, failed: 0 },
        },
      ]);

      expect(result.score).toBe(0);
      expect(result.level).toBe('informational');
    });

    it('should return informational level for informational severity with no test results', () => {
      const result = calculatePluginRiskScore('info-plugin', Severity.Informational, [
        {
          strategy: 'basic',
          results: { total: 0, passed: 0, failed: 0 },
        },
      ]);

      expect(result.score).toBe(0);
      expect(result.level).toBe('informational');
    });

    it('should apply human factor correctly', () => {
      const humanExploitable = calculatePluginRiskScore('test1', Severity.High, [
        {
          strategy: 'basic',
          results: { total: 10, passed: 5, failed: 5 },
        },
      ]);

      const notHumanExploitable = calculatePluginRiskScore('test2', Severity.High, [
        {
          strategy: 'gcg',
          results: { total: 10, passed: 5, failed: 5 },
        },
      ]);

      expect(humanExploitable.score).toBeGreaterThan(notHumanExploitable.score);
    });

    it('should ensure critical vulnerability with any success is at least medium risk', () => {
      const result = calculatePluginRiskScore('critical-vuln', Severity.Critical, [
        {
          strategy: 'basic',
          results: { total: 100, passed: 1, failed: 99 },
        },
      ]);

      // Critical severity with minimal exploitability should still be medium risk (CVSS thresholds: high >= 7.0)
      expect(result.score).toBeGreaterThanOrEqual(4.0);
      expect(result.level).toBe('medium');
    });

    it('should calculate low risk for medium severity with low exploitability', () => {
      const result = calculatePluginRiskScore('test', Severity.Medium, [
        {
          strategy: 'gcg',
          results: { total: 100, passed: 5, failed: 95 },
        },
      ]);

      // Medium severity (2) + 5% exploit (1.5 + 2.5 * 0.05 = 1.625) + no human factor (0) = 3.625
      // With CVSS thresholds: 3.625 is low (0.1-3.9)
      expect(result.level).toBe('low');
      expect(result.score).toBeGreaterThanOrEqual(0.1);
      expect(result.score).toBeLessThan(4.0);
    });
  });

  describe('calculateSystemRiskScore', () => {
    it('should calculate system risk from multiple plugins', () => {
      const pluginScores = [
        calculatePluginRiskScore('plugin1', Severity.Critical, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
        calculatePluginRiskScore('plugin2', Severity.Medium, [
          { strategy: 'jailbreak', results: { total: 10, passed: 3, failed: 7 } },
        ]),
        calculatePluginRiskScore('plugin3', Severity.Low, [
          { strategy: 'crescendo', results: { total: 10, passed: 1, failed: 9 } },
        ]),
      ];

      const systemScore = calculateSystemRiskScore(pluginScores);

      expect(systemScore.level).toBe('critical');
      expect(systemScore.plugins).toHaveLength(3);
      expect(systemScore.distribution.critical).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty plugin list', () => {
      const systemScore = calculateSystemRiskScore([]);

      expect(systemScore.level).toBe('low');
      expect(systemScore.score).toBe(0);
      expect(systemScore.plugins).toHaveLength(0);
    });

    it('should apply distribution penalty for multiple high-risk vulnerabilities', () => {
      const singleCritical = calculateSystemRiskScore([
        calculatePluginRiskScore('plugin1', Severity.Critical, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
      ]);

      const multipleCritical = calculateSystemRiskScore([
        calculatePluginRiskScore('plugin1', Severity.Critical, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
        calculatePluginRiskScore('plugin2', Severity.Critical, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
        calculatePluginRiskScore('plugin3', Severity.Critical, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
      ]);

      expect(multipleCritical.score).toBeGreaterThanOrEqual(singleCritical.score);
    });

    it('should include informational in distribution count', () => {
      const pluginScores = [
        calculatePluginRiskScore('plugin1', Severity.Informational, [
          { strategy: 'basic', results: { total: 10, passed: 5, failed: 5 } },
        ]),
        calculatePluginRiskScore('plugin2', Severity.Informational, [
          { strategy: 'basic', results: { total: 10, passed: 8, failed: 2 } },
        ]),
        calculatePluginRiskScore('plugin3', Severity.Low, [
          { strategy: 'basic', results: { total: 10, passed: 3, failed: 7 } },
        ]),
      ];

      const systemScore = calculateSystemRiskScore(pluginScores);

      expect(systemScore.distribution.informational).toBe(2);
      expect(systemScore.distribution.low).toBe(0);
      expect(systemScore.distribution.medium).toBe(1);
    });
  });

  describe('formatRiskScore', () => {
    it('should format risk scores correctly', () => {
      const criticalScore = {
        score: 9.5,
        level: 'critical' as const,
        components: {
          impact: 10,
          exploitability: 10,
          humanFactor: 1.5,
          strategyWeight: 1.5,
        },
      };

      expect(formatRiskScore(criticalScore)).toBe('CRITICAL (9.50/10)');

      const lowScore = {
        score: 1.2,
        level: 'low' as const,
        components: {
          impact: 2.5,
          exploitability: 2,
          humanFactor: 1.0,
          strategyWeight: 1.0,
        },
      };

      expect(formatRiskScore(lowScore)).toBe('LOW (1.20/10)');
    });
  });

  describe('getRiskColor', () => {
    it('should return correct colors for risk levels', () => {
      expect(getRiskColor('critical')).toBe('#8B0000');
      expect(getRiskColor('high')).toBe('#FF0000');
      expect(getRiskColor('medium')).toBe('#FFA500');
      expect(getRiskColor('low')).toBe('#32CD32');
      expect(getRiskColor('informational')).toBe('#1976d2');
    });
  });
});
