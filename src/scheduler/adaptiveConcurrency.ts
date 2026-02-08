const DEFAULT_MIN_CONCURRENCY = 1;
const BACKOFF_FACTOR = 0.5; // Halve on rate limit
const RECOVERY_FACTOR = 1.5; // +50% on recovery
const RECOVERY_THRESHOLD = 5; // Successes before recovery
const WARNING_THRESHOLD = 0.1; // 10% remaining triggers proactive reduction

// Export for use in other modules
export { WARNING_THRESHOLD };

export interface ConcurrencyChangeResult {
  changed: boolean;
  previous: number;
  current: number;
  reason: 'recovery' | 'ratelimit' | 'proactive';
}

/**
 * Manages adaptive concurrency based on rate limit feedback.
 *
 * Recovery path with constants (initial=10, min=1):
 * 1 → ceil(1.5) = 2   (5 successes)
 * 2 → ceil(3.0) = 3   (5 successes)
 * 3 → ceil(4.5) = 5   (5 successes)
 * 5 → ceil(7.5) = 8   (5 successes)
 * 8 → ceil(12) = 10   (5 successes, capped at initial)
 *
 * Total: 25 requests to fully recover from min=1 to initial=10
 */
export class AdaptiveConcurrency {
  private current: number;
  private readonly initial: number;
  private readonly min: number;
  private consecutiveSuccesses = 0;

  constructor(initial: number, min: number = DEFAULT_MIN_CONCURRENCY) {
    this.initial = initial;
    this.current = initial;
    // Clamp min to be at least 1 and at most initial
    this.min = Math.min(initial, Math.max(1, min));
  }

  /**
   * Called on successful request.
   * May increase concurrency after sustained success.
   */
  recordSuccess(): ConcurrencyChangeResult {
    this.consecutiveSuccesses++;

    // Check if we should recover
    if (this.consecutiveSuccesses >= RECOVERY_THRESHOLD && this.current < this.initial) {
      const previous = this.current;
      this.current = Math.min(this.initial, Math.ceil(this.current * RECOVERY_FACTOR));
      this.consecutiveSuccesses = 0;

      return {
        changed: previous !== this.current,
        previous,
        current: this.current,
        reason: 'recovery',
      };
    }

    return {
      changed: false,
      previous: this.current,
      current: this.current,
      reason: 'recovery',
    };
  }

  /**
   * Called on rate limit (429).
   * Reduces concurrency immediately.
   */
  recordRateLimit(): ConcurrencyChangeResult {
    this.consecutiveSuccesses = 0;

    const previous = this.current;
    this.current = Math.max(this.min, Math.floor(this.current * BACKOFF_FACTOR));

    return {
      changed: previous !== this.current,
      previous,
      current: this.current,
      reason: 'ratelimit',
    };
  }

  /**
   * Called when approaching rate limit.
   * Proactively reduces concurrency based on remaining ratio.
   *
   * Formula:
   * - At 10% remaining: reduce to 60% of current
   * - At 5% remaining: reduce to 40% of current
   * - At 1% remaining: reduce to 20% of current
   *
   * Linear scaling: reductionFactor = 0.2 + (ratio / WARNING_THRESHOLD) * 0.4
   */
  recordApproachingLimit(ratio: number): ConcurrencyChangeResult {
    // Clamp ratio to [0, 1] to handle edge cases
    const clampedRatio = Math.max(0, Math.min(1, ratio));

    if (clampedRatio >= WARNING_THRESHOLD || this.current <= this.min) {
      return {
        changed: false,
        previous: this.current,
        current: this.current,
        reason: 'proactive',
      };
    }

    const previous = this.current;

    // Linear scaling: at 10% → keep 60%, at 0% → keep 20%
    // reductionFactor = 0.2 + (ratio / WARNING_THRESHOLD) * 0.4
    // At ratio=0.10: 0.2 + 1.0 * 0.4 = 0.6 (60%)
    // At ratio=0.05: 0.2 + 0.5 * 0.4 = 0.4 (40%)
    // At ratio=0.01: 0.2 + 0.1 * 0.4 = 0.24 (~24%)
    const reductionFactor = 0.2 + (clampedRatio / WARNING_THRESHOLD) * 0.4;
    this.current = Math.max(this.min, Math.floor(this.current * reductionFactor));

    return {
      changed: previous !== this.current,
      previous,
      current: this.current,
      reason: 'proactive',
    };
  }

  getCurrent(): number {
    return this.current;
  }

  getMin(): number {
    return this.min;
  }

  getInitial(): number {
    return this.initial;
  }
}
