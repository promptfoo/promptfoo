import { describe, expect, it } from 'vitest';
import { AdaptiveConcurrency, WARNING_THRESHOLD } from '../../src/scheduler/adaptiveConcurrency';

describe('AdaptiveConcurrency', () => {
  describe('Constructor', () => {
    it('should initialize with initial concurrency value', () => {
      const ac = new AdaptiveConcurrency(10);
      expect(ac.getCurrent()).toBe(10);
      expect(ac.getInitial()).toBe(10);
    });

    it('should use default minimum of 1', () => {
      const ac = new AdaptiveConcurrency(10);
      expect(ac.getMin()).toBe(1);
    });

    it('should accept custom minimum value', () => {
      const ac = new AdaptiveConcurrency(10, 3);
      expect(ac.getMin()).toBe(3);
    });

    it('should enforce minimum of 1 even if lower value provided', () => {
      const ac = new AdaptiveConcurrency(10, 0);
      expect(ac.getMin()).toBe(1);
    });

    it('should clamp min when min >= initial', () => {
      // When min >= initial, min should be clamped to initial
      const ac = new AdaptiveConcurrency(5, 10);
      expect(ac.getCurrent()).toBe(5);
      expect(ac.getMin()).toBe(5); // Clamped to initial
      expect(ac.getInitial()).toBe(5);
    });
  });

  describe('recordSuccess - before threshold', () => {
    it('should not change concurrency before RECOVERY_THRESHOLD', () => {
      const ac = new AdaptiveConcurrency(10);
      // Simulate rate limit to drop concurrency
      ac.recordRateLimit();
      expect(ac.getCurrent()).toBe(5);

      // Record 4 successes (threshold is 5)
      for (let i = 0; i < 4; i++) {
        const result = ac.recordSuccess();
        expect(result.changed).toBe(false);
        expect(result.current).toBe(5);
        expect(result.previous).toBe(5);
        expect(ac.getCurrent()).toBe(5);
      }
    });

    it('should not increase if already at initial value', () => {
      const ac = new AdaptiveConcurrency(10);
      const result = ac.recordSuccess();
      expect(result.changed).toBe(false);
      expect(result.current).toBe(10);
      expect(ac.getCurrent()).toBe(10);
    });
  });

  describe('recordSuccess - increases after threshold', () => {
    it('should increase concurrency after RECOVERY_THRESHOLD successes', () => {
      const ac = new AdaptiveConcurrency(10);
      // Drop to minimum
      ac.recordRateLimit(); // 10 → 5
      ac.recordRateLimit(); // 5 → 2
      expect(ac.getCurrent()).toBe(2);

      // Record 5 successes to trigger recovery
      for (let i = 0; i < 4; i++) {
        const result = ac.recordSuccess();
        expect(result.changed).toBe(false);
      }

      const result = ac.recordSuccess();
      expect(result.changed).toBe(true);
      expect(result.previous).toBe(2);
      // ceil(2 * 1.5) = ceil(3) = 3
      expect(result.current).toBe(3);
      expect(result.reason).toBe('recovery');
      expect(ac.getCurrent()).toBe(3);
    });
  });

  describe('recordSuccess - recovery path verification', () => {
    it('should follow recovery path: 1 → 2 → 3 → 5 → 8 → 10 (25 requests total)', () => {
      const ac = new AdaptiveConcurrency(10, 1);

      // Drop to minimum
      ac.recordRateLimit(); // 10 → 5
      ac.recordRateLimit(); // 5 → 2
      ac.recordRateLimit(); // 2 → 1
      expect(ac.getCurrent()).toBe(1);

      let totalRequests = 0;

      // 1 → 2 (5 successes)
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
        totalRequests++;
      }
      expect(ac.getCurrent()).toBe(2); // ceil(1 * 1.5) = 2

      // 2 → 3 (5 successes)
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
        totalRequests++;
      }
      expect(ac.getCurrent()).toBe(3); // ceil(2 * 1.5) = 3

      // 3 → 5 (5 successes)
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
        totalRequests++;
      }
      expect(ac.getCurrent()).toBe(5); // ceil(3 * 1.5) = ceil(4.5) = 5

      // 5 → 8 (5 successes)
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
        totalRequests++;
      }
      expect(ac.getCurrent()).toBe(8); // ceil(5 * 1.5) = ceil(7.5) = 8

      // 8 → 10 (5 successes, capped at initial)
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
        totalRequests++;
      }
      expect(ac.getCurrent()).toBe(10); // min(ceil(8 * 1.5), 10) = min(12, 10) = 10

      expect(totalRequests).toBe(25);
    });
  });

  describe('recordSuccess - caps at initial value', () => {
    it('should not exceed initial concurrency value', () => {
      const ac = new AdaptiveConcurrency(10);
      // Drop concurrency
      ac.recordRateLimit(); // 10 → 5
      ac.recordRateLimit(); // 5 → 2

      // Recover to initial
      while (ac.getCurrent() < 10) {
        for (let i = 0; i < 5; i++) {
          ac.recordSuccess();
        }
      }
      expect(ac.getCurrent()).toBe(10);

      // Additional successes should not increase beyond initial
      for (let i = 0; i < 10; i++) {
        const result = ac.recordSuccess();
        expect(result.changed).toBe(false);
        expect(ac.getCurrent()).toBe(10);
      }
    });
  });

  describe('recordRateLimit - halves concurrency', () => {
    it('should halve concurrency on rate limit', () => {
      const ac = new AdaptiveConcurrency(10);
      const result = ac.recordRateLimit();

      expect(result.changed).toBe(true);
      expect(result.previous).toBe(10);
      expect(result.current).toBe(5); // floor(10 * 0.5) = 5
      expect(result.reason).toBe('ratelimit');
      expect(ac.getCurrent()).toBe(5);
    });

    it('should handle odd numbers correctly', () => {
      const ac = new AdaptiveConcurrency(9);
      const result = ac.recordRateLimit();

      expect(result.changed).toBe(true);
      expect(result.previous).toBe(9);
      expect(result.current).toBe(4); // floor(9 * 0.5) = floor(4.5) = 4
      expect(ac.getCurrent()).toBe(4);
    });
  });

  describe('recordRateLimit - respects minimum', () => {
    it('should not go below minimum concurrency', () => {
      const ac = new AdaptiveConcurrency(10, 3);

      ac.recordRateLimit(); // 10 → 5
      ac.recordRateLimit(); // 5 → 2, but min is 3
      expect(ac.getCurrent()).toBe(3);

      const result = ac.recordRateLimit(); // stays at 3
      expect(result.changed).toBe(false);
      expect(result.current).toBe(3);
      expect(ac.getCurrent()).toBe(3);
    });

    it('should respect minimum of 1 by default', () => {
      const ac = new AdaptiveConcurrency(4);

      ac.recordRateLimit(); // 4 → 2
      ac.recordRateLimit(); // 2 → 1
      const result = ac.recordRateLimit(); // stays at 1
      expect(result.changed).toBe(false);
      expect(result.current).toBe(1);
    });
  });

  describe('recordRateLimit - resets consecutive successes', () => {
    it('should reset consecutive success counter', () => {
      const ac = new AdaptiveConcurrency(10);
      ac.recordRateLimit(); // 10 → 5

      // Build up 3 consecutive successes
      for (let i = 0; i < 3; i++) {
        ac.recordSuccess();
      }

      // Rate limit should reset counter
      ac.recordRateLimit(); // 5 → 2

      // Now need 5 more successes to trigger recovery
      for (let i = 0; i < 4; i++) {
        const result = ac.recordSuccess();
        expect(result.changed).toBe(false);
      }

      const result = ac.recordSuccess();
      expect(result.changed).toBe(true);
      expect(result.current).toBe(3); // ceil(2 * 1.5) = 3
    });
  });

  describe('recordApproachingLimit - no change above threshold', () => {
    it('should not change concurrency when ratio >= WARNING_THRESHOLD', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(0.15); // 15% > 10%
      expect(result.changed).toBe(false);
      expect(result.current).toBe(10);
      expect(result.reason).toBe('proactive');
      expect(ac.getCurrent()).toBe(10);
    });

    it('should not change when exactly at WARNING_THRESHOLD', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(WARNING_THRESHOLD); // exactly 0.1
      expect(result.changed).toBe(false);
      expect(result.current).toBe(10);
    });
  });

  describe('recordApproachingLimit - linear scaling calculations', () => {
    it('should reduce to ~60% just below 10% remaining', () => {
      const ac = new AdaptiveConcurrency(10);

      // Use value just below threshold (0.1) to trigger reduction
      const result = ac.recordApproachingLimit(0.099);
      // reductionFactor = 0.2 + (0.099 / 0.10) * 0.4 = 0.2 + 0.396 = 0.596
      // floor(10 * 0.596) = floor(5.96) = 5
      expect(result.changed).toBe(true);
      expect(result.previous).toBe(10);
      expect(result.current).toBe(5);
      expect(result.reason).toBe('proactive');
      expect(ac.getCurrent()).toBe(5);
    });

    it('should reduce to ~40% at 5% remaining', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(0.05);
      // reductionFactor = 0.2 + (0.05 / 0.10) * 0.4 = 0.2 + 0.2 = 0.4
      // floor(10 * 0.4) = 4
      expect(result.changed).toBe(true);
      expect(result.previous).toBe(10);
      expect(result.current).toBe(4);
      expect(ac.getCurrent()).toBe(4);
    });

    it('should reduce to ~24% at 1% remaining', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(0.01);
      // reductionFactor = 0.2 + (0.01 / 0.10) * 0.4 = 0.2 + 0.04 = 0.24
      // floor(10 * 0.24) = floor(2.4) = 2
      expect(result.changed).toBe(true);
      expect(result.previous).toBe(10);
      expect(result.current).toBe(2);
      expect(ac.getCurrent()).toBe(2);
    });

    it('should reduce to 20% at 0% remaining', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(0.0);
      // reductionFactor = 0.2 + (0.0 / 0.10) * 0.4 = 0.2
      // floor(10 * 0.2) = 2
      expect(result.changed).toBe(true);
      expect(result.previous).toBe(10);
      expect(result.current).toBe(2);
      expect(ac.getCurrent()).toBe(2);
    });

    it('should verify linear interpolation at 7.5% remaining', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(0.075);
      // reductionFactor = 0.2 + (0.075 / 0.10) * 0.4 = 0.2 + 0.3 = 0.5
      // floor(10 * 0.5) = 5
      expect(result.changed).toBe(true);
      expect(result.current).toBe(5);
    });
  });

  describe('recordApproachingLimit - respects minimum', () => {
    it('should not reduce below minimum concurrency', () => {
      const ac = new AdaptiveConcurrency(10, 5);

      const result = ac.recordApproachingLimit(0.01);
      // Would reduce to floor(10 * 0.24) = 2, but min is 5
      expect(result.changed).toBe(true);
      expect(result.current).toBe(5);
      expect(ac.getCurrent()).toBe(5);
    });

    it('should not change when already at minimum', () => {
      const ac = new AdaptiveConcurrency(10, 5);

      // First reduction brings to minimum
      ac.recordApproachingLimit(0.01);
      expect(ac.getCurrent()).toBe(5);

      // Second reduction should not change
      const result = ac.recordApproachingLimit(0.01);
      expect(result.changed).toBe(false);
      expect(result.current).toBe(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle ratio exactly at threshold boundary', () => {
      const ac = new AdaptiveConcurrency(10);

      // Just above threshold - no change
      const result1 = ac.recordApproachingLimit(0.1000001);
      expect(result1.changed).toBe(false);

      // Just below threshold - should change
      const result2 = ac.recordApproachingLimit(0.0999999);
      expect(result2.changed).toBe(true);
    });

    it('should handle very small initial concurrency', () => {
      const ac = new AdaptiveConcurrency(2, 1);

      const result = ac.recordRateLimit();
      expect(result.current).toBe(1); // floor(2 * 0.5) = 1

      // Recovery
      for (let i = 0; i < 5; i++) {
        ac.recordSuccess();
      }
      expect(ac.getCurrent()).toBe(2); // min(ceil(1 * 1.5), 2) = min(2, 2) = 2
    });

    it('should handle negative ratio gracefully', () => {
      const ac = new AdaptiveConcurrency(10);

      const result = ac.recordApproachingLimit(-0.01);
      // Negative ratios are clamped to 0, so clampedRatio = 0
      expect(result.changed).toBe(true);
      // reductionFactor = 0.2 + (0 / 0.10) * 0.4 = 0.2
      // floor(10 * 0.2) = 2
      expect(result.current).toBe(2);
    });

    it('should handle multiple sequential rate limits', () => {
      const ac = new AdaptiveConcurrency(100, 1);

      const results = [];
      while (ac.getCurrent() > 1) {
        results.push(ac.recordRateLimit());
      }

      // Verify exponential decay
      expect(results[0].current).toBe(50); // 100 → 50
      expect(results[1].current).toBe(25); // 50 → 25
      expect(results[2].current).toBe(12); // 25 → 12
      expect(results[3].current).toBe(6); // 12 → 6
      expect(results[4].current).toBe(3); // 6 → 3
      expect(results[5].current).toBe(1); // 3 → 1
    });
  });
});
