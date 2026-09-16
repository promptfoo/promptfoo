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

/**
 * Text content for tool responses
 * This is the primary content type used by promptfoo MCP tools
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  [x: string]: unknown;
  content: TextContent[];
  isError: boolean;
}

export interface EvaluationDetailsSummary {
  id: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  providers: unknown[];
  prompts: number;
}
