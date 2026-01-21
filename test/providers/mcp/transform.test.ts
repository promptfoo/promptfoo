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
    // Types should be converted to uppercase for Gemini
    expect(parameters?.properties?.param).toEqual({ type: 'STRING' });
  });

  it('should remove additionalProperties from schema (GitHub issue #6902)', () => {
    // This is the exact issue from GitHub: MCP SDK generates additionalProperties: false
    // which Gemini does not support
    const mcpTools: MCPTool[] = [
      {
        name: 'test_tool',
        description: 'Tool with additionalProperties',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    expect(parameters).not.toHaveProperty('additionalProperties');
    expect(parameters).toEqual({
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' },
      },
    });
  });

  it('should convert lowercase types to uppercase for Gemini', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'type_test_tool',
        description: 'Tool testing type conversion',
        inputSchema: {
          type: 'object',
          properties: {
            strParam: { type: 'string' },
            numParam: { type: 'number' },
            intParam: { type: 'integer' },
            boolParam: { type: 'boolean' },
            arrParam: { type: 'array', items: { type: 'string' } },
            objParam: { type: 'object', properties: {} },
          },
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    expect(parameters?.type).toBe('OBJECT');
    expect(parameters?.properties?.strParam?.type).toBe('STRING');
    expect(parameters?.properties?.numParam?.type).toBe('NUMBER');
    expect(parameters?.properties?.intParam?.type).toBe('INTEGER');
    expect(parameters?.properties?.boolParam?.type).toBe('BOOLEAN');
    expect(parameters?.properties?.arrParam?.type).toBe('ARRAY');
    expect(parameters?.properties?.arrParam?.items?.type).toBe('STRING');
    expect(parameters?.properties?.objParam?.type).toBe('OBJECT');
  });

  it('should recursively sanitize nested schemas', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'nested_tool',
        description: 'Tool with nested schema',
        inputSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', default: 'unknown' },
                address: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    city: { type: 'string' },
                  },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    // Root level
    expect(parameters).not.toHaveProperty('additionalProperties');

    // Nested user object
    expect(parameters?.properties?.user).not.toHaveProperty('additionalProperties');
    expect(parameters?.properties?.user?.properties?.name).not.toHaveProperty('default');
    expect(parameters?.properties?.user?.type).toBe('OBJECT');

    // Deeply nested address object
    expect(parameters?.properties?.user?.properties?.address).not.toHaveProperty(
      'additionalProperties',
    );
    expect(parameters?.properties?.user?.properties?.address?.type).toBe('OBJECT');
    expect(parameters?.properties?.user?.properties?.address?.properties?.city?.type).toBe(
      'STRING',
    );
  });

  it('should handle MCP SDK Zod-generated schema (real-world scenario from issue #6902)', () => {
    // This represents exactly what the MCP SDK generates when using Zod schemas
    const mcpTools: MCPTool[] = [
      {
        name: 'analyze_prompt',
        description: 'Analyze a prompt for security issues',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to analyze',
            },
            categories: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Categories to check',
            },
            options: {
              type: 'object',
              properties: {
                maxTokens: {
                  type: 'number',
                  default: 1000,
                },
                strict: {
                  type: 'boolean',
                  default: true,
                },
              },
              additionalProperties: false,
            },
          },
          required: ['prompt'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    // Verify all unsupported properties are removed
    expect(parameters).not.toHaveProperty('$schema');
    expect(parameters).not.toHaveProperty('additionalProperties');
    expect(parameters?.properties?.options).not.toHaveProperty('additionalProperties');
    expect(parameters?.properties?.options?.properties?.maxTokens).not.toHaveProperty('default');
    expect(parameters?.properties?.options?.properties?.strict).not.toHaveProperty('default');

    // Verify types are converted to uppercase
    expect(parameters?.type).toBe('OBJECT');
    expect(parameters?.properties?.prompt?.type).toBe('STRING');
    expect(parameters?.properties?.categories?.type).toBe('ARRAY');
    expect(parameters?.properties?.categories?.items?.type).toBe('STRING');
    expect(parameters?.properties?.options?.type).toBe('OBJECT');
    expect(parameters?.properties?.options?.properties?.maxTokens?.type).toBe('NUMBER');
    expect(parameters?.properties?.options?.properties?.strict?.type).toBe('BOOLEAN');

    // Verify required is preserved
    expect(parameters?.required).toEqual(['prompt']);
  });

  it('should handle empty schema', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'empty_tool',
        description: 'Tool with empty schema',
        inputSchema: {},
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    expect(parameters?.type).toBe('OBJECT');
    expect(parameters?.properties).toEqual({});
  });

  it('should handle schema with only type field', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'simple_tool',
        description: 'Simple tool',
        inputSchema: {
          type: 'object',
        },
      },
    ];

    const result = transformMCPToolsToGoogle(mcpTools);
    const parameters = result[0].functionDeclarations?.[0].parameters;

    expect(parameters?.type).toBe('OBJECT');
    expect(parameters?.properties).toEqual({});
  });
});
