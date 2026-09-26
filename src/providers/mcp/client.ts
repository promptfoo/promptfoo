import path from 'path';

import cliState from '../../cliState';
import { type McpConfigParsed, McpConfigSchema } from '../../contracts/providerConfig/mcp';
import { getEnvBool, getEnvInt, getProcessEnv } from '../../envars';
import logger from '../../logger';
import { isMissingPackageImportError } from '../../util/packageImportErrors';
import { withGenAIToolSpan } from '../tracing';
import {
  applyQueryParams,
  getAuthHeaders,
  getAuthQueryParams,
  getOAuthTokenWithExpiry,
  renderAuthVars,
  sanitizeMcpToolData,
} from './util';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';

import type {
  MCPConfig,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
} from './types';

/**
 * Sends every MCP HTTP request with the current OAuth token, so a refresh never has to
 * reconnect (which would abort other in-flight tool calls). The token cache replaces a
 * token shortly before it expires. A 401 means the server rejected the token before
 * handling the request, so only then is that request resent, once, with a new token.
 */
function createOAuthFetch(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
  serverUrl: string,
): FetchLike {
  return async (url, init) => {
    const send = async (rejectedToken?: string) => {
      const { accessToken } = await getOAuthTokenWithExpiry(auth, serverUrl, rejectedToken);
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      // biome-ignore lint/style/noRestrictedGlobals: SDK default; fetchWithProxy retries tool calls on 5xx
      return { accessToken, response: await fetch(url, { ...init, headers }) };
    };
    const first = await send();
    if (first.response.status !== 401) {
      return first.response;
    }
    logger.debug('[MCP] Server rejected the OAuth token; retrying with a new token');
    await first.response.body?.cancel();
    return (await send(first.accessToken)).response;
  };
}

/**
 * Environment for a spawned stdio MCP server: the promptfoo process environment with
 * the server's own `env` map layered on top. Per-server values win so a config can
 * override an inherited variable (e.g. a scoped token) without unsetting the rest.
 */
function getStdioEnv(server: MCPServerConfig): Record<string, string> {
  const parentEnv = getProcessEnv() as Record<string, string>;
  return server.env ? { ...parentEnv, ...server.env } : parentEnv;
}

/**
 * MCP SDK RequestOptions type for timeout configuration.
 */
interface MCPRequestOptions {
  timeout?: number;
  resetTimeoutOnProgress?: boolean;
  maxTotalTimeout?: number;
}

async function loadMcpClientSdk(): Promise<
  typeof import('@modelcontextprotocol/sdk/client/index.js')
> {
  try {
    return await import('@modelcontextprotocol/sdk/client/index.js');
  } catch (error) {
    if (isMissingPackageImportError(error, '@modelcontextprotocol/sdk')) {
      throw new Error(
        'The @modelcontextprotocol/sdk package is required for MCP provider support. Install it with: npm install @modelcontextprotocol/sdk',
      );
    }
    throw error;
  }
}

/**
 * Get the effective request options for MCP requests.
 * Priority: config values > MCP_REQUEST_TIMEOUT_MS env var > undefined (SDK default of 60s)
 */
function getEffectiveRequestOptions(config: MCPConfig): MCPRequestOptions | undefined {
  const timeout = config.timeout ?? getEnvInt('MCP_REQUEST_TIMEOUT_MS');

  // If no timeout options are set, return undefined to use SDK defaults
  if (!timeout && !config.resetTimeoutOnProgress && !config.maxTotalTimeout) {
    return undefined;
  }

  const options: MCPRequestOptions = {};

  if (timeout) {
    options.timeout = timeout;
  }

  if (config.resetTimeoutOnProgress) {
    options.resetTimeoutOnProgress = config.resetTimeoutOnProgress;
  }

  if (config.maxTotalTimeout) {
    options.maxTotalTimeout = config.maxTotalTimeout;
  }

  return options;
}

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private config: McpConfigParsed;
  private transports: Map<
    string,
    StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
  > = new Map();

  get hasInitialized(): boolean {
    return this.clients.size > 0;
  }

  get connectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if debug mode is enabled (config takes priority over env var)
   */
  private get isDebugEnabled(): boolean {
    return this.config.debug ?? getEnvBool('MCP_DEBUG') ?? false;
  }

  /**
   * Check if verbose mode is enabled (config takes priority over env var)
   */
  private get isVerboseEnabled(): boolean {
    return this.config.verbose ?? getEnvBool('MCP_VERBOSE') ?? false;
  }

  constructor(config: unknown) {
    this.config = McpConfigSchema.parse(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Initialize servers
    const servers = this.config.servers || (this.config.server ? [this.config.server] : []);
    const usedKeys = new Set(this.clients.keys());
    for (const server of servers) {
      const baseKey = server.name || server.url || server.path || server.command || 'default';
      let serverKey = baseKey;
      for (let suffix = 1; usedKeys.has(serverKey); suffix++) {
        serverKey = `${baseKey}:${suffix}`;
      }
      usedKeys.add(serverKey);
      logger.info(`connecting to server ${serverKey}`);
      await this.connectToServer(server, serverKey);
    }
  }

  private async connectToServer(server: MCPServerConfig, serverKey: string): Promise<void> {
    const { Client } = await loadMcpClientSdk();
    const client = new Client({
      name: 'promptfoo-MCP',
      version: '1.0.0',
      description: 'Promptfoo MCP client for connecting to MCP servers during LLM evaluations',
    });

    let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    try {
      const requestOptions = getEffectiveRequestOptions(this.config);

      if (server.command) {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        // NPM package or other command execution
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args ?? [],
          env: getStdioEnv(server),
        });
        await client.connect(transport, requestOptions);
      } else if (server.path) {
        // Local server file
        const isJs = server.path.endsWith('.js');
        const isPy = server.path.endsWith('.py');
        if (!isJs && !isPy) {
          throw new Error('Local server must be a .js or .py file');
        }

        const command = isPy
          ? process.platform === 'win32'
            ? 'python'
            : 'python3'
          : process.execPath;
        const serverPath = cliState.basePath
          ? path.resolve(cliState.basePath, server.path)
          : server.path;

        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        transport = new StdioClientTransport({
          command,
          args: [serverPath],
          env: getStdioEnv(server),
        });
        await client.connect(transport, requestOptions);
      } else if (server.url) {
        // Render environment variables in auth config
        const renderedServer = renderAuthVars(server);

        // OAuth tokens are attached per request (see createOAuthFetch) using the configured
        // tokenUrl or discovery, which avoids the SDK's authorization_endpoint requirement.
        // Fetching one now makes bad credentials fail the connection. Other auth types
        // (bearer, basic, api_key) use static headers.
        let oauthFetch: FetchLike | undefined;
        let authHeaders: Record<string, string> = {};
        if (renderedServer.auth?.type === 'oauth') {
          const oauthAuth = renderedServer.auth as
            | MCPOAuthClientCredentialsAuth
            | MCPOAuthPasswordAuth;
          logger.debug('[MCP] Fetching OAuth token');
          await getOAuthTokenWithExpiry(oauthAuth, server.url);
          oauthFetch = createOAuthFetch(oauthAuth, server.url);
        } else {
          authHeaders = getAuthHeaders(renderedServer);
        }

        const headers = { ...server.headers, ...authHeaders };

        // Apply query params for api_key with query placement
        const queryParams = getAuthQueryParams(renderedServer);
        const serverUrl = applyQueryParams(server.url, queryParams);

        const transportOptions = {
          ...(Object.keys(headers).length > 0 && { requestInit: { headers } }),
          ...(oauthFetch && { fetch: oauthFetch }),
        };
        const hasOptions = Object.keys(transportOptions).length > 0;

        try {
          const { StreamableHTTPClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/streamableHttp.js'
          );
          transport = new StreamableHTTPClientTransport(
            new URL(serverUrl),
            hasOptions ? transportOptions : undefined,
          );
          await client.connect(transport, requestOptions);
          logger.debug('Connected using Streamable HTTP transport');
        } catch (error) {
          logger.debug(
            `Failed to connect to MCP server with Streamable HTTP transport ${serverKey}: ${error}`,
          );
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
          transport = new SSEClientTransport(
            new URL(serverUrl),
            hasOptions ? transportOptions : undefined,
          );
          await client.connect(transport, requestOptions);
          logger.debug('Connected using SSE transport');
        }
      } else {
        throw new Error('Either command or path or url must be specified for MCP server');
      }

      // Ping server to verify connection if configured
      if (this.config.pingOnConnect) {
        try {
          await client.ping(requestOptions);
          logger.debug(`MCP server ${serverKey} ping successful`);
        } catch (pingError) {
          const pingErrorMessage =
            pingError instanceof Error ? pingError.message : String(pingError);
          throw new Error(`MCP server ${serverKey} ping failed: ${pingErrorMessage}`);
        }
      }

      // List available tools
      const toolsResult = await client.listTools(
        undefined, // no pagination params
        requestOptions,
      );
      const serverTools =
        toolsResult?.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
        })) || [];

      // Filter tools if specified
      let filteredTools = serverTools;
      if (this.config.tools) {
        filteredTools = serverTools.filter((tool) => this.config.tools?.includes(tool.name));
      }
      if (this.config.exclude_tools) {
        filteredTools = filteredTools.filter(
          (tool) => !this.config.exclude_tools?.includes(tool.name),
        );
      }

      this.transports.set(serverKey, transport);
      this.clients.set(serverKey, client);
      this.tools.set(serverKey, filteredTools);

      if (this.isVerboseEnabled) {
        console.log(
          `Connected to MCP server ${serverKey} with tools:`,
          filteredTools.map((tool) => tool.name),
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.isDebugEnabled) {
        logger.error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
      }
      throw new Error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
    }
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values()).flat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    return await withGenAIToolSpan(
      { name, arguments: sanitizeMcpToolData(args), resultFormat: 'mcp' },
      () => this.callToolInternal(name, args),
    );
  }

  private async callToolInternal(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const requestOptions = getEffectiveRequestOptions(this.config);

    // Find which server has this tool
    for (const [serverKey, serverTools] of this.tools.entries()) {
      const client = this.clients.get(serverKey);
      if (!client || !serverTools.some((tool) => tool.name === name)) {
        continue;
      }
      try {
        const result = await client.callTool(
          { name, arguments: args },
          undefined, // use default result schema
          requestOptions,
        );

        // Handle different content types appropriately
        let content = '';
        if (result?.content) {
          if (typeof result.content === 'string') {
            // Try to parse JSON first, fall back to raw string
            try {
              const parsed = JSON.parse(result.content);
              content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            } catch {
              content = result.content;
            }
          } else if (Buffer.isBuffer(result.content)) {
            content = result.content.toString();
          } else {
            content = JSON.stringify(result.content);
          }
        }

        return {
          content,
          ...(result.isError ? { isError: true } : {}),
          raw: result,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (this.isDebugEnabled) {
          logger.error(`Error calling tool ${name}: ${errorMessage}`);
        }
        return {
          content: '',
          error: errorMessage,
        };
      }
    }

    throw new Error(`Tool ${name} not found in any connected MCP server`);
  }

  async cleanup(): Promise<void> {
    for (const [serverKey, client] of this.clients.entries()) {
      try {
        const transport = this.transports.get(serverKey);
        if (transport) {
          await transport.close();
        }
        await client.close();
      } catch (error) {
        if (this.isDebugEnabled) {
          logger.error(
            `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    this.clients.clear();
    this.transports.clear();
    this.tools.clear();
  }
}
