import logger from '../../logger';
import { MCPClient } from './client';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types';
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

      // Parse the prompt as JSON to extract tool call information
      let toolCallData: any;
      try {
        toolCallData = JSON.parse(context?.vars.prompt as string);
      } catch {
        return {
          error:
            'Invalid JSON in prompt. MCP provider expects a JSON payload with tool call information.',
        };
      }

      // Extract tool name from various possible fields
      const toolName =
        toolCallData.tool ||
        toolCallData.toolName ||
        toolCallData.function ||
        toolCallData.functionName ||
        toolCallData.name;

      if (!toolName || typeof toolName !== 'string') {
        return {
          error:
            'No tool name found in JSON payload. Expected format: {"tool": "function_name", "args": {...}}',
        };
      }

      // Extract tool arguments from various possible fields
      let toolArgs =
        toolCallData.args ||
        toolCallData.arguments ||
        toolCallData.params ||
        toolCallData.parameters ||
        {};

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
          originalPayload: toolCallData,
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
  async getAvailableTools() {
    await this.initializationPromise;

    return this.mcpClient.getAllTools();
  }

  // Get connected servers
  getConnectedServers() {
    return this.mcpClient.connectedServers;
  }
}
