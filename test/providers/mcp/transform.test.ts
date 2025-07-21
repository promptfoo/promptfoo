import {
  transformMCPToolsToAnthropic,
  transformMCPToolsToGoogle,
  transformMCPToolsToOpenAi,
} from '../../../src/providers/mcp/transform';
import type Anthropic from '@anthropic-ai/sdk';

import type { MCPTool } from '../../../src/providers/mcp/types';
import type { OpenAiTool } from '../../../src/providers/openai/util';

describe('transformMCPToolsToOpenAi', () => {
  it('should transform MCP tools to OpenAI format', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' },
          },
          required: ['param1'],
        },
      },
    ];

    const expected: OpenAiTool[] = [
      {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
              param2: { type: 'number' },
            },
            required: ['param1'],
          },
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result).toEqual(expected);
  });

  it('should handle tools without properties in schema', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'simple_tool',
        description: 'A simple tool',
        inputSchema: {
          type: 'string',
        },
      },
    ];

    const expected: OpenAiTool[] = [
      {
        type: 'function',
        function: {
          name: 'simple_tool',
          description: 'A simple tool',
          parameters: {
            type: 'object',
            properties: {
              type: 'string',
            },
          },
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result).toEqual(expected);
  });

  it('should handle empty input schema', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'empty_tool',
        description: 'A tool with empty schema',
        inputSchema: {},
      },
    ];

    const expected: OpenAiTool[] = [
      {
        type: 'function',
        function: {
          name: 'empty_tool',
          description: 'A tool with empty schema',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result).toEqual(expected);
  });

  it('should handle multiple tools', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool1',
        description: 'First tool',
        inputSchema: {
          properties: {
            param1: { type: 'string' },
          },
        },
      },
      {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: {
          properties: {
            param2: { type: 'number' },
          },
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result).toHaveLength(2);
    expect(result[0].function.name).toBe('tool1');
    expect(result[1].function.name).toBe('tool2');
  });
});

describe('transformMCPToolsToAnthropic', () => {
  it('should transform MCP tools to Anthropic format', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      },
    ];

    const expected: Anthropic.Tool[] = [
      {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      },
    ];

    const result = transformMCPToolsToAnthropic(mcpTools);
    expect(result).toEqual(expected);
  });
});

describe('transformMCPToolsToGoogle', () => {
  it('should transform MCP tools to Google format', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    expect(result).toHaveLength(1);
    expect(result[0].functionDeclarations).toHaveLength(1);
    expect(result[0].functionDeclarations?.[0].name).toBe('test_tool');
    expect(result[0].functionDeclarations?.[0].description).toBe('A test tool');
    expect(result[0].functionDeclarations?.[0].parameters?.type).toBe('OBJECT');
  });

  it('should remove $schema field from tool definitions', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          properties: {
            param: { type: 'string' },
          },
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    expect(parameters).not.toHaveProperty('$schema');
    expect(parameters?.properties?.param).toEqual({ type: 'string' });
  });
});
