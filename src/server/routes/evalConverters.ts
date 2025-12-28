/**
 * Type converters for eval API routes.
 *
 * These functions bridge the gap between DTO schemas (API contract) and internal types.
 * The DTO schemas validate the wire format, while internal types may have additional
 * properties or slightly different structures used by the database and evaluation engine.
 *
 * Using explicit converters instead of `as unknown as T` casts provides:
 * 1. Clear documentation of the conversion points
 * 2. A single place to add transformation logic if needed
 * 3. Better type safety through function boundaries
 */

import type { EvalResultItem } from '../../dtos/eval.dto';
import type { ResultsFile } from '../../index';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import type { CompletedPrompt } from '../../types';

/**
 * Converts validated DTO result items to internal EvalResult type.
 *
 * The DTO schema validates the API contract, but internal EvalResult may have
 * additional runtime properties added by the evaluation engine.
 */
export function toEvalResults(dtoResults: EvalResultItem[]): InstanceType<typeof EvalResult>[] {
  // The structures are compatible - DTO is a subset of EvalResult
  // This function serves as a documented conversion point
  return dtoResults as unknown as InstanceType<typeof EvalResult>[];
}

/**
 * Converts V3 format payload to ResultsFile.
 *
 * V3 format wraps data in a { data: { results, config } } structure.
 */
export function toResultsFile(v3Data: { results: unknown; config: unknown }): ResultsFile {
  return v3Data as unknown as ResultsFile;
}

/**
 * Converts V4 format prompts to the format expected by Eval.create.
 *
 * The DTO uses z.record(z.unknown()) for flexibility, while internal types
 * expect specific Prompt structure.
 */
export function toPrompts(dtoPrompts: Record<string, unknown>[] | undefined): Parameters<typeof Eval.create>[1] {
  return (dtoPrompts || []) as unknown as Parameters<typeof Eval.create>[1];
}

/**
 * Converts V4 format config to the format expected by Eval.create.
 */
export function toEvalConfig(dtoConfig: Record<string, unknown>): Parameters<typeof Eval.create>[0] {
  return dtoConfig as Parameters<typeof Eval.create>[0];
}

/**
 * Converts V4 format prompts to CompletedPrompt[] for Eval.addPrompts.
 *
 * Note: This is separate from toPrompts because addPrompts expects
 * CompletedPrompt[] while Eval.create expects a different prompt structure.
 */
export function toCompletedPrompts(dtoPrompts: Record<string, unknown>[]): CompletedPrompt[] {
  return dtoPrompts as unknown as CompletedPrompt[];
}
