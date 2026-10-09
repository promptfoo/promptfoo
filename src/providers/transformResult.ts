import type { ProviderResponse } from '../types/index';

function isProviderResponse(value: unknown): value is ProviderResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('output' in value || 'error' in value)
  );
}

export function normalizeResponseTransformResult(value: unknown): ProviderResponse {
  return isProviderResponse(value) ? value : { output: value };
}
