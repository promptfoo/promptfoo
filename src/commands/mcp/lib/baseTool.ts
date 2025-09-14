import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodSchema } from 'zod';
import { isMcpError, toMcpError } from './errors';
import type { BaseTool, ToolResult } from './types';
import { createToolResponse } from './utils';

/**
 * Abstract base class for all MCP tools
 * Provides common functionality and enforces consistent structure
 */
export abstract class AbstractTool implements BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Optional schema for validating tool arguments
   */
  protected readonly schema?: ZodSchema;

  /**
   * The main tool implementation
   */
  protected abstract execute(args: unknown): Promise<ToolResult>;

  /**
   * Register this tool with the MCP server
   */
  register(server: McpServer): void {
    // Pass the Zod schema directly - MCP SDK handles conversion to JSON Schema
    server.tool(this.name, (this.schema as any) || {}, async (args: unknown) => {
      try {
        // Validate arguments if schema is provided
        if (this.schema) {
          const validationResult = this.schema.safeParse(args);
          if (!validationResult.success) {
            return createToolResponse(
              this.name,
              false,
              undefined,
              `Invalid arguments: ${validationResult.error.message}`,
            );
          }
          args = validationResult.data;
        }

        // Execute the tool
        return await this.execute(args);
      } catch (error) {
        const mcpError = toMcpError(error);
        return createToolResponse(
          this.name,
          false,
          isMcpError(error) ? error.toJSON() : undefined,
          mcpError.message,
        );
      }
    });
  }

  /**
   * Helper method to create successful responses
   */
  protected success<T>(data: T): ToolResult<T> {
    return createToolResponse(this.name, true, data);
  }

  /**
   * Helper method to create error responses
   */
  protected error(message: string, details?: unknown): ToolResult {
    return createToolResponse(this.name, false, details, message);
  }

  /**
   * Helper method to validate required arguments
   */
  protected validateRequired<T>(value: T | undefined | null, fieldName: string): T {
    if (value === undefined || value === null) {
      throw new Error(`Missing required field: ${fieldName}`);
    }
    return value;
  }

  /**
   * Helper method to handle async operations with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }
}
