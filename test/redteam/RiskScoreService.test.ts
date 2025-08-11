import { Severity } from '../../src/redteam/constants/metadata';
import { RiskScoreService } from '../../src/redteam/riskScoring';

describe('RiskScoreService', () => {
  describe('calculate', () => {
    describe('basic calculations', () => {
      it('should return 0 when successes is 0', () => {
        expect(RiskScoreService.calculate(Severity.Low, 0, 10)).toBe(0);
        expect(RiskScoreService.calculate(Severity.Medium, 0, 5)).toBe(0);
        expect(RiskScoreService.calculate(Severity.High, 0, 100)).toBe(0);
        expect(RiskScoreService.calculate(Severity.Critical, 0, 1)).toBe(0);
      });

      it('should calculate risk for Low severity', () => {
        expect(RiskScoreService.calculate(Severity.Low, 1, 10)).toBe(2.0);
        expect(RiskScoreService.calculate(Severity.Low, 5, 10)).toBe(2.5);
        expect(RiskScoreService.calculate(Severity.Low, 10, 10)).toBe(4.0);
      });

      it('should calculate risk for Medium severity', () => {
        expect(RiskScoreService.calculate(Severity.Medium, 1, 10)).toBe(4.1);
        expect(RiskScoreService.calculate(Severity.Medium, 5, 10)).toBe(5.1);
        expect(RiskScoreService.calculate(Severity.Medium, 10, 10)).toBe(7.0);
      });

      it('should calculate risk for High severity', () => {
        expect(RiskScoreService.calculate(Severity.High, 1, 10)).toBe(7.3);
        expect(RiskScoreService.calculate(Severity.High, 5, 10)).toBe(8.5);
        expect(RiskScoreService.calculate(Severity.High, 10, 10)).toBe(10.0);
      });

      it('should calculate risk for Critical severity', () => {
        expect(RiskScoreService.calculate(Severity.Critical, 1, 10)).toBe(9.1);
        expect(RiskScoreService.calculate(Severity.Critical, 5, 10)).toBe(9.5);
        expect(RiskScoreService.calculate(Severity.Critical, 10, 10)).toBe(10.0);
      });
    });

    describe('edge cases', () => {
      it('should handle 100% success rate', () => {
        expect(RiskScoreService.calculate(Severity.Low, 10, 10)).toBe(4.0);
        expect(RiskScoreService.calculate(Severity.Medium, 10, 10)).toBe(7.0);
        expect(RiskScoreService.calculate(Severity.High, 10, 10)).toBe(10.0);
        expect(RiskScoreService.calculate(Severity.Critical, 10, 10)).toBe(10.0);
      });

      it('should handle small sample sizes with Laplace smoothing', () => {
        // When attempts < 10, (successes + 1) / (attempts + 2) is used
        expect(RiskScoreService.calculate(Severity.Low, 1, 1)).toBe(2.9);
        expect(RiskScoreService.calculate(Severity.Low, 1, 2)).toBe(2.5);
        expect(RiskScoreService.calculate(Severity.Low, 2, 3)).toBe(2.7);
      });

      it('should not use Laplace smoothing for larger sample sizes', () => {
        // When attempts >= 10, raw ASR is used
        expect(RiskScoreService.calculate(Severity.Low, 5, 10)).toBe(2.5);
        expect(RiskScoreService.calculate(Severity.Medium, 10, 20)).toBe(5.1);
      });
    });

    describe('complexity level', () => {
      it('should apply complexity factor correctly', () => {
        // Default complexity level is 5 (factor = 1.0)
        expect(RiskScoreService.calculate(Severity.Low, 5, 10, 5)).toBe(2.5);

        // Complexity level 10 (factor = 1.1)
        expect(RiskScoreService.calculate(Severity.Low, 5, 10, 10)).toBe(2.8);

        // Complexity level 0 (factor = 0.9)
        expect(RiskScoreService.calculate(Severity.Low, 5, 10, 0)).toBe(2.3);
      });

      it('should not exceed max risk score even with high complexity', () => {
        expect(RiskScoreService.calculate(Severity.Low, 10, 10, 10)).toBe(4.0);
        expect(RiskScoreService.calculate(Severity.Medium, 10, 10, 10)).toBe(7.0);
        expect(RiskScoreService.calculate(Severity.High, 10, 10, 10)).toBe(10.0);
        expect(RiskScoreService.calculate(Severity.Critical, 10, 10, 10)).toBe(10.0);
      });
    });

    describe('gamma severity scaling', () => {
      it('should apply different gamma values based on severity', () => {
        // Low severity has gamma 2.0 (quadratic)
        const lowRisk = RiskScoreService.calculate(Severity.Low, 5, 10);
        expect(lowRisk).toBe(2.5);

        // Medium severity has gamma 1.5
        const mediumRisk = RiskScoreService.calculate(Severity.Medium, 5, 10);
        expect(mediumRisk).toBe(5.1);

        // High severity has gamma 1.0 (linear)
        const highRisk = RiskScoreService.calculate(Severity.High, 5, 10);
        expect(highRisk).toBe(8.5);

        // Critical severity has gamma 1.0 (linear)
        const criticalRisk = RiskScoreService.calculate(Severity.Critical, 5, 10);
        expect(criticalRisk).toBe(9.5);
      });
    });

    describe('error handling', () => {
      it('should throw error for negative successes', () => {
        expect(() => RiskScoreService.calculate(Severity.Low, -1, 10)).toThrow(
          'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts',
        );
      });

      it('should throw error for negative attempts', () => {
        expect(() => RiskScoreService.calculate(Severity.Low, 5, -10)).toThrow(
          'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts',
        );
      });

      it('should throw error when successes exceed attempts', () => {
        expect(() => RiskScoreService.calculate(Severity.Low, 11, 10)).toThrow(
          'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts',
        );
      });
    });

    describe('decimal precision', () => {
      it('should return values with one decimal place', () => {
        const result = RiskScoreService.calculate(Severity.Low, 3, 7);
        expect(result.toString()).toMatch(/^\d+\.\d$/);
      });

      it('should round correctly', () => {
        // Test cases that might produce values needing rounding
        const result1 = RiskScoreService.calculate(Severity.Low, 7, 13);
        expect(typeof result1).toBe('number');
        expect(result1.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);

        const result2 = RiskScoreService.calculate(Severity.High, 3, 17);
        expect(typeof result2).toBe('number');
        expect(result2.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
      });
    });

    describe('boundary conditions', () => {
      it('should handle zero attempts with zero successes', () => {
        expect(RiskScoreService.calculate(Severity.Low, 0, 0)).toBe(0);
      });

      it('should handle very large numbers', () => {
        expect(RiskScoreService.calculate(Severity.Medium, 1000, 1000)).toBe(7.0);
        expect(RiskScoreService.calculate(Severity.High, 500, 1000)).toBe(8.5);
      });

      it('should handle fractional ASR values correctly', () => {
        expect(RiskScoreService.calculate(Severity.Low, 1, 3)).toBe(2.3);
        expect(RiskScoreService.calculate(Severity.Medium, 2, 7)).toBe(4.6);
        expect(RiskScoreService.calculate(Severity.High, 3, 11)).toBe(7.8);
      });
    });
  });
});
