import { sanitizeSchemaForGemini } from '../google/util';
import {
  applyQueryParams,
  getAuthHeaders,
  getAuthQueryParams,
  getOAuthToken,
  renderAuthVars,
  requiresAsyncAuth,
} from './util';
import type { McpServerConfig as ClaudeCodeMcpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';

import type {
  FunctionDeclaration as GoogleFunctionDeclaration,
  Schema as GoogleSchema,
  Tool as GoogleTool,
} from '../google/types';
import type { OpenAiTool } from '../openai/util';
import type {
  MCPConfig,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
  MCPTool,
  MCPToolInputSchema,
} from './types';

export function transformMCPToolsToOpenAi(tools: MCPTool[]): OpenAiTool[] {
  return tools.map((tool) => {
    const schema: MCPToolInputSchema = tool.inputSchema;
    let properties: Record<string, any> = {};
    let required: string[] | undefined = undefined;
    let additionalProperties: boolean | Record<string, any> | undefined = undefined;

    if (schema && typeof schema === 'object' && 'properties' in schema) {
      // Extract properties and required fields from the schema
      properties = schema.properties ?? {};
      required = schema.required;

      // Preserve additionalProperties if it exists
      if ('additionalProperties' in schema) {
        additionalProperties = schema.additionalProperties;
      }
    } else if (schema && typeof schema === 'object') {
      // Schema exists but doesn't have properties field
      // This shouldn't normally happen with MCP SDK, but handle it gracefully
      properties = {};
    } else {
      // No schema or invalid schema
      properties = {};
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties,
          ...(required && required.length > 0 ? { required } : {}),
          ...(additionalProperties !== undefined ? { additionalProperties } : {}),
        },
      },
    };
  });
}

export function transformMCPToolsToAnthropic(tools: MCPTool[]): Anthropic.Tool[] {
  return tools.map((tool) => {
    // Remove $schema field if present to prevent provider errors
    const { $schema: _$schema, ...cleanSchema } = tool.inputSchema;
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        ...cleanSchema,
      },
    };
  });
}

export function transformMCPToolsToGoogle(tools: MCPTool[]): GoogleTool[] {
  const functionDeclarations: GoogleFunctionDeclaration[] = tools.map((tool) => {
    const schema: MCPToolInputSchema = tool.inputSchema;
    let parameters: GoogleSchema;

    if (schema && typeof schema === 'object') {
      // Sanitize schema for Gemini compatibility:
      // - Removes unsupported properties (additionalProperties, $schema, default, etc.)
      // - Converts types to uppercase (string → STRING)
      // - Recursively processes nested schemas
      parameters = sanitizeSchemaForGemini(schema) as GoogleSchema;

      // Ensure type is OBJECT at root level for function parameters
      if (!parameters.type) {
        parameters.type = 'OBJECT';
      }

      // Ensure properties exists
      if (!parameters.properties) {
        parameters.properties = {};
      }
    } else {
      parameters = { type: 'OBJECT', properties: {} };
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  });
  return [{ functionDeclarations }];
}

export async function transformMCPConfigToClaudeCode(
  config: MCPConfig,
): Promise<Record<string, ClaudeCodeMcpServerConfig>> {
  const serverConfigs = config.servers ?? [];
  if (config.server) {
    serverConfigs.push(config.server);
  }

  const servers = await Promise.all(
    serverConfigs.map((server) => transformMCPServerConfigToClaudeCode(server)),
  );

  return servers.reduce(
    (acc, transformed) => {
      const [key, out] = transformed;
      acc[key] = out;
      return acc;
    },
    {} as Record<string, ClaudeCodeMcpServerConfig>,
  );
}

async function transformMCPServerConfigToClaudeCode(
  config: MCPServerConfig,
): Promise<[string, ClaudeCodeMcpServerConfig]> {
  const key = config.name ?? config.url ?? config.command ?? 'default';
  let out: ClaudeCodeMcpServerConfig | undefined;

  if (config.url) {
    // Render environment variables in auth config
    const renderedConfig = renderAuthVars(config);

    // Handle OAuth token fetching if needed
    let oauthToken: string | undefined;
    if (requiresAsyncAuth(renderedConfig) && renderedConfig.auth?.type === 'oauth') {
      oauthToken = await getOAuthToken(
        renderedConfig.auth as MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
      );
    }

    // Apply query params for api_key with query placement
    const queryParams = getAuthQueryParams(renderedConfig);
    const serverUrl = applyQueryParams(config.url, queryParams);

    out = {
      type: 'http',
      url: serverUrl,
      headers: { ...(config.headers ?? {}), ...getAuthHeaders(renderedConfig, oauthToken) },
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
