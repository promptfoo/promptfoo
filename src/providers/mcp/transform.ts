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

  const serverConfigs = [...(config.servers ?? [])];
  if (config.server) {
    serverConfigs.push(config.server);
  }

  // An explicit `name` owns its key, so two servers sharing one is a config error.
  // Checked before transforming, which would otherwise fetch OAuth tokens for a
  // configuration we are about to reject.
  const names = serverConfigs.flatMap((server) => server.name ?? []);
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) {
    throw new Error(
      `Duplicate Claude Agent SDK MCP server \`${duplicateName}\`; give each configured server a unique \`name\`.`,
    );
  }

  const servers = await Promise.all(
    serverConfigs.map((server) => transformMCPServerConfigToClaudeCode(server)),
  );

  // An unnamed server falls back to a coarse identifier that several servers can
  // share, so suffix collisions instead of letting `Object.fromEntries` drop one.
  // The key becomes the SDK's server name — it lands in `mcp__<key>__<tool>` and in
  // debug logs — so it deliberately carries no `args`, `env`, or auth values.
  const taken = new Set(names);
  const entries = servers.map((server, index) => {
    const { name, url, command } = serverConfigs[index];
    if (name) {
      return [name, server] as const;
    }
    const fallback = url ? getUrlServerKey(url) : (command ?? 'default');
    let key = fallback;
    for (let suffix = 2; taken.has(key); suffix++) {
      key = `${fallback}_${suffix}`;
    }
    taken.add(key);
    return [key, server] as const;
  });

  return Object.fromEntries(entries);
}

// A URL can carry credentials in its userinfo, query, or fragment. Drop them from the key;
// a URL without them keeps its original key, so existing `mcp__<url>__<tool>` rules match.
function getUrlServerKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    // Not a parseable URL; the transform reports that separately.
  }
  return url;
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
