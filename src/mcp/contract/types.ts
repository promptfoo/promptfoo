/**
 * Types and interfaces for MCP (Model Context Protocol) Tool Contract Drift Detection.
 *
 * Grounded in issue #11906: Automated contract regression, JSON Schema normalization,
 * deterministic SHA-256 fingerprinting, and compatibility classification for agent workflows.
 */

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: (string | number | boolean | null)[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  [key: string]: unknown;
};

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  [key: string]: unknown;
}

export interface NormalizedToolContract {
  name: string;
  description: string;
  canonicalSchema: JsonSchema;
  rawSchema: JsonSchema;
  schemaFingerprint: string;
  fullFingerprint: string;
}

export interface McpServerContract {
  serverId: string;
  schemaVersion: '1.0.0';
  generatedAt: string;
  overallFingerprint: string;
  toolCount: number;
  tools: Record<string, NormalizedToolContract>;
  metadata?: Record<string, unknown>;
}

export type ChangeSeverity = 'BREAKING' | 'NON_BREAKING' | 'DESCRIPTION_ONLY' | 'SEMANTIC';

export type ContractChangeCode =
  | 'TOOL_ADDED'
  | 'TOOL_REMOVED'
  | 'TOOL_RENAMED'
  | 'REQUIRED_PROPERTY_ADDED'
  | 'REQUIRED_PROPERTY_REMOVED'
  | 'OPTIONAL_PROPERTY_ADDED'
  | 'OPTIONAL_PROPERTY_REMOVED'
  | 'PROPERTY_TYPE_CHANGED'
  | 'ENUM_RESTRICTED'
  | 'ENUM_EXPANDED'
  | 'CONSTRAINT_TIGHTENED'
  | 'CONSTRAINT_RELAXED'
  | 'DESCRIPTION_CHANGED'
  | 'SCHEMA_MODIFIED_UNKNOWN';

export interface ContractDriftChange {
  code: ContractChangeCode;
  severity: ChangeSeverity;
  toolName: string;
  propertyPath?: string;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
  remediation?: string;
}

export type CompatibilityStatus = 'IDENTICAL' | 'DESCRIPTION_ONLY' | 'NON_BREAKING' | 'BREAKING';

export interface ContractDiffResult {
  serverId: string;
  status: CompatibilityStatus;
  baselineFingerprint: string;
  currentFingerprint: string;
  baselineTimestamp?: string;
  currentTimestamp: string;
  hasBreakingChanges: boolean;
  totalChanges: number;
  breakingCount: number;
  nonBreakingCount: number;
  descriptionOnlyCount: number;
  changes: ContractDriftChange[];
  summary: string;
}

export interface CiRegressionGateOptions {
  allowBreakingChanges?: boolean;
  allowNonBreakingDrift?: boolean;
  allowDescriptionChanges?: boolean;
  baselinePath?: string;
  saveNewBaselineOnPass?: boolean;
}

export interface CiRegressionGateResult {
  passed: boolean;
  exitCode: number;
  diff: ContractDiffResult;
  reportMarkdown: string;
  reportConsole: string;
}

