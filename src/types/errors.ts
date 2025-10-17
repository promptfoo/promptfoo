// src/types/errors.ts

export type ErrorCategory = 
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'rate_limit'
  | 'model_not_enabled'
  | 'permission_denied'
  | 'malformed_request'
  | 'timeout'
  | 'network'
  | 'provider_unavailable'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  httpStatus?: number;
  code?: string;
  providerId?: string;
}
