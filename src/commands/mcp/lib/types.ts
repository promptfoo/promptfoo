import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Core MCP types
export interface McpCommandOptions {
  port: string;
  transport: string;
}

// Tool response types - more specific than using 'any'
export interface ToolResponse<T = unknown> {
  tool: string;
  success: boolean;
  timestamp: string;
  data?: T;
  error?: string;
}

export interface ToolContent {
  [x: string]: unknown;
  type: 'text';
  text: string;
}

export interface ToolResult<_T = unknown> {
  [x: string]: unknown;
  content: ToolContent[];
  isError: boolean;
}

// Validation types
export interface ValidationResults {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: unknown;
  testSuite?: unknown;
}

// Provider testing types
export interface TestResult {
  providerId: string;
  success: boolean;
  responseTime?: number;
  response?: string;
  tokenUsage?: unknown;
  cost?: number;
  error?: string;
  timedOut?: boolean;
  metadata?: Record<string, unknown>;
}

// Tool registration types
export interface ToolDefinition {
  name: string;
  description: string;
  schema?: Record<string, unknown>;
  handler: ToolHandler;
}

export type ToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
) => Promise<ToolResult<TResult>>;

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  getAll(): ToolDefinition[];
}

// Base tool interface
export interface BaseTool {
  readonly name: string;
  readonly description: string;
  register(server: McpServer): void;
}

// Error types for better error handling
export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Health check types
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  details?: Record<string, unknown>;
}

// Evaluation types
export interface EvaluationSummary {
  id: string;
  description?: string;
  createdAt: string;
  stats?: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface EvaluationMetrics {
  id: string;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: string;
    testCaseCount: number;
  };
  performance: {
    avgResponseTimeMs: number;
    totalTokens: number;
    totalCost: string;
  };
  metadata: {
    description: string;
    createdAt: string;
    configFile: string;
  };
}

// Configuration types
export interface ConfigValidationOptions {
  configPaths?: string[];
  strict?: boolean;
}

// Provider testing types
export interface ProviderTestOptions {
  provider: string | { id: string; config?: Record<string, unknown> };
  testPrompt?: string;
  timeoutMs?: number;
}

// Assertion testing types
export interface AssertionTestOptions {
  output: string;
  assertion: {
    type: string;
    value?: unknown;
    threshold?: number;
    weight?: number;
    metric?: string;
    provider?: unknown;
    transform?: string;
    config?: Record<string, unknown>;
  };
  prompt?: string;
  vars?: Record<string, unknown>;
  latencyMs?: number;
}

// Evaluation execution types
export interface EvaluationOptions {
  configPath?: string;
  testCaseIndices?: number | number[] | { start: number; end: number };
  promptFilter?: string | string[];
  providerFilter?: string | string[];
  maxConcurrency?: number;
  timeoutMs?: number;
}

// Share evaluation types
export interface ShareOptions {
  evalId?: string;
  showAuth?: boolean;
  overwrite?: boolean;
}
