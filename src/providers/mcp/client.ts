import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getEnvBool, getEnvInt } from '../../envars';
import logger from '../../logger';
import {
  applyQueryParams,
  getAuthHeaders,
  getAuthQueryParams,
  getOAuthToken,
  renderAuthVars,
  requiresAsyncAuth,
} from './util';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {
  MCPConfig,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
} from './types';

/**
 * MCP SDK RequestOptions type for timeout configuration.
 */
interface MCPRequestOptions {
  timeout?: number;
  resetTimeoutOnProgress?: boolean;
  maxTotalTimeout?: number;
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
  private config: MCPConfig;
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

  constructor(config: MCPConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Initialize servers
    const servers = this.config.servers || (this.config.server ? [this.config.server] : []);
    for (const server of servers) {
      logger.info(`connecting to server ${server.name || server.url || server.path || 'default'}`);
      await this.connectToServer(server);
    }
  }

  private async connectToServer(server: MCPServerConfig): Promise<void> {
    const serverKey = server.name || server.url || server.path || 'default';
    const client = new Client({
      name: 'promptfoo-MCP',
      version: '1.0.0',
      description: 'Promptfoo MCP client for connecting to MCP servers during LLM evaluations',
    });

    let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    try {
      const requestOptions = getEffectiveRequestOptions(this.config);

      if (server.command && server.args) {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        // NPM package or other command execution
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: process.env as Record<string, string>,
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

        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        transport = new StdioClientTransport({
          command,
          args: [server.path],
          env: process.env as Record<string, string>,
        });
        await client.connect(transport, requestOptions);
      } else if (server.url) {
        // Render environment variables in auth config
        const renderedServer = renderAuthVars(server);

        // Handle OAuth token fetching if needed
        let oauthToken: string | undefined;
        if (requiresAsyncAuth(renderedServer) && renderedServer.auth?.type === 'oauth') {
          oauthToken = await getOAuthToken(
            renderedServer.auth as MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
          );
        }

        // Get auth headers and combine with custom headers
        const authHeaders = getAuthHeaders(renderedServer, oauthToken);
        const headers = {
          ...(server.headers || {}),
          ...authHeaders,
        };

        // Apply query params for api_key with query placement
        const queryParams = getAuthQueryParams(renderedServer);
        const serverUrl = applyQueryParams(server.url, queryParams);

        // Only set options if we have headers
        const options = Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined;

        try {
          const { StreamableHTTPClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/streamableHttp.js'
          );
          transport = new StreamableHTTPClientTransport(new URL(serverUrl), options);
          await client.connect(transport, requestOptions);
          logger.debug('Connected using Streamable HTTP transport');
        } catch (error) {
          logger.debug(
            `Failed to connect to MCP server with Streamable HTTP transport ${serverKey}: ${error}`,
          );
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
          transport = new SSEClientTransport(new URL(serverUrl), options);
          await client.connect(transport, requestOptions);
          logger.debug('Connected using SSE transport');
        }
      } else {
        throw new Error('Either command+args or path or url must be specified for MCP server');
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
    const requestOptions = getEffectiveRequestOptions(this.config);

    // Find which server has this tool
    for (const [serverKey, client] of this.clients.entries()) {
      const serverTools = this.tools.get(serverKey) || [];
      if (serverTools.some((tool) => tool.name === name)) {
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
