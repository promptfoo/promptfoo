import type { ProviderResponse } from '../types/index';

export function normalizeResponseTransformResult(value: unknown): ProviderResponse {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('output' in value || 'error' in value)
    ? (value as ProviderResponse)
    : { output: value };
}
