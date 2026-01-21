/**
 * End-to-end test for GitHub issue #6902:
 * "Gemini provider fails with MCP tools due to unsupported additionalProperties in JSON Schema"
 *
 * This test verifies the complete transformation pipeline from MCP SDK Zod schemas
 * to Gemini-compatible tool schemas.
 */
import { describe, expect, it } from 'vitest';
import { transformMCPToolsToGoogle } from '../../../src/providers/mcp/transform';

import type { MCPTool } from '../../../src/providers/mcp/types';

describe('GitHub Issue #6902 - Gemini MCP Schema Compatibility (E2E)', () => {
  it('should transform MCP SDK Zod schema to valid Gemini schema', () => {
    // This is exactly what MCP SDK generates when using Zod with z.object({...}).strict()
    const mcpZodGeneratedTools: MCPTool[] = [
      {
        name: 'analyze-prompt',
        description: 'Analyzes a prompt for potential security vulnerabilities',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt text to analyze',
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Minimum severity threshold',
            },
            options: {
              type: 'object',
              properties: {
                maxLength: {
                  type: 'number',
                  default: 4096,
                },
                includeRecommendations: {
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

    // Transform to Google/Gemini format
    const googleTools = transformMCPToolsToGoogle(mcpZodGeneratedTools);

    // Validate structure
    expect(googleTools).toHaveLength(1);
    expect(googleTools[0].functionDeclarations).toHaveLength(1);

    const funcDecl = googleTools[0].functionDeclarations![0];
    expect(funcDecl.name).toBe('analyze-prompt');
    expect(funcDecl.description).toBe('Analyzes a prompt for potential security vulnerabilities');

    // Validate the schema is Gemini-compliant
    const params = funcDecl.parameters!;

    // 1. No unsupported properties at root level
    expect(params).not.toHaveProperty('$schema');
    expect(params).not.toHaveProperty('additionalProperties');

    // 2. Types are uppercase (Gemini requirement)
    expect(params.type).toBe('OBJECT');
    expect(params.properties!.prompt.type).toBe('STRING');
    expect(params.properties!.severity.type).toBe('STRING');
    expect(params.properties!.options!.type).toBe('OBJECT');

    // 3. Nested schemas are also sanitized
    const optionsSchema = params.properties!.options as Record<string, any>;
    expect(optionsSchema).not.toHaveProperty('additionalProperties');
    expect(optionsSchema.properties!.maxLength).not.toHaveProperty('default');
    expect(optionsSchema.properties!.includeRecommendations).not.toHaveProperty('default');
    expect(optionsSchema.properties!.maxLength.type).toBe('NUMBER');
    expect(optionsSchema.properties!.includeRecommendations.type).toBe('BOOLEAN');

    // 4. Supported properties are preserved
    expect(params.required).toEqual(['prompt']);
    expect(params.properties!.prompt.description).toBe('The prompt text to analyze');
    expect(params.properties!.severity.enum).toEqual(['low', 'medium', 'high', 'critical']);
  });

  it('should produce schema that matches Gemini API expectations', () => {
    // Minimal reproduction of the issue
    const problematicTool: MCPTool[] = [
      {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          additionalProperties: false, // This was causing the error!
        },
      },
    ];

    const googleTools = transformMCPToolsToGoogle(problematicTool);
    const params = googleTools[0].functionDeclarations![0].parameters!;

    // The resulting schema should be valid for Gemini:
    // - type: OBJECT (uppercase)
    // - properties with STRING type (uppercase)
    // - NO additionalProperties
    expect(params).toEqual({
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' },
      },
    });

    // This schema should now work with Gemini without:
    // "GenerateContentRequest.tools[0].function_declarations[0].parameters.properties[query].additionalProperties:
    //  should not be set for TYPE_OBJECT"
  });

  it('should handle complex nested array and object schemas', () => {
    const complexTool: MCPTool[] = [
      {
        name: 'process-data',
        description: 'Process complex data structures',
        inputSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  metadata: {
                    type: 'object',
                    properties: {
                      tags: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                        maxItems: 10,
                      },
                    },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    ];

    const googleTools = transformMCPToolsToGoogle(complexTool);
    const params = googleTools[0].functionDeclarations![0].parameters!;

    // Verify deep nesting is properly sanitized
    expect(params).not.toHaveProperty('$schema');
    expect(params).not.toHaveProperty('additionalProperties');

    const itemsSchema = params.properties!.items as Record<string, any>;
    expect(itemsSchema.type).toBe('ARRAY');

    const itemSchema = itemsSchema.items as Record<string, any>;
    expect(itemSchema.type).toBe('OBJECT');
    expect(itemSchema).not.toHaveProperty('additionalProperties');

    const metadataSchema = itemSchema.properties.metadata as Record<string, any>;
    expect(metadataSchema.type).toBe('OBJECT');
    expect(metadataSchema).not.toHaveProperty('additionalProperties');

    // minItems and maxItems should be preserved
    const tagsSchema = metadataSchema.properties.tags as Record<string, any>;
    expect(tagsSchema.minItems).toBe(1);
    expect(tagsSchema.maxItems).toBe(10);
  });
});
