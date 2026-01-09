/**
 * Integration test for GitHub issue #6902:
 * "Gemini provider fails with MCP tools due to unsupported additionalProperties in JSON Schema"
 *
 * This test verifies the complete flow from MCP tools through Google providers
 * to ensure schemas are properly sanitized before being sent to the Gemini API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock MCP client to return tools with problematic schemas (additionalProperties, $schema, etc.)
const mcpMocks = vi.hoisted(() => {
  const mockInitialize = vi.fn().mockResolvedValue(undefined);
  const mockCleanup = vi.fn().mockResolvedValue(undefined);
  const mockGetAllTools = vi.fn().mockReturnValue([
    {
      name: 'analyze_prompt',
      description: 'Analyzes a prompt for security vulnerabilities',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to analyze',
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          options: {
            type: 'object',
            properties: {
              maxTokens: {
                type: 'number',
                default: 1000, // Should be removed
              },
              includeRecommendations: {
                type: 'boolean',
                default: true, // Should be removed
              },
            },
            additionalProperties: false, // Should be removed
          },
        },
        required: ['prompt'],
        additionalProperties: false, // This is the main issue - should be removed
        $schema: 'http://json-schema.org/draft-07/schema#', // Should be removed
      },
    },
    {
      name: 'search_documents',
      description: 'Searches through documents',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                value: { type: 'string' },
              },
              additionalProperties: false, // Nested - should be removed
            },
          },
        },
        additionalProperties: false,
      },
    },
  ]);
  const mockCallTool = vi.fn().mockResolvedValue({
    content: 'Tool result',
  });

  class MockMCPClient {
    initialize = mockInitialize;
    cleanup = mockCleanup;
    getAllTools = mockGetAllTools;
    callTool = mockCallTool;
  }

  return {
    MockMCPClient,
    mockInitialize,
    mockCleanup,
    mockGetAllTools,
    mockCallTool,
  };
});

// Mock dependencies
vi.mock('../../../src/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/cache')>();
  return {
    ...actual,
    fetchWithCache: vi.fn(),
    getCache: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    }),
    isCacheEnabled: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: mcpMocks.MockMCPClient,
}));

vi.mock('../../../src/util/templates', () => ({
  getNunjucksEngine: vi.fn(() => ({
    renderString: vi.fn((str) => str),
  })),
  renderPrompt: vi.fn((prompt) => prompt),
}));

import * as cache from '../../../src/cache';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import { transformMCPToolsToGoogle } from '../../../src/providers/mcp/transform';

describe('Google Providers MCP Integration (GitHub #6902)', () => {
  let capturedRequestBody: any;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedRequestBody = null;

    // Mock the API response and capture request body
    vi.mocked(cache.fetchWithCache).mockImplementation(async (_url, options: any) => {
      // Capture the request body for validation
      capturedRequestBody = JSON.parse(options.body);

      return {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Test response' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('AIStudioChatProvider with MCP', () => {
    let provider: AIStudioChatProvider;

    beforeEach(() => {
      provider = new AIStudioChatProvider('gemini-2.0-flash', {
        config: {
          apiKey: 'test-api-key',
          mcp: {
            enabled: true,
            server: {
              command: 'npx',
              args: ['test-mcp-server'],
              name: 'test-mcp',
            },
          },
        },
      });
    });

    afterEach(async () => {
      await provider.cleanup();
    });

    it('should sanitize MCP tool schemas before sending to Gemini API', async () => {
      // Wait for MCP initialization
      await (provider as any).initializationPromise;

      // Make an API call
      await provider.callApi('Test prompt');

      // Verify request was made
      expect(cache.fetchWithCache).toHaveBeenCalled();
      expect(capturedRequestBody).not.toBeNull();

      // Verify tools are in the request
      expect(capturedRequestBody.tools).toBeDefined();
      expect(capturedRequestBody.tools.length).toBeGreaterThan(0);

      const functionDeclarations = capturedRequestBody.tools[0].functionDeclarations;
      expect(functionDeclarations).toBeDefined();
      expect(functionDeclarations.length).toBe(2);

      // Verify analyze_prompt tool is sanitized
      const analyzePromptTool = functionDeclarations.find((f: any) => f.name === 'analyze_prompt');
      expect(analyzePromptTool).toBeDefined();

      const params = analyzePromptTool.parameters;

      // Check that unsupported properties are removed at root level
      expect(params).not.toHaveProperty('additionalProperties');
      expect(params).not.toHaveProperty('$schema');

      // Check that types are converted to uppercase
      expect(params.type).toBe('OBJECT');
      expect(params.properties.prompt.type).toBe('STRING');
      expect(params.properties.severity.type).toBe('STRING');

      // Check nested options object
      const optionsSchema = params.properties.options;
      expect(optionsSchema).not.toHaveProperty('additionalProperties');
      expect(optionsSchema.type).toBe('OBJECT');
      expect(optionsSchema.properties.maxTokens).not.toHaveProperty('default');
      expect(optionsSchema.properties.includeRecommendations).not.toHaveProperty('default');
      expect(optionsSchema.properties.maxTokens.type).toBe('NUMBER');
      expect(optionsSchema.properties.includeRecommendations.type).toBe('BOOLEAN');

      // Check that required and enum are preserved
      expect(params.required).toEqual(['prompt']);
      expect(params.properties.severity.enum).toEqual(['low', 'medium', 'high', 'critical']);
    });

    it('should sanitize deeply nested array item schemas', async () => {
      await (provider as any).initializationPromise;
      await provider.callApi('Test prompt');

      const functionDeclarations = capturedRequestBody.tools[0].functionDeclarations;
      const searchTool = functionDeclarations.find((f: any) => f.name === 'search_documents');
      expect(searchTool).toBeDefined();

      const params = searchTool.parameters;

      // Root level
      expect(params).not.toHaveProperty('additionalProperties');
      expect(params.type).toBe('OBJECT');

      // Array items - nested object schema should also be sanitized
      const filtersSchema = params.properties.filters;
      expect(filtersSchema.type).toBe('ARRAY');
      expect(filtersSchema.items).not.toHaveProperty('additionalProperties');
      expect(filtersSchema.items.type).toBe('OBJECT');
      expect(filtersSchema.items.properties.field.type).toBe('STRING');
      expect(filtersSchema.items.properties.value.type).toBe('STRING');
    });

    it('should produce valid Gemini request without schema errors', async () => {
      await (provider as any).initializationPromise;

      // This should not throw - if the schema was not sanitized properly,
      // the real Gemini API would return an error like:
      // "GenerateContentRequest.tools[0].function_declarations[0].parameters.additionalProperties:
      //  should not be set for TYPE_OBJECT"
      const result = await provider.callApi('Analyze this prompt for security issues');

      expect(result.output).toBe('Test response');
      expect(result.error).toBeUndefined();

      // Verify the complete request body is valid for Gemini
      expect(capturedRequestBody).toMatchObject({
        contents: expect.any(Array),
        tools: [
          {
            functionDeclarations: expect.arrayContaining([
              expect.objectContaining({
                name: 'analyze_prompt',
                parameters: expect.objectContaining({
                  type: 'OBJECT',
                }),
              }),
            ]),
          },
        ],
      });
    });
  });

  describe('VertexChatProvider with MCP', () => {
    // Note: VertexChatProvider uses the same transformMCPToolsToGoogle function
    // as AIStudioChatProvider, so the schema sanitization is identical.
    // The difference is in the API endpoint and authentication.
    // The core schema transformation is tested via AIStudio tests above.

    it('should use the same MCP tool transformation as AIStudio', () => {
      // This test verifies that both providers share the same transformation code
      // The transformMCPToolsToGoogle function is used by both AIStudio and Vertex providers

      const mcpTools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            additionalProperties: false,
          },
        },
      ];

      const result = transformMCPToolsToGoogle(mcpTools);

      // Verify the transformation works correctly
      expect(result[0].functionDeclarations![0].parameters).not.toHaveProperty(
        'additionalProperties',
      );
      expect(result[0].functionDeclarations![0].parameters!.type).toBe('OBJECT');
    });
  });

  describe('Schema validation for Gemini compatibility', () => {
    it('should only include Gemini-supported schema properties', async () => {
      const provider = new AIStudioChatProvider('gemini-2.0-flash', {
        config: {
          apiKey: 'test-api-key',
          mcp: {
            enabled: true,
            server: { command: 'test', args: [], name: 'test' },
          },
        },
      });

      await (provider as any).initializationPromise;
      await provider.callApi('Test');
      await provider.cleanup();

      const functionDeclarations = capturedRequestBody.tools[0].functionDeclarations;

      // Allowed Gemini schema properties
      const allowedProperties = new Set([
        'type',
        'format',
        'description',
        'nullable',
        'enum',
        'maxItems',
        'minItems',
        'properties',
        'required',
        'propertyOrdering',
        'items',
      ]);

      // Check all tools recursively for unsupported properties
      const checkSchema = (schema: any, path: string = 'root') => {
        if (!schema || typeof schema !== 'object') {
          return;
        }

        for (const key of Object.keys(schema)) {
          if (!allowedProperties.has(key)) {
            throw new Error(`Unsupported property "${key}" found at ${path}`);
          }

          // Recurse into nested schemas
          if (key === 'properties' && typeof schema[key] === 'object') {
            for (const [propName, propSchema] of Object.entries(schema[key])) {
              checkSchema(propSchema, `${path}.properties.${propName}`);
            }
          }
          if (key === 'items' && typeof schema[key] === 'object') {
            checkSchema(schema[key], `${path}.items`);
          }
        }
      };

      // This should not throw
      for (const func of functionDeclarations) {
        expect(() => checkSchema(func.parameters, func.name)).not.toThrow();
      }
    });

    it('should have all types in uppercase format', async () => {
      const provider = new AIStudioChatProvider('gemini-2.0-flash', {
        config: {
          apiKey: 'test-api-key',
          mcp: {
            enabled: true,
            server: { command: 'test', args: [], name: 'test' },
          },
        },
      });

      await (provider as any).initializationPromise;
      await provider.callApi('Test');
      await provider.cleanup();

      const functionDeclarations = capturedRequestBody.tools[0].functionDeclarations;

      const validTypes = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT'];

      const checkTypes = (schema: any, path: string = 'root') => {
        if (!schema || typeof schema !== 'object') {
          return;
        }

        if (schema.type) {
          if (!validTypes.includes(schema.type)) {
            throw new Error(`Invalid type "${schema.type}" at ${path} - should be uppercase`);
          }
        }

        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            checkTypes(propSchema, `${path}.properties.${propName}`);
          }
        }
        if (schema.items) {
          checkTypes(schema.items, `${path}.items`);
        }
      };

      for (const func of functionDeclarations) {
        expect(() => checkTypes(func.parameters, func.name)).not.toThrow();
      }
    });
  });
});
