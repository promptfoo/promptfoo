import type Anthropic from '@anthropic-ai/sdk';
import type { OpenAiTool } from '../openai/util';
import type { MCPTool } from './types';

export function transformMCPToolsToOpenAi(tools: MCPTool[]): OpenAiTool[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema as any;
    let properties: Record<string, any> = {};
    let required: string[] | undefined = undefined;

    if (schema && typeof schema === 'object' && 'properties' in schema) {
      properties = schema.properties;
      required = schema.required;
    } else {
      properties = schema || {};
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
