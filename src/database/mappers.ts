/**
 * Database Mappers.
 *
 * Utility functions to convert database rows to API response DTOs.
 * These ensure consistent data transformation between database layer and API layer.
 *
 * Usage:
 *   import { toEvalDTO, toConfigDTO } from './mappers';
 *
 *   const row = db.select().from(evalsTable).where(...).get();
 *   const dto = toEvalDTO(row);
 */

import type { InferSelectModel } from 'drizzle-orm';
import type {
  configsTable,
  evalsTable,
  modelAuditsTable,
  spansTable,
  tracesTable,
} from './tables';

// =============================================================================
// Type Inference from Drizzle Tables
// =============================================================================

/** Database row type for evals table */
export type EvalRow = InferSelectModel<typeof evalsTable>;

/** Database row type for configs table */
export type ConfigRow = InferSelectModel<typeof configsTable>;

/** Database row type for model_audits table */
export type ModelAuditRow = InferSelectModel<typeof modelAuditsTable>;

/** Database row type for traces table */
export type TraceRow = InferSelectModel<typeof tracesTable>;

/** Database row type for spans table */
export type SpanRow = InferSelectModel<typeof spansTable>;

// =============================================================================
// DTO Interfaces (API Response Shapes)
// =============================================================================

/**
 * Eval DTO - API response shape for evaluations.
 */
export interface EvalDTO {
  id: string;
  createdAt: number;
  author: string | null;
  description: string | null;
  isRedteam: boolean;
  // Full config and results are typically not included in list views
  // Use a separate endpoint to fetch full details
}

/**
 * Eval detail DTO - includes full config and results.
 */
export interface EvalDetailDTO extends EvalDTO {
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  prompts: unknown[] | null;
  vars: string[] | null;
}

/**
 * Config DTO - API response shape for saved configurations.
 */
export interface ConfigDTO {
  id: string;
  name: string;
  type: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Config detail DTO - includes full config content.
 */
export interface ConfigDetailDTO extends ConfigDTO {
  config: Record<string, unknown>;
}

/**
 * Model audit DTO - API response shape for model audits.
 */
export interface ModelAuditDTO {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string | null;
  author: string | null;
  modelPath: string;
  modelType: string | null;
  hasErrors: boolean;
  totalChecks: number | null;
  passedChecks: number | null;
  failedChecks: number | null;
  modelId: string | null;
  revisionSha: string | null;
  contentHash: string | null;
  modelSource: string | null;
  scannerVersion: string | null;
}

/**
 * Model audit detail DTO - includes full results.
 */
export interface ModelAuditDetailDTO extends ModelAuditDTO {
  results: Record<string, unknown>;
  checks: unknown[] | null;
  issues: unknown[] | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Trace DTO - API response shape for traces.
 */
export interface TraceDTO {
  id: string;
  traceId: string;
  evaluationId: string;
  testCaseId: string;
  createdAt: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Span DTO - API response shape for spans.
 */
export interface SpanDTO {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  attributes: Record<string, unknown> | null;
  statusCode: number | null;
  statusMessage: string | null;
}

// =============================================================================
// Mapper Functions
// =============================================================================

/**
 * Converts an eval database row to a list-view DTO.
 */
export function toEvalDTO(row: EvalRow): EvalDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    author: row.author,
    description: row.description,
    isRedteam: row.isRedteam,
  };
}

/**
 * Converts an eval database row to a detail DTO.
 */
export function toEvalDetailDTO(row: EvalRow): EvalDetailDTO {
  return {
    ...toEvalDTO(row),
    config: row.config as Record<string, unknown>,
    results: row.results as Record<string, unknown>,
    prompts: row.prompts,
    vars: row.vars,
  };
}

/**
 * Converts a config database row to a list-view DTO.
 */
export function toConfigDTO(row: ConfigRow): ConfigDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Converts a config database row to a detail DTO.
 */
export function toConfigDetailDTO(row: ConfigRow): ConfigDetailDTO {
  return {
    ...toConfigDTO(row),
    config: row.config as Record<string, unknown>,
  };
}

/**
 * Converts a model audit database row to a list-view DTO.
 */
export function toModelAuditDTO(row: ModelAuditRow): ModelAuditDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: row.name,
    author: row.author,
    modelPath: row.modelPath,
    modelType: row.modelType,
    hasErrors: row.hasErrors,
    totalChecks: row.totalChecks,
    passedChecks: row.passedChecks,
    failedChecks: row.failedChecks,
    modelId: row.modelId,
    revisionSha: row.revisionSha,
    contentHash: row.contentHash,
    modelSource: row.modelSource,
    scannerVersion: row.scannerVersion,
  };
}

/**
 * Converts a model audit database row to a detail DTO.
 */
export function toModelAuditDetailDTO(row: ModelAuditRow): ModelAuditDetailDTO {
  return {
    ...toModelAuditDTO(row),
    results: row.results as unknown as Record<string, unknown>,
    checks: row.checks as unknown[] | null,
    issues: row.issues as unknown[] | null,
    metadata: row.metadata,
  };
}

/**
 * Converts a trace database row to a DTO.
 */
export function toTraceDTO(row: TraceRow): TraceDTO {
  return {
    id: row.id,
    traceId: row.traceId,
    evaluationId: row.evaluationId,
    testCaseId: row.testCaseId,
    createdAt: row.createdAt,
    metadata: row.metadata,
  };
}

/**
 * Converts a span database row to a DTO.
 */
export function toSpanDTO(row: SpanRow): SpanDTO {
  return {
    id: row.id,
    traceId: row.traceId,
    spanId: row.spanId,
    parentSpanId: row.parentSpanId,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    attributes: row.attributes,
    statusCode: row.statusCode,
    statusMessage: row.statusMessage,
  };
}

// =============================================================================
// Batch Mappers
// =============================================================================

/**
 * Converts an array of eval rows to DTOs.
 */
export function toEvalDTOs(rows: EvalRow[]): EvalDTO[] {
  return rows.map(toEvalDTO);
}

/**
 * Converts an array of config rows to DTOs.
 */
export function toConfigDTOs(rows: ConfigRow[]): ConfigDTO[] {
  return rows.map(toConfigDTO);
}

/**
 * Converts an array of model audit rows to DTOs.
 */
export function toModelAuditDTOs(rows: ModelAuditRow[]): ModelAuditDTO[] {
  return rows.map(toModelAuditDTO);
}

/**
 * Converts an array of trace rows to DTOs.
 */
export function toTraceDTOs(rows: TraceRow[]): TraceDTO[] {
  return rows.map(toTraceDTO);
}

/**
 * Converts an array of span rows to DTOs.
 */
export function toSpanDTOs(rows: SpanRow[]): SpanDTO[] {
  return rows.map(toSpanDTO);
}
