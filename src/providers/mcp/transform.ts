import type Anthropic from '@anthropic-ai/sdk';
import type {
  Tool as GoogleTool,
  FunctionDeclaration as GoogleFunctionDeclaration,
  Schema as GoogleSchema,
} from '../google/types';
import type { OpenAiTool } from '../openai/util';
import type { MCPTool, MCPToolInputSchema } from './types';

export function transformMCPToolsToOpenAi(tools: MCPTool[]): OpenAiTool[] {
  return tools.map((tool) => {
    const schema: MCPToolInputSchema = tool.inputSchema;
    let properties: Record<string, any> = {};
    let required: string[] | undefined = undefined;

    if (schema && typeof schema === 'object' && 'properties' in schema) {
      properties = schema.properties ?? {};
      required = schema.required;
    } else {
      properties = (schema as Record<string, any>) || {};
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties,
          ...(required ? { required } : {}),
        },
      },
    };
  });
}

export function transformMCPToolsToAnthropic(tools: MCPTool[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      ...tool.inputSchema,
    },
  }));
}

export function transformMCPToolsToGoogle(tools: MCPTool[]): GoogleTool[] {
  const functionDeclarations: GoogleFunctionDeclaration[] = tools.map((tool) => {
    const schema: MCPToolInputSchema = tool.inputSchema;
    let parameters: GoogleSchema = { type: 'OBJECT', properties: {} };
    if (schema && typeof schema === 'object' && 'properties' in schema) {
      // Remove $schema field if present
      const { $schema: _$schema, ...cleanSchema } = schema;
      parameters = { type: 'OBJECT', ...cleanSchema };
    } else {
      parameters = {
        type: 'OBJECT',
        properties: (schema as Record<string, any>) || {},
      };
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  });
  return [{ functionDeclarations }];
}
