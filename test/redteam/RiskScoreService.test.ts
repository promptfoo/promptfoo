import { Severity } from '../../src/redteam/constants/metadata';
import { Strategy } from '../../src/redteam/constants';
import { RiskScoreService } from '../../src/redteam/riskScoring';

describe('RiskScoreService', () => {
  describe('calculate', () => {
    describe('basic calculations', () => {
      it('should return 0 when successes is 0', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 0,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBe(0);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 0,
            attempts: 5,
            strategy: 'basic' as Strategy,
          }),
        ).toBe(0);
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 0,
            attempts: 100,
            strategy: 'basic' as Strategy,
          }),
        ).toBe(0);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 0,
            attempts: 1,
            strategy: 'basic' as Strategy,
          }),
        ).toBe(0);
      });

      it('should calculate risk for Low severity', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 1,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.2, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 5,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(1.6, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(4.4, 1);
      });

      it('should calculate risk for Medium severity', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 1,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.3, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 5,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(2.3, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(6.3, 1);
      });

      it('should calculate risk for High severity', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 1,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.3, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 5,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(3.0, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(8.2, 1);
      });

      it('should calculate risk for Critical severity', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 1,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.4, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 5,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(3.5, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(9.7, 1);
      });
    });

    describe('edge cases', () => {
      it('should handle 100% success rate', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(4.4, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(6.3, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(8.2, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 10,
            attempts: 10,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(9.7, 1);
      });

      it('should handle small success rates', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 1,
            attempts: 100,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.2, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.Medium,
            successes: 1,
            attempts: 100,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.3, 1);
        expect(
          RiskScoreService.calculate({
            severity: Severity.High,
            successes: 1,
            attempts: 100,
            strategy: 'basic' as Strategy,
          }),
        ).toBeCloseTo(0.3, 1);
      });
    });

    describe('strategy complexity', () => {
      it('should apply lower multiplier for basic/simple strategies', () => {
        const basicScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'basic' as Strategy,
        });
        const leetScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'leetspeak' as Strategy,
        });

        // Basic and leetspeak are both low complexity, should have same multiplier
        expect(basicScore).toBeCloseTo(leetScore, 1);
      });

      it('should apply lower score for complex strategies', () => {
        const basicScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'basic' as Strategy,
        });
        const jailbreakScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'jailbreak' as Strategy,
        });

        // Jailbreak is high complexity, should have lower score
        expect(jailbreakScore).toBeLessThan(basicScore);
      });

      it('should apply lowest score for non-human exploitable strategies', () => {
        const basicScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'basic' as Strategy,
        });
        const gcgScore = RiskScoreService.calculate({
          severity: Severity.High,
          successes: 5,
          attempts: 10,
          strategy: 'gcg' as Strategy,
        });

        // GCG is not human exploitable, should have lowest score
        expect(gcgScore).toBeLessThan(basicScore);
      });
    });

    describe('boundary conditions', () => {
      it('should handle zero attempts with zero successes', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Low,
            successes: 0,
            attempts: 0,
            strategy: 'basic' as Strategy,
          }),
        ).toBe(0);
      });

      it('should cap score at 10', () => {
        expect(
          RiskScoreService.calculate({
            severity: Severity.Critical,
            successes: 1000,
            attempts: 1000,
            strategy: 'basic' as Strategy,
          }),
        ).toBeLessThanOrEqual(10);
      });
    });
  });
});
