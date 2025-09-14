import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AbstractTool } from '../../../../src/commands/mcp/lib/baseTool';
import type { ToolResult } from '../../../../src/commands/mcp/lib/types';

// Mock implementation for testing
class TestTool extends AbstractTool {
  readonly name = 'test_tool';
  readonly description = 'A test tool';

  protected readonly schema = z.object({
    input: z.string(),
    count: z.number().optional(),
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { input, count } = this.schema.parse(args);
    return this.success({
      message: `Processed: ${input}`,
      count: count || 0,
    });
  }
}

// Tool without schema for testing
class NoSchemaTool extends AbstractTool {
  readonly name = 'no_schema_tool';
  readonly description = 'A tool without schema';

  protected async execute(args: unknown): Promise<ToolResult> {
    return this.success({ args });
  }
}

// Tool that throws errors for testing
class ErrorTool extends AbstractTool {
  readonly name = 'error_tool';
  readonly description = 'A tool that throws errors';

  protected async execute(_args: unknown): Promise<ToolResult> {
    throw new Error('Test error');
  }
}

describe('AbstractTool', () => {
  let mockServer: McpServer;
  let toolHandler: any;

  beforeEach(() => {
    // Create a mock MCP server
    mockServer = {
      tool: jest.fn((name, schema, handler) => {
        toolHandler = handler;
      }),
    } as any;
  });

  describe('registration', () => {
    it('should register tool with server', () => {
      const tool = new TestTool();
      tool.register(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'test_tool',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should register tool without schema', () => {
      const tool = new NoSchemaTool();
      tool.register(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith('no_schema_tool', {}, expect.any(Function));
    });
  });

  describe('execution', () => {
    it('should execute successfully with valid input', async () => {
      const tool = new TestTool();
      tool.register(mockServer);

      const result = await toolHandler({ input: 'test', count: 5 });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('test_tool'),
          },
        ],
        isError: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data).toEqual({
        message: 'Processed: test',
        count: 5,
      });
    });

    it('should validate schema when provided', async () => {
      const tool = new TestTool();
      tool.register(mockServer);

      const result = await toolHandler({ input: 123 }); // Invalid type

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Invalid arguments');
    });

    it('should handle missing required fields', async () => {
      const tool = new TestTool();
      tool.register(mockServer);

      const result = await toolHandler({ count: 5 }); // Missing required 'input'

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Invalid arguments');
    });

    it('should execute without schema validation', async () => {
      const tool = new NoSchemaTool();
      tool.register(mockServer);

      const args = { any: 'data', nested: { value: 123 } };
      const result = await toolHandler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.data.args).toEqual(args);
    });
  });

  describe('error handling', () => {
    it('should handle execution errors gracefully', async () => {
      const tool = new ErrorTool();
      tool.register(mockServer);

      const result = await toolHandler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Test error');
    });
  });

  describe('helper methods', () => {
    it('should validate required fields', () => {
      const tool = new TestTool();

      expect(() => tool['validateRequired'](null, 'field')).toThrow(
        'Missing required field: field',
      );
      expect(() => tool['validateRequired'](undefined, 'field')).toThrow(
        'Missing required field: field',
      );
      expect(tool['validateRequired']('value', 'field')).toBe('value');
      expect(tool['validateRequired'](0, 'field')).toBe(0);
      expect(tool['validateRequired'](false, 'field')).toBe(false);
    });

    it('should handle timeout operations', async () => {
      const tool = new TestTool();

      // Test successful operation
      const quickPromise = Promise.resolve('success');
      const result = await tool['withTimeout'](quickPromise, 1000, 'test operation');
      expect(result).toBe('success');

      // Test timeout
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 100));
      await expect(tool['withTimeout'](slowPromise, 10, 'test operation')).rejects.toThrow(
        'test operation timed out after 10ms',
      );
    });
  });
});
