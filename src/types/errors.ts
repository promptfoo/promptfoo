export type ErrorCategory =
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'not_found'
  | 'timeout'
  | 'internal'
  | 'network';

export interface EvalErrorInfo {
  type: string;
  message: string;
  code?: string;
  providerId?: string;
}
