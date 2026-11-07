import type { AnalysisLimits } from './types';

export const DEFAULT_LIMITS: Readonly<AnalysisLimits> = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxRows: 100_000,
  maxObservations: 100_000,
  maxChecks: 100_000,
  maxValueBytes: 1024 * 1024,
  maxValueNodes: 100_000,
  maxDepth: 64,
  maxArrayLength: 20_000,
  maxWork: 10_000_000,
});

/** These limits are supplied by the caller, never by the untrusted plan/export. */
export function resolveLimits(overrides: Partial<AnalysisLimits> = {}): AnalysisLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!(key in DEFAULT_LIMITS) || !Number.isSafeInteger(value) || value < 1) {
      throw new Error('Metamorphic limits must be positive safe integers with known names');
    }
  }
  // Recursive traversal cannot safely honor arbitrarily large stack depths.
  if (limits.maxDepth > 128) {
    throw new Error('Metamorphic maximum value depth cannot exceed 128');
  }
  return limits;
}

export class WorkBudget {
  private remaining: number;
  constructor(limit: number) {
    this.remaining = limit;
  }
  spend(amount = 1): void {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > this.remaining) {
      throw new Error('Metamorphic analysis work budget exceeded');
    }
    this.remaining -= amount;
  }
}
