/**
 * MCP Types - Re-export from lib/types.ts
 *
 * All MCP type definitions are consolidated in lib/types.ts
 * This file exists for backwards compatibility and shorter import paths
 */
export {
  // Assertion testing types
  type AssertionTestOptions,
  // Configuration types
  type ConfigValidationOptions,
  type EvaluationMetrics,
  // Evaluation execution types
  type EvaluationOptions,
  // Evaluation types
  type EvaluationSummary,
  // Health check types
  type HealthCheckResult,
  // Core MCP types
  type McpCommandOptions,
  type ProviderTestOptions,
  // Share evaluation types
  type ShareOptions,
  // Provider testing types
  type TestResult,
  // Content types
  type TextContent,
  // Tool registration types
  type ToolDefinition,
  // Error types
  type ToolError,
  type ToolHandler,
  type ToolRegistry,
  type ToolResponse,
  type ToolResult,
  // Validation types
  type ValidationResults,
} from './lib/types';
