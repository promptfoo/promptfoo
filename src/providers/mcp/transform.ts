import { getAuthHeaders } from './util';
import type { McpServerConfig as ClaudeCodeMcpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';

import type {
  FunctionDeclaration as GoogleFunctionDeclaration,
  Schema as GoogleSchema,
  Tool as GoogleTool,
} from '../google/types';
import type { OpenAiTool } from '../openai/util';
import type { MCPConfig, MCPServerConfig, MCPTool, MCPToolInputSchema } from './types';

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

export function transformMCPConfigToClaudeCode(
  config: MCPConfig,
): Record<string, ClaudeCodeMcpServerConfig> {
  const servers =
    config.servers?.map((server) => transformMCPServerConfigToClaudeCode(server)) ?? [];
  if (config.server) {
    servers.push(transformMCPServerConfigToClaudeCode(config.server));
  }
  return servers.reduce(
    (acc, transformed) => {
      const [key, out] = transformed;
      acc[key] = out;
      return acc;
    },
    {} as Record<string, ClaudeCodeMcpServerConfig>,
  );
}

function transformMCPServerConfigToClaudeCode(
  config: MCPServerConfig,
): [string, ClaudeCodeMcpServerConfig] {
  const key = config.name ?? config.url ?? config.command ?? 'default';
  let out: ClaudeCodeMcpServerConfig | undefined;

  if (config.url) {
    out = {
      type: 'http',
      url: config.url,
      headers: { ...(config.headers ?? {}), ...getAuthHeaders(config) },
    };
  } else if (config.command && config.args) {
    out = { type: 'stdio', command: config.command, args: config.args };
  } else if (config.path) {
    const isPy = config.path.endsWith('.py');
    const command = isPy ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;
    out = { type: 'stdio', command, args: [config.path] };
  } else {
    throw new Error('MCP configuration cannot be converted to Claude Agent SDK MCP server config');
  }

  return [key, out];
}
