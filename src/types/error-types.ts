// src/types/error-types.ts

export type ErrorCategory =
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'not_found'
  | 'timeout'
  | 'internal'
  | 'network';

export type ErrorType =
  | 'provider_error'
  | 'validation_error'
  | 'timeout'
  | 'tool_error';

export interface EvalErrorInfo {
  type: ErrorType;
  code?: ErrorCategory;
  message: string;
  hint?: string;
  provider?: string;
  requestId?: string;
  raw?: unknown;
  stack?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cause?: any;
}