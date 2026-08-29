const DEFAULT_MIN_CONCURRENCY = 1;
const BACKOFF_FACTOR = 0.5; // Halve on rate limit
const RECOVERY_FACTOR = 1.5; // +50% on recovery
const RECOVERY_THRESHOLD = 5; // Successes before recovery
const WARNING_THRESHOLD = 0.1; // 10% remaining triggers proactive reduction
const DEFAULT_LATENCY_ALPHA = 0.2; // Smoothing factor for EMA
const DEFAULT_GRADIENT_THRESHOLD = 1.5; // 50% above baseline latency triggers proactive reduction
const DEFAULT_LATENCY_BACKOFF_FACTOR = 0.8; // Reduce by 20% on latency inflation
const DEFAULT_BASELINE_WINDOW_SIZE = 20; // Sliding window size to expire baseline min latency

// Export for use in other modules
export { WARNING_THRESHOLD };

export interface ConcurrencyChangeResult {
  changed: boolean;
  previous: number;
  current: number;
  reason: 'recovery' | 'ratelimit' | 'proactive';
}

export interface AdaptiveConcurrencyOptions {
  /** Smoothing factor for Exponential Moving Average (0 < alpha <= 1). Default: 0.2 */
  alpha?: number;
  /** Latency gradient threshold (ratio of EMA to min baseline) before throttling. Default: 1.5 */
  gradientThreshold?: number;
  /** Concurrency multiplier on latency gradient breach. Default: 0.8 */
  latencyBackoffFactor?: number;
  /** Number of recent samples used to calculate baseline minimum latency. Default: 20 */
  baselineWindowSize?: number;
}

/**
 * Manages adaptive concurrency based on rate limit feedback and latency gradient tracking.
 *
 * Combines:
 * 1. Additive Recovery: +50% concurrency after 5 consecutive successes up to initial.
 * 2. Multiplicative Rate-Limit Backoff: Halves concurrency on HTTP 429.
 * 3. Proactive Quota Reduction: Reduces concurrency when quota remaining < 10%.
 * 4. Latency-Gradient Congestion Control (TCP Vegas / BBR inspired): Tracks EMA latency and
 *    compares with a sliding-window baseline latency. If latency inflates past the gradient threshold,
 *    proactively steps down concurrency before HTTP 429 errors occur.
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

  // Latency-gradient state
  private emaLatency: number | null = null;
  private recentLatencies: number[] = [];
  private readonly baselineWindowSize: number;
  private readonly alpha: number;
  private readonly gradientThreshold: number;
  private readonly latencyBackoffFactor: number;

  constructor(
    initial: number,
    min: number = DEFAULT_MIN_CONCURRENCY,
    options?: AdaptiveConcurrencyOptions,
  ) {
    this.initial = initial;
    this.current = initial;
    // Clamp min to be at least 1 and at most initial
    this.min = Math.min(initial, Math.max(1, min));
    this.alpha = options?.alpha ?? DEFAULT_LATENCY_ALPHA;
    this.gradientThreshold = options?.gradientThreshold ?? DEFAULT_GRADIENT_THRESHOLD;
    this.latencyBackoffFactor = options?.latencyBackoffFactor ?? DEFAULT_LATENCY_BACKOFF_FACTOR;
    this.baselineWindowSize = options?.baselineWindowSize ?? DEFAULT_BASELINE_WINDOW_SIZE;
  }

  /**
   * Called on successful request with optional round-trip latency.
   * May increase concurrency after sustained success, or proactively throttle if latency degrades.
   */
  recordSuccess(latencyMs?: number): ConcurrencyChangeResult {
    // Process latency tracking if provided and valid
    if (latencyMs !== undefined && latencyMs > 0) {
      this.recentLatencies.push(latencyMs);
      if (this.recentLatencies.length > this.baselineWindowSize) {
        this.recentLatencies.shift();
      }

      this.emaLatency =
        this.emaLatency === null
          ? latencyMs
          : this.alpha * latencyMs + (1 - this.alpha) * this.emaLatency;

      const minBaseline = Math.min(...this.recentLatencies);
      const gradient = minBaseline > 0 ? this.emaLatency / minBaseline : 1;

      // If latency has inflated significantly beyond recent baseline and we have room to throttle
      if (gradient > this.gradientThreshold && this.current > this.min) {
        const previous = this.current;
        this.current = Math.max(this.min, Math.floor(this.current * this.latencyBackoffFactor));
        this.consecutiveSuccesses = 0;

        return {
          changed: previous !== this.current,
          previous,
          current: this.current,
          reason: 'proactive',
        };
      }
    }

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
   * Reduces concurrency immediately and resets consecutive successes.
   */
  recordRateLimit(): ConcurrencyChangeResult {
    this.consecutiveSuccesses = 0;
    this.recentLatencies = [];
    this.emaLatency = null;

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

  getEmaLatency(): number | null {
    return this.emaLatency;
  }

  getMinLatency(): number {
    return this.recentLatencies.length > 0 ? Math.min(...this.recentLatencies) : 0;
  }

  getLatencyGradient(): number | null {
    const minBaseline = this.getMinLatency();
    if (this.emaLatency === null || minBaseline === 0) {
      return null;
    }
    return this.emaLatency / minBaseline;
  }
}
