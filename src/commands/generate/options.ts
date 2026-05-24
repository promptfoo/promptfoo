import { z } from 'zod';

const PositiveIntegerSchema = z.coerce.number().int().positive();
const ProbabilitySchema = z.coerce.number().min(0).max(1);

export function validatePositiveIntegerOption(value: string | undefined, optionName: string): void {
  if (value !== undefined && !PositiveIntegerSchema.safeParse(value).success) {
    throw new Error(`Option ${optionName} must be a positive integer.`);
  }
}

export function validateProbabilityOption(value: string | undefined, optionName: string): void {
  if (value !== undefined && !ProbabilitySchema.safeParse(value).success) {
    throw new Error(`Option ${optionName} must be a number between 0 and 1.`);
  }
}

export function validateExclusiveGenerationModes(
  datasetOnly: boolean | undefined,
  assertionsOnly: boolean | undefined,
): void {
  if (datasetOnly && assertionsOnly) {
    throw new Error('Cannot use --dataset-only and --assertions-only together.');
  }
}
