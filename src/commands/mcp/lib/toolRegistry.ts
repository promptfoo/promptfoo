/**
 * Tool annotation hints per MCP spec 2025-03-26
 * These help AI agents understand tool behavior for better decision making
 */
export interface ToolAnnotations {
  /**
   * If true, the tool does not modify any state (read-only operation)
   */
  readOnlyHint?: boolean;
  /**
   * If true, the tool may perform destructive operations
   */
  destructiveHint?: boolean;
  /**
   * If true, calling the tool multiple times with same args has same effect
   */
  idempotentHint?: boolean;
  /**
   * If true, the tool may take a long time to complete
   */
  longRunningHint?: boolean;
}

/**
 * Tool metadata for documentation generation
 */
export interface ToolMetadata {
  name: string;
  description: string;
  parameters: string;
  annotations: ToolAnnotations;
  category: 'evaluation' | 'generation' | 'redteam' | 'configuration' | 'debugging';
}

/**
 * Global tool registry for auto-generating documentation
 */
class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();

  /**
   * Register a tool with its metadata
   */
  register(metadata: ToolMetadata): void {
    this.tools.set(metadata.name, metadata);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool by name
   */
  get(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  /**
   * Generate documentation object for MCP resources
   */
  generateDocs(): {
    tools: Array<{
      name: string;
      description: string;
      parameters: string;
      category: string;
      annotations: ToolAnnotations;
    }>;
    version: string;
    lastUpdated: string;
    totalTools: number;
  } {
    const toolDocs = this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
      annotations: tool.annotations,
    }));

    return {
      tools: toolDocs,
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalTools: toolDocs.length,
    };
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolMetadata['category']): ToolMetadata[] {
    return this.getAll().filter((tool) => tool.category === category);
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

/**
 * Tool definitions with metadata for all MCP tools
 * This is the single source of truth for tool documentation
 */
export const TOOL_DEFINITIONS: ToolMetadata[] = [
  // Core Evaluation Tools
  {
    name: 'list_evaluations',
    description: 'List and browse evaluation runs with pagination and optional dataset filtering',
    parameters:
      'datasetId?: string, page?: number (default: 1), pageSize?: number (1-100, default: 20)',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'evaluation',
  },
  {
    name: 'get_evaluation_details',
    description: 'Get detailed results for a specific evaluation including metrics and test cases',
    parameters: 'id: string (required) - eval ID from list_evaluations',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'evaluation',
  },
  {
    name: 'run_evaluation',
    description:
      'Run an eval from a promptfoo config with optional test case filtering and pagination',
    parameters:
      'configPath?: string, testCaseIndices?: number | number[] | {start, end}, promptFilter?: string | string[], providerFilter?: string | string[], maxConcurrency?: number (1-20), timeoutMs?: number (1s-5min), resultLimit?: number (1-100, default: 20), resultOffset?: number',
    annotations: { readOnlyHint: false, idempotentHint: false, longRunningHint: true },
    category: 'evaluation',
  },
  {
    name: 'share_evaluation',
    description: 'Create a publicly shareable URL for evaluation results',
    parameters: 'evalId?: string (latest if omitted), showAuth?: boolean, overwrite?: boolean',
    annotations: { readOnlyHint: false, idempotentHint: true },
    category: 'evaluation',
  },
  {
    name: 'validate_promptfoo_config',
    description: 'Validate promptfoo configuration files using the same logic as CLI validate',
    parameters: 'configPaths?: string[] (defaults to promptfooconfig.yaml)',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'configuration',
  },
  {
    name: 'test_provider',
    description: 'Test AI provider connectivity, credentials, and response quality',
    parameters:
      'provider: string | {id, config} (required), testPrompt?: string, timeoutMs?: number (1s-5min, default: 30s)',
    annotations: { readOnlyHint: true, idempotentHint: false },
    category: 'configuration',
  },
  {
    name: 'run_assertion',
    description: 'Run an assertion against LLM output to test grading logic',
    parameters:
      'output: string (required), assertion: {type, value?, threshold?, ...} (required), prompt?: string, vars?: object, latencyMs?: number',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'configuration',
  },
  // Generation Tools
  {
    name: 'generate_dataset',
    description: 'Generate test datasets using AI for comprehensive evaluation coverage',
    parameters:
      'prompt: string (required), instructions?: string, numSamples?: number (1-100, default: 10), provider?: string, outputPath?: string',
    annotations: { readOnlyHint: false, idempotentHint: false, longRunningHint: true },
    category: 'generation',
  },
  {
    name: 'generate_test_cases',
    description: 'Generate test cases with assertions for existing prompts',
    parameters:
      'prompt: string (required, use {{var}} syntax), instructions?: string, numTestCases?: number (1-50, default: 5), assertionTypes?: string[], provider?: string, outputPath?: string',
    annotations: { readOnlyHint: false, idempotentHint: false, longRunningHint: true },
    category: 'generation',
  },
  {
    name: 'compare_providers',
    description: 'Compare multiple AI providers side-by-side for performance and quality',
    parameters:
      'providers: string[] (2-10 required), testPrompt: string (required), evaluationCriteria?: string[], timeoutMs?: number (default: 30s)',
    annotations: { readOnlyHint: true, idempotentHint: false, longRunningHint: true },
    category: 'generation',
  },
  // Redteam Security Tools
  {
    name: 'redteam_generate',
    description: 'Generate adversarial test cases for redteam security testing',
    parameters:
      'configPath?: string, output?: string, purpose?: string, plugins?: string[], strategies?: string[], numTests?: number (1-100), maxConcurrency?: number (1-10), provider?: string, write?: boolean, force?: boolean',
    annotations: { readOnlyHint: false, idempotentHint: false, longRunningHint: true },
    category: 'redteam',
  },
  {
    name: 'redteam_run',
    description: 'Execute comprehensive security testing against AI applications',
    parameters:
      'configPath?: string, output?: string, force?: boolean, maxConcurrency?: number (1-10), delay?: number, filterProviders?: string (regex), remote?: boolean',
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      longRunningHint: true,
    },
    category: 'redteam',
  },
  // Debugging Tools
  {
    name: 'list_logs',
    description: 'List available promptfoo log files with metadata (size, date, type)',
    parameters:
      'type?: "debug" | "error" | "all" (default: all), page?: number (default: 1), pageSize?: number (1-100, default: 20)',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'debugging',
  },
  {
    name: 'read_logs',
    description: 'Read promptfoo log file contents with filtering options for debugging',
    parameters:
      'file?: string (filename or "latest", default: latest), type?: "debug" | "error" | "all" (default: debug), lines?: number (1-1000, default: 100), head?: boolean (default: false), grep?: string (regex pattern)',
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'debugging',
  },
];

/**
 * Initialize the tool registry with all tool definitions
 */
export function initializeToolRegistry(): void {
  for (const tool of TOOL_DEFINITIONS) {
    toolRegistry.register(tool);
  }
}
