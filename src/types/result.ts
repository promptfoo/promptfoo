// Error categories (infra/runtime vs. logical assertion)
export type ErrorType = 'provider_error' | 'tool_error' | 'validation_error' | 'timeout';

// Rich error info for infra/runtime/validation/timeout
export interface EvalErrorInfo {
  type: ErrorType;
  code?: string;
  message: string;
  hint?: string;
  provider?: string;
  requestId?: string;
  raw?: unknown;
  stack?: string;
  cause?: string;
}

// Optional fine-grained assertion detail (for UI/debug)
export interface AssertionDetail {
  name?: string;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

// Promptfoo-aligned grading block
export interface GradingResult {
  pass: boolean;
  score?: number; // 0..1 typical
  reason?: string;
  componentResults?: GradingResult[]; // nested/compound checks
  namedScores?: Record<string, number>; // “metrics” in UI
  details?: AssertionDetail[]; // per-assertion info
}

// Unified per-case shape — aligns with Promptfoo
export interface CaseResult {
  // Canonical summary used across Promptfoo
  pass: boolean;
  score?: number;
  reason?: string;

  // Detailed grading result (mirrors top-level summary)
  gradingResult?: GradingResult;

  // Only for infra/runtime/validation/timeout failures.
  // Assertion failures appear via pass=false (+ gradingResult.details).
  error?: EvalErrorInfo;

  // Extra telemetry (latency, tokens, cost, traces, tags, etc.)
  metadata?: Record<string, unknown>;
}
