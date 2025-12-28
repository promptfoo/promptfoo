import { describe, expect, it } from 'vitest';
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

    // When inputSchema has type but no properties field, we should return empty properties
    // This is a malformed schema - MCP tools should have proper JSON Schema format
    const expected: OpenAiTool[] = [
      {
        type: 'function',
        function: {
          name: 'simple_tool',
          description: 'A simple tool',
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

  it('should remove $schema field from inputSchema', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool_with_schema',
        description: 'Tool with $schema field',
        inputSchema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result[0].function.parameters).not.toHaveProperty('$schema');
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {
        param: { type: 'string' },
      },
    });
  });

  it('should preserve additionalProperties when present', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool_with_additional_props',
        description: 'Tool with additionalProperties',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('should handle schema from MCP SDK with all metadata fields', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'mcp_sdk_tool',
        description: 'Tool with MCP SDK generated schema',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    // Should not include $schema but should include additionalProperties
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    expect(result[0].function.parameters).not.toHaveProperty('$schema');
  });

  it('should not include required field when empty', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool_empty_required',
        description: 'Tool with empty required array',
        inputSchema: {
          properties: {
            param: { type: 'string' },
          },
          required: [],
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result[0].function.parameters).not.toHaveProperty('required');
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {
        param: { type: 'string' },
      },
    });
  });

  it('should handle schema without properties field', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool_no_properties',
        description: 'Tool without properties field',
        inputSchema: {
          type: 'object',
        },
      },
    ];

    const result = transformMCPToolsToOpenAi(mcpTools);
    expect(result[0].function.parameters).toEqual({
      type: 'object',
      properties: {},
    });
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

  it('should remove $schema field from inputSchema', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'tool_with_schema',
        description: 'Tool with $schema field',
        inputSchema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
      },
    ];

    const result = transformMCPToolsToAnthropic(mcpTools);
    expect(result[0].input_schema).not.toHaveProperty('$schema');
    expect(result[0].input_schema).toEqual({
      type: 'object',
      properties: {
        param: { type: 'string' },
      },
    });
  });

  it('should handle empty input schemas', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'no_input_tool',
        description: 'Tool with no input parameters',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ];

    const result = transformMCPToolsToAnthropic(mcpTools);
    expect(result[0].input_schema).not.toHaveProperty('$schema');
    expect(result[0].input_schema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
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
