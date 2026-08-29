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

  describe('Latency-Gradient AIMD Congestion Control', () => {
    it('should track minLatency and calculate EMA latency correctly', () => {
      const ac = new AdaptiveConcurrency(10, 1, { alpha: 0.2 });

      expect(ac.getEmaLatency()).toBeNull();
      expect(ac.getMinLatency()).toBe(0);
      expect(ac.getLatencyGradient()).toBeNull();

      // First request: 100ms
      ac.recordSuccess(100);
      expect(ac.getMinLatency()).toBe(100);
      expect(ac.getEmaLatency()).toBe(100);
      expect(ac.getLatencyGradient()).toBe(1);

      // Second request: 200ms -> EMA = 0.2 * 200 + 0.8 * 100 = 120ms
      ac.recordSuccess(200);
      expect(ac.getMinLatency()).toBe(100);
      expect(ac.getEmaLatency()).toBeCloseTo(120, 2);
      expect(ac.getLatencyGradient()).toBeCloseTo(1.2, 2);
    });

    it('should proactively throttle when latency gradient exceeds threshold', () => {
      const ac = new AdaptiveConcurrency(10, 1, {
        alpha: 0.5,
        gradientThreshold: 1.5,
        latencyBackoffFactor: 0.8,
      });

      // Establish baseline at 100ms
      ac.recordSuccess(100);
      expect(ac.getCurrent()).toBe(10);
      expect(ac.getMinLatency()).toBe(100);

      // Stable request at 110ms (EMA = 0.5*110 + 0.5*100 = 105, G = 1.05 <= 1.5)
      const res1 = ac.recordSuccess(110);
      expect(res1.changed).toBe(false);
      expect(ac.getCurrent()).toBe(10);

      // Severe latency spike to 400ms (EMA = 0.5*400 + 0.5*105 = 252.5, G = 2.525 > 1.5)
      const res2 = ac.recordSuccess(400);
      expect(res2.changed).toBe(true);
      expect(res2.reason).toBe('proactive');
      expect(res2.previous).toBe(10);
      expect(res2.current).toBe(8); // floor(10 * 0.8) = 8
      expect(ac.getCurrent()).toBe(8);
    });

    it('should not throttle below minConcurrency on latency gradient spike', () => {
      const ac = new AdaptiveConcurrency(2, 2, {
        alpha: 0.5,
        gradientThreshold: 1.5,
      });

      ac.recordSuccess(100);
      // High latency spike
      const res = ac.recordSuccess(500);
      expect(res.changed).toBe(false);
      expect(ac.getCurrent()).toBe(2); // Clamped at min
    });

    it('should recover normally when latency gradient is within threshold', () => {
      const ac = new AdaptiveConcurrency(10, 1);
      ac.recordRateLimit(); // 10 -> 5
      expect(ac.getCurrent()).toBe(5);

      // 5 successes with stable 100ms latency
      for (let i = 0; i < 4; i++) {
        const res = ac.recordSuccess(100);
        expect(res.changed).toBe(false);
      }
      const res5 = ac.recordSuccess(100);
      expect(res5.changed).toBe(true);
      expect(res5.reason).toBe('recovery');
      expect(res5.current).toBe(8); // ceil(5 * 1.5) = 8
    });

    it('should expire older baseline minimums as new latencies arrive in sliding window', () => {
      // Window size of 3
      const ac = new AdaptiveConcurrency(10, 1, {
        alpha: 0.5,
        gradientThreshold: 1.5,
        baselineWindowSize: 3,
      });

      // Old baseline: 100ms
      ac.recordSuccess(100);
      expect(ac.getMinLatency()).toBe(100);

      // Workload shifts to 200ms
      ac.recordSuccess(200);
      ac.recordSuccess(200);
      // 100ms sample is still in the 3-sample window ([100, 200, 200])
      expect(ac.getMinLatency()).toBe(100);

      // 4th request: 100ms sample is pushed out of the 3-sample window ([200, 200, 200])
      ac.recordSuccess(200);
      expect(ac.getMinLatency()).toBe(200);
      expect(ac.getEmaLatency()).toBeCloseTo(200, 1);
      expect(ac.getLatencyGradient()).toBeCloseTo(1.0, 1);
    });
  });
});
