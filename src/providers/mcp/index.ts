import { type McpConfigParsed, McpConfigSchema } from '../../contracts/providerConfig/mcp';
import logger from '../../logger';
import { awaitWithAbort } from '../../util/abort';
import { loadTransformModule } from '../transformUtils';
import { McpClientSession } from './session';
import { createTransformResponse, type MCPTransformResponseContext } from './transforms';
import { sanitizeMcpToolData } from './util';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { MCPClient } from './client';
import type { MCPConfig } from './types';

interface MCPProviderOptions {
  config?: MCPConfig;
  id?: string;
  // Default args to pass to tools
  defaultArgs?: Record<string, unknown>;
}

export class MCPProvider implements ApiProvider {
  private mcpClient: MCPClient | null = null;
  private mcpSession: McpClientSession;
  config: McpConfigParsed;
  private defaultArgs?: Record<string, unknown>;
  private transformResponse: Promise<
    (
      result: unknown,
      content: string,
      context: MCPTransformResponseContext,
    ) => Promise<ProviderResponse>
  >;

  constructor(options: MCPProviderOptions = {}) {
    this.config = McpConfigSchema.parse(options.config ?? {});
    this.defaultArgs = options.defaultArgs ?? this.config.defaultArgs ?? {};

    this.mcpSession = new McpClientSession(this.config, this);
    // Initialization starts eagerly, so mark the rejection as observed until callers await it.
    void this.initialize().catch(() => undefined);
    this.transformResponse = loadTransformModule(
      this.config.transformResponse || this.config.responseParser,
    ).then(createTransformResponse);

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

  private async initialize(signal?: AbortSignal): Promise<void> {
    const client = await this.mcpSession.initialize(signal);
    const changed = this.mcpClient !== client;
    this.mcpClient = client;

    if (this.config.verbose && changed) {
      const tools = this.mcpClient!.getAllTools();
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
      await this.initialize(options?.abortSignal);

      // Parse the prompt as JSON to extract tool call information
      let toolCallData: any;
      try {
        const rawToolCall = context?.vars?.prompt ?? prompt;
        toolCallData = JSON.parse(String(rawToolCall));
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

      logger.debug('MCP Provider calling tool', {
        toolName,
        argumentNames: Object.keys(finalArgs),
      });

      // Call the MCP tool
      const result = await this.mcpClient!.callTool(toolName, finalArgs, options?.abortSignal);

      if (result.error) {
        return {
          error: `MCP tool error: ${result.error}`,
          raw: result,
        };
      }

      const transformContext = {
        toolName,
        toolArgs: finalArgs,
        originalPayload: toolCallData,
      };
      try {
        return await this.transformToolResult(result, transformContext, options?.abortSignal);
      } catch (error) {
        if (!options?.abortSignal?.aborted) {
          throw error;
        }
        return {
          error: 'MCP Provider error: ' + (error instanceof Error ? error.message : String(error)),
          raw: result.raw ?? result,
          metadata: transformContext,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MCP Provider error', { error: errorMessage });
      return {
        error: `MCP Provider error: ${errorMessage}`,
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.mcpSession.cleanup();
    } catch (error) {
      logger.error(
        `Error during MCP provider cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Method to call specific MCP tools directly
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ProviderResponse> {
    try {
      await this.initialize();

      const toolArgs = { ...this.defaultArgs, ...args };
      const result = await this.mcpClient!.callTool(toolName, toolArgs);

      if (result.error) {
        return {
          error: `MCP tool error: ${result.error}`,
        };
      }

      return this.transformToolResult(result, {
        toolName,
        toolArgs,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `MCP tool call error: ${errorMessage}`,
      };
    }
  }

  // Get all available tools
  async getAvailableTools() {
    await this.initialize();

    return this.mcpClient!.getAllTools();
  }

  private async transformToolResult(
    result: Awaited<ReturnType<MCPClient['callTool']>>,
    context: MCPTransformResponseContext,
    signal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const transform = await awaitWithAbort(this.transformResponse, signal);
    signal?.throwIfAborted();
    const transformedResponse = await awaitWithAbort(
      transform(result.raw ?? result, result.content, context),
      signal,
    );

    return {
      ...transformedResponse,
      raw: transformedResponse.raw ?? result.raw ?? result,
      metadata: {
        ...transformedResponse.metadata,
        toolName: context.toolName,
        toolArgs: sanitizeMcpToolData(context.toolArgs),
        ...(context.originalPayload === undefined
          ? {}
          : { originalPayload: sanitizeMcpToolData(context.originalPayload) }),
      },
    };
  }

  // Get connected servers
  getConnectedServers() {
    return this.mcpSession.client?.connectedServers ?? [];
  }
}
