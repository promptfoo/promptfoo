import type { TestCase, ProviderOptions } from '@promptfoo/types';
import type { GenerationMetadata, GenerationBatch } from '../types';

/**
 * Type guard to check if a value is a valid TestCase
 */
export function isTestCase(value: unknown): value is TestCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'vars' in value &&
    typeof (value as any).vars === 'object'
  );
}

/**
 * Type guard to check if a value is a valid ProviderOptions
 */
export function isProviderOptions(value: unknown): value is ProviderOptions {
  return typeof value === 'object' && value !== null && 'id' in value;
}

/**
 * Type guard to check if metadata contains generation info
 */
export function hasGenerationMetadata(
  metadata: unknown,
): metadata is GenerationMetadata {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    ('generationBatchId' in metadata || 'duplicatedFrom' in metadata)
  );
}

/**
 * Type guard for GenerationBatch
 */
export function isGenerationBatch(value: unknown): value is GenerationBatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'generatedAt' in value &&
    'generatedBy' in value &&
    'type' in value
  );
}

/**
 * Safe array type guard
 */
export function isArray<T>(
  value: unknown,
  itemGuard: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(itemGuard);
}