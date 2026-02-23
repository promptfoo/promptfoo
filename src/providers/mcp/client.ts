import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getEnvBool, getEnvInt } from '../../envars';
import logger from '../../logger';
import { TOKEN_REFRESH_BUFFER_MS } from '../../util/oauth';
import {
  applyQueryParams,
  getAuthHeaders,
  getAuthQueryParams,
  getOAuthTokenWithExpiry,
  renderAuthVars,
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
 * Stored OAuth configuration for a server, used for token refresh.
 */
interface OAuthServerConfig {
  serverKey: string;
  serverConfig: MCPServerConfig;
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth;
}

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
  // Store OAuth configs for servers that need token refresh (when tokenUrl is configured)
  private oauthConfigs: Map<string, OAuthServerConfig> = new Map();
  // Track token expiration time per server
  private tokenExpiresAt: Map<string, number> = new Map();
  // Lock mechanism to prevent concurrent token refresh per server
  private tokenRefreshPromise: Map<string, Promise<void>> = new Map();

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

  /**
   * Create a stdio transport for command-based servers.
   */
  private async createCommandTransport(
    server: MCPServerConfig,
    requestOptions: MCPRequestOptions | undefined,
    client: Client,
  ): Promise<StdioClientTransport> {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: server.command!,
      args: server.args!,
      env: process.env as Record<string, string>,
    });
    await client.connect(transport, requestOptions);
    return transport;
  }

  /**
   * Create a stdio transport for local file-based servers.
   */
  private async createPathTransport(
    server: MCPServerConfig,
    requestOptions: MCPRequestOptions | undefined,
    client: Client,
  ): Promise<StdioClientTransport> {
    const isJs = server.path!.endsWith('.js');
    const isPy = server.path!.endsWith('.py');
    if (!isJs && !isPy) {
      throw new Error('Local server must be a .js or .py file');
    }

    const command = isPy ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;

    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command,
      args: [server.path!],
      env: process.env as Record<string, string>,
    });
    await client.connect(transport, requestOptions);
    return transport;
  }

  /**
   * Resolve OAuth auth headers and store config for later refresh.
   */
  private async resolveOAuthHeaders(
    renderedServer: MCPServerConfig,
    server: MCPServerConfig,
    serverKey: string,
  ): Promise<Record<string, string>> {
    const oauthAuth = renderedServer.auth as MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth;
    logger.debug('[MCP] Fetching OAuth token');
    const { accessToken, expiresAt } = await getOAuthTokenWithExpiry(oauthAuth, server.url!);
    this.oauthConfigs.set(serverKey, { serverKey, serverConfig: server, auth: oauthAuth });
    this.tokenExpiresAt.set(serverKey, expiresAt);
    return { Authorization: `Bearer ${accessToken}` };
  }

  /**
   * Create an HTTP/SSE transport for URL-based servers.
   */
  private async createUrlTransport(
    server: MCPServerConfig,
    serverKey: string,
    requestOptions: MCPRequestOptions | undefined,
    client: Client,
  ): Promise<SSEClientTransport | StreamableHTTPClientTransport> {
    const renderedServer = renderAuthVars(server);

    const authHeaders =
      renderedServer.auth?.type === 'oauth'
        ? await this.resolveOAuthHeaders(renderedServer, server, serverKey)
        : getAuthHeaders(renderedServer);

    const headers = { ...(server.headers || {}), ...authHeaders };
    const queryParams = getAuthQueryParams(renderedServer);
    const serverUrl = applyQueryParams(server.url!, queryParams);

    const transportOptions: { requestInit?: { headers: Record<string, string> } } = {};
    if (Object.keys(headers).length > 0) {
      transportOptions.requestInit = { headers };
    }
    const hasOptions = Object.keys(transportOptions).length > 0;

    try {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const transport = new StreamableHTTPClientTransport(
        new URL(serverUrl),
        hasOptions ? transportOptions : undefined,
      );
      await client.connect(transport, requestOptions);
      logger.debug('Connected using Streamable HTTP transport');
      return transport;
    } catch (error) {
      logger.debug(
        `Failed to connect to MCP server with Streamable HTTP transport ${serverKey}: ${error}`,
      );
      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      const transport = new SSEClientTransport(
        new URL(serverUrl),
        hasOptions ? transportOptions : undefined,
      );
      await client.connect(transport, requestOptions);
      logger.debug('Connected using SSE transport');
      return transport;
    }
  }

  /**
   * Create the appropriate transport for a server config.
   */
  private async createTransport(
    server: MCPServerConfig,
    serverKey: string,
    requestOptions: MCPRequestOptions | undefined,
    client: Client,
  ): Promise<StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport> {
    if (server.command && server.args) {
      return this.createCommandTransport(server, requestOptions, client);
    }
    if (server.path) {
      return this.createPathTransport(server, requestOptions, client);
    }
    if (server.url) {
      return this.createUrlTransport(server, serverKey, requestOptions, client);
    }
    throw new Error('Either command+args or path or url must be specified for MCP server');
  }

  /**
   * Filter server tools based on include/exclude config.
   */
  private filterServerTools(serverTools: MCPTool[]): MCPTool[] {
    let filtered = serverTools;
    if (this.config.tools) {
      filtered = filtered.filter((tool) => this.config.tools?.includes(tool.name));
    }
    if (this.config.exclude_tools) {
      filtered = filtered.filter((tool) => !this.config.exclude_tools?.includes(tool.name));
    }
    return filtered;
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

      transport = await this.createTransport(server, serverKey, requestOptions, client);

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
      const toolsResult = await client.listTools(undefined, requestOptions);
      const serverTools =
        toolsResult?.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
        })) || [];

      const filteredTools = this.filterServerTools(serverTools);

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

  /**
   * Proactively refresh OAuth token for a server if it's close to expiration.
   * Uses a locking mechanism to prevent concurrent refresh attempts.
   */
  private async refreshOAuthTokenIfNeeded(serverKey: string): Promise<void> {
    const oauthConfig = this.oauthConfigs.get(serverKey);
    if (!oauthConfig) {
      return;
    }

    const now = Date.now();
    const expiresAt = this.tokenExpiresAt.get(serverKey);

    // Check if token is still valid (with buffer)
    if (expiresAt && now + TOKEN_REFRESH_BUFFER_MS < expiresAt) {
      logger.debug(`[MCP] Token for ${serverKey} still valid, no refresh needed`);
      return;
    }

    // If a refresh is already in progress, wait for it instead of starting a new one
    const existingRefresh = this.tokenRefreshPromise.get(serverKey);
    if (existingRefresh) {
      logger.debug(`[MCP] Token refresh already in progress for ${serverKey}, waiting...`);
      try {
        await existingRefresh;
        // Verify token is still valid after waiting
        const newExpiresAt = this.tokenExpiresAt.get(serverKey);
        if (newExpiresAt && Date.now() + TOKEN_REFRESH_BUFFER_MS < newExpiresAt) {
          return;
        }
        // Token expired while waiting, fall through to refresh again
        logger.debug(`[MCP] Token expired while waiting for ${serverKey}, refreshing again...`);
      } catch {
        // If the in-progress refresh failed, we'll try again below
        logger.debug(`[MCP] Previous token refresh failed for ${serverKey}, retrying...`);
      }
    }

    // Start a new token refresh and store the promise for deduplication
    logger.debug(`[MCP] Proactively refreshing OAuth token for server ${serverKey}`);
    const refreshPromise = this.performTokenRefresh(serverKey, oauthConfig);
    this.tokenRefreshPromise.set(serverKey, refreshPromise);

    try {
      await refreshPromise;
    } finally {
      // Only clear the promise if it's still the one we created (prevents race conditions)
      if (this.tokenRefreshPromise.get(serverKey) === refreshPromise) {
        this.tokenRefreshPromise.delete(serverKey);
      }
    }
  }

  /**
   * Perform the actual token refresh and reconnection.
   */
  private async performTokenRefresh(
    serverKey: string,
    oauthConfig: OAuthServerConfig,
  ): Promise<void> {
    // Close existing connection
    const existingTransport = this.transports.get(serverKey);
    const existingClient = this.clients.get(serverKey);
    if (existingTransport) {
      await existingTransport.close().catch(() => {});
    }
    if (existingClient) {
      await existingClient.close().catch(() => {});
    }

    // Remove old entries (keep tools and oauthConfig)
    this.clients.delete(serverKey);
    this.transports.delete(serverKey);

    // Reconnect with fresh token
    await this.connectToServer(oauthConfig.serverConfig);
    logger.debug(`[MCP] Successfully refreshed OAuth token for server ${serverKey}`);
  }

  /**
   * Extract string content from a tool call result.
   */
  private extractToolContent(resultContent: unknown): string {
    if (!resultContent) {
      return '';
    }
    if (typeof resultContent === 'string') {
      try {
        const parsed = JSON.parse(resultContent);
        return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        return resultContent;
      }
    }
    if (Buffer.isBuffer(resultContent)) {
      return resultContent.toString();
    }
    return JSON.stringify(resultContent);
  }

  /**
   * Check if an error message indicates an auth/token error.
   */
  private isAuthError(errorMessage: string): boolean {
    return (
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authorization_endpoint') ||
      errorMessage.includes('token')
    );
  }

  /**
   * Attempt a reactive token refresh and return the new client, or null on failure.
   */
  private async attemptTokenRefresh(serverKey: string): Promise<Client | null> {
    const oauthConfig = this.oauthConfigs.get(serverKey);
    if (!oauthConfig) {
      return null;
    }
    logger.debug(`[MCP] Auth error for ${serverKey}, attempting reactive token refresh`);
    try {
      await this.performTokenRefresh(serverKey, oauthConfig);
      return this.clients.get(serverKey) || null;
    } catch (refreshError) {
      const refreshErrorMsg =
        refreshError instanceof Error ? refreshError.message : String(refreshError);
      logger.error(`[MCP] Token refresh failed for ${serverKey}: ${refreshErrorMsg}`);
      return null;
    }
  }

  /**
   * Call a tool on a specific server, with retry on auth errors.
   */
  private async callToolOnServer(
    name: string,
    args: Record<string, unknown>,
    serverKey: string,
    initialClient: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<MCPToolResult> {
    let currentClient = initialClient;
    let retried = false;

    while (true) {
      try {
        const result = await currentClient.callTool(
          { name, arguments: args },
          undefined,
          requestOptions,
        );
        return { content: this.extractToolContent(result?.content) };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (!retried && this.isAuthError(errorMessage)) {
          retried = true;
          const newClient = await this.attemptTokenRefresh(serverKey);
          if (newClient) {
            currentClient = newClient;
            continue;
          }
        }

        if (this.isDebugEnabled) {
          logger.error(`Error calling tool ${name}: ${errorMessage}`);
        }
        return { content: '', error: errorMessage };
      }
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const requestOptions = getEffectiveRequestOptions(this.config);

    for (const [serverKey, client] of this.clients.entries()) {
      const serverTools = this.tools.get(serverKey) || [];
      if (!serverTools.some((tool) => tool.name === name)) {
        continue;
      }

      // Proactively refresh token if close to expiration
      await this.refreshOAuthTokenIfNeeded(serverKey);

      // Get the current client (may have changed after token refresh)
      const currentClient = this.clients.get(serverKey) || client;
      return this.callToolOnServer(name, args, serverKey, currentClient, requestOptions);
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
    this.oauthConfigs.clear();
    this.tokenExpiresAt.clear();
    this.tokenRefreshPromise.clear();
  }
}
