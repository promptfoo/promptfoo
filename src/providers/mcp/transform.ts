import { type McpConfigParsed, McpConfigSchema } from '../../contracts/providerConfig/mcp';
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
          ...(additionalProperties === undefined ? {} : { additionalProperties }),
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
  input: unknown,
): Promise<Record<string, ClaudeCodeMcpServerConfig>> {
  const config = validateMCPConfigForClaudeCode(input);

  if (config.enabled === false) {
    return {};
  }

  const serverConfigs = getServerConfigs(config);
  const servers = await Promise.all(
    serverConfigs.map((server) => transformMCPServerConfigToClaudeCode(server)),
  );
  return Object.fromEntries(
    servers.map((server, index) => [getClaudeCodeServerName(serverConfigs[index]), server]),
  );
}

function getServerConfigs(config: McpConfigParsed): MCPServerConfig[] {
  return [...(config.servers ?? []), ...(config.server ? [config.server] : [])];
}

/**
 * The SDK server name, which prefixes the server's tools as `mcp__<name>__<tool>`. Unnamed
 * servers keep the name they have always had, so existing tool allow and deny rules match.
 */
function getClaudeCodeServerName({ name, url, command }: MCPServerConfig): string {
  return name ?? url ?? command ?? 'default';
}

export function validateMCPConfigForClaudeCode(input: unknown): McpConfigParsed {
  const result = McpConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Claude Agent SDK MCP configuration is malformed: ${result.error.message}`);
  }
  const config = result.data;
  if (!config.enabled) {
    return config;
  }

  const hasUnsupportedExclusions =
    config.exclude_tools !== undefined &&
    (!Array.isArray(config.exclude_tools) || config.exclude_tools.length > 0);
  if (config.tools !== undefined || hasUnsupportedExclusions) {
    throw new Error(
      'Claude Agent SDK MCP integration does not support MCP tool allowlists or non-empty exclusions; remove `tools`/`exclude_tools` or disable MCP for this provider.',
    );
  }

  // Servers reach the SDK keyed by name, so a shared name would silently drop one. Rejecting
  // instead of renaming keeps every existing `mcp__<name>__<tool>` rule on the same server.
  const servers = getServerConfigs(config);
  const names = servers.map(getClaudeCodeServerName);
  const duplicate = servers.find((_, index) => names.indexOf(names[index]) !== index);
  if (duplicate) {
    // A url can carry credentials, so it is described rather than echoed.
    const shared =
      duplicate.name === undefined && duplicate.url
        ? 'the same `url`'
        : `the name \`${getClaudeCodeServerName(duplicate)}\``;
    throw new Error(
      `Two Claude Agent SDK MCP servers resolve to ${shared}; give each server a unique \`name\`.`,
    );
  }
  return config;
}

async function transformMCPServerConfigToClaudeCode(
  config: MCPServerConfig,
): Promise<ClaudeCodeMcpServerConfig> {
  let out: ClaudeCodeMcpServerConfig;

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
  } else if (config.command) {
    out = {
      type: 'stdio',
      command: config.command,
      args: config.args ?? [],
      ...(config.env && { env: config.env }),
    };
  } else if (config.path) {
    const isPy = config.path.endsWith('.py');
    const command = isPy ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;
    out = {
      type: 'stdio',
      command,
      args: [config.path],
      ...(config.env && { env: config.env }),
    };
  } else {
    throw new Error('MCP configuration cannot be converted to Claude Agent SDK MCP server config');
  }

  return out;
}
