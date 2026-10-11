import type { OpenAIEvalsJsonlRow } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

export function isOpenAIEvalsJsonlRow(value: unknown): value is OpenAIEvalsJsonlRow {
  return (
    isRecord(value) &&
    typeof value.run_id === 'string' &&
    typeof value.data_source_idx === 'number' &&
    Number.isInteger(value.data_source_idx) &&
    value.data_source_idx >= 0 &&
    isRecord(value.item) &&
    (value.sample === undefined || isRecord(value.sample)) &&
    isNumberRecord(value.grades) &&
    (value.grader_samples === undefined || isRecord(value.grader_samples)) &&
    (value.passes === undefined || isBooleanRecord(value.passes))
  );
}
