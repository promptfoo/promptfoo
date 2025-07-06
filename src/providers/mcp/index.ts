import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types';
import { MCPClient } from './client';
import type { MCPConfig } from './types';

interface MCPProviderOptions {
  config?: MCPConfig;
  id?: string;
  // Default args to pass to tools
  defaultArgs?: Record<string, unknown>;
}

export class MCPProvider implements ApiProvider {
  private mcpClient: MCPClient;
  config: MCPConfig;
  private defaultArgs?: Record<string, unknown>;
  private initializationPromise: Promise<void>;

  constructor(options: MCPProviderOptions = {}) {
    this.config = options.config || { enabled: true };
    this.defaultArgs = options.defaultArgs || {};

    this.mcpClient = new MCPClient(this.config);
    this.initializationPromise = this.initialize();

    // Set id function if provided
    if (options.id) {
      this.id = () => options.id!;
    }
  }

  id(): string {
    return 'mcp';
  }

  toString(): string {
    return `[MCP Provider]`;
  }

  private async initialize(): Promise<void> {
    await this.mcpClient.initialize();

    if (this.config.verbose) {
      const tools = this.mcpClient.getAllTools();
      console.log(
        'MCP Provider initialized with tools:',
        tools.map((t) => t.name),
      );
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      // Ensure initialization is complete
      await this.initializationPromise;

      // Extract tool call information from context variables
      const vars = context?.vars || {};

      // Tool name can be specified in multiple ways
      const toolName = vars.tool || vars.toolName || vars.function || vars.functionName;

      if (!toolName || typeof toolName !== 'string') {
        return {
          error:
            'No tool specified. Please provide tool name in test variables (e.g., tool: "function_name")',
        };
      }

      // Tool arguments can be specified as 'args', 'arguments', or 'params'
      let toolArgs = vars.args || vars.arguments || vars.params || {};

      // If args is a string, try to parse it as JSON
      if (typeof toolArgs === 'string') {
        try {
          toolArgs = JSON.parse(toolArgs);
        } catch {
          // If parsing fails, treat it as a single argument
          toolArgs = { input: toolArgs };
        }
      }

      // Ensure toolArgs is an object
      if (typeof toolArgs !== 'object' || toolArgs === null || Array.isArray(toolArgs)) {
        toolArgs = {};
      }

      // Merge with default args
      const finalArgs = {
        ...this.defaultArgs,
        ...toolArgs,
      };

      logger.debug(`MCP Provider calling tool ${toolName} with args: ${JSON.stringify(finalArgs)}`);

      // Call the MCP tool
      const result = await this.mcpClient.callTool(toolName, finalArgs);

      if (result.error) {
        return {
          error: `MCP tool error: ${result.error}`,
          raw: result,
        };
      }

      return {
        output: result.content,
        raw: result,
        metadata: {
          toolName,
          toolArgs: finalArgs,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`MCP Provider error: ${errorMessage}`);
      return {
        error: `MCP Provider error: ${errorMessage}`,
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.mcpClient.cleanup();
    } catch (error) {
      logger.error(
        `Error during MCP provider cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Method to call specific MCP tools directly
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ProviderResponse> {
    try {
      await this.initializationPromise;

      const result = await this.mcpClient.callTool(toolName, args);

      if (result.error) {
        return {
          error: `MCP tool error: ${result.error}`,
        };
      }

      return {
        output: result.content,
        raw: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `MCP tool call error: ${errorMessage}`,
      };
    }
  }

  // Get all available tools
  getAvailableTools() {
    return this.mcpClient.getAllTools();
  }

  // Get connected servers
  getConnectedServers() {
    return this.mcpClient.connectedServers;
  }
}
