/**
 * MCP Types - Re-export from lib/types.ts
 *
 * All MCP type definitions are consolidated in lib/types.ts
 * This file exists for backwards compatibility and shorter import paths
 */
export {
  // Core MCP types
  type McpCommandOptions,
  type ToolResponse,
  type ToolResult,

  // Content types
  type TextContent,

  // Validation types
  type ValidationResults,

  // Provider testing types
  type TestResult,
  type ProviderTestOptions,

  // Tool registration types
  type ToolDefinition,
  type ToolHandler,
  type ToolRegistry,

  // Error types
  type ToolError,

  // Health check types
  type HealthCheckResult,

  // Evaluation types
  type EvaluationSummary,
  type EvaluationMetrics,

  // Configuration types
  type ConfigValidationOptions,

  // Assertion testing types
  type AssertionTestOptions,

  // Evaluation execution types
  type EvaluationOptions,

  // Share evaluation types
  type ShareOptions,
} from './lib/types';
