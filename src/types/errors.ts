// src/types/errors.ts

/**
 * Centralized error taxonomy/types.
 * NOTE: EvalErrorInfo and ErrorType are defined canonically in ./result
 * and re-exported here to avoid duplication and drift.
 */

export type ErrorCategory =
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'not_found'
  | 'timeout'
  | 'internal'
  | 'network';

// Re-export the canonical shapes to keep a single source of truth.
export type { EvalErrorInfo, ErrorType } from './result';
