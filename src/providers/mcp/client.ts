import path from 'path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import cliState from '../../cliState';
import { getEnvBool, getEnvInt } from '../../envars';
import logger from '../../logger';
import { TOKEN_REFRESH_BUFFER_MS, type TokenRefreshLock } from '../../util/oauth';
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

type MCPTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

interface RemoteTransportOptions {
  requestInit?: { headers: Record<string, string> };
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
  private tokenRefreshLocks: Map<string, TokenRefreshLock> = new Map();

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
    const serverKey = this.getServerKey(server);
    const client = this.createClient();
    const requestOptions = getEffectiveRequestOptions(this.config);

    try {
      const transport = await this.createConnectedTransport(
        server,
        serverKey,
        client,
        requestOptions,
      );
      await this.verifyConnection(client, serverKey, requestOptions);
      const filteredTools = await this.loadServerTools(client, requestOptions);
      this.registerConnection(serverKey, client, transport, filteredTools);
      this.logConnectedTools(serverKey, filteredTools);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.isDebugEnabled) {
        logger.error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
      }
      throw new Error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
    }
  }

  private getServerKey(server: MCPServerConfig): string {
    return server.name || server.url || server.path || 'default';
  }

  private createClient(): Client {
    return new Client({
      name: 'promptfoo-MCP',
      version: '1.0.0',
      description: 'Promptfoo MCP client for connecting to MCP servers during LLM evaluations',
    });
  }

  private async createConnectedTransport(
    server: MCPServerConfig,
    serverKey: string,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<MCPTransport> {
    if (server.command && server.args) {
      return this.connectCommandServer(server, client, requestOptions);
    }

    if (server.path) {
      return this.connectLocalServer(server, client, requestOptions);
    }

    if (server.url) {
      return this.connectRemoteServer(server, serverKey, client, requestOptions);
    }

    throw new Error('Either command+args or path or url must be specified for MCP server');
  }

  private async connectCommandServer(
    server: MCPServerConfig,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<StdioClientTransport> {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: server.command as string,
      args: server.args as string[],
      env: process.env as Record<string, string>,
    });
    await client.connect(transport, requestOptions);
    return transport;
  }

  private async connectLocalServer(
    server: MCPServerConfig,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<StdioClientTransport> {
    const serverPath = server.path as string;
    this.assertSupportedLocalServer(serverPath);

    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: this.getLocalServerCommand(serverPath),
      args: [this.resolveLocalServerPath(serverPath)],
      env: process.env as Record<string, string>,
    });
    await client.connect(transport, requestOptions);
    return transport;
  }

  private assertSupportedLocalServer(serverPath: string): void {
    if (!serverPath.endsWith('.js') && !serverPath.endsWith('.py')) {
      throw new Error('Local server must be a .js or .py file');
    }
  }

  private getLocalServerCommand(serverPath: string): string {
    if (!serverPath.endsWith('.py')) {
      return process.execPath;
    }

    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private resolveLocalServerPath(serverPath: string): string {
    return cliState.basePath ? path.resolve(cliState.basePath, serverPath) : serverPath;
  }

  private async connectRemoteServer(
    server: MCPServerConfig,
    serverKey: string,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<StreamableHTTPClientTransport | SSEClientTransport> {
    const { serverUrl, transportOptions } = await this.buildRemoteConnectionConfig(
      server,
      serverKey,
    );
    const streamableTransport = await this.tryConnectStreamableHttp(
      serverUrl,
      transportOptions,
      client,
      requestOptions,
    );
    if (streamableTransport) {
      return streamableTransport;
    }

    return this.connectSse(serverUrl, transportOptions, client, requestOptions);
  }

  private async buildRemoteConnectionConfig(
    server: MCPServerConfig,
    serverKey: string,
  ): Promise<{ serverUrl: string; transportOptions?: RemoteTransportOptions }> {
    const renderedServer = renderAuthVars(server);
    const authHeaders = await this.buildRemoteAuthHeaders(renderedServer, server, serverKey);
    const headers = {
      ...(server.headers || {}),
      ...authHeaders,
    };
    const queryParams = getAuthQueryParams(renderedServer);
    const serverUrl = applyQueryParams(server.url as string, queryParams);

    return {
      serverUrl,
      transportOptions: this.createRemoteTransportOptions(headers),
    };
  }

  private async buildRemoteAuthHeaders(
    renderedServer: MCPServerConfig,
    server: MCPServerConfig,
    serverKey: string,
  ): Promise<Record<string, string>> {
    if (renderedServer.auth?.type !== 'oauth') {
      return getAuthHeaders(renderedServer);
    }

    const oauthAuth = renderedServer.auth as MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth;
    logger.debug('[MCP] Fetching OAuth token');
    const { accessToken, expiresAt } = await getOAuthTokenWithExpiry(
      oauthAuth,
      server.url as string,
    );
    this.oauthConfigs.set(serverKey, {
      serverKey,
      serverConfig: server,
      auth: oauthAuth,
    });
    this.tokenExpiresAt.set(serverKey, expiresAt);
    return { Authorization: `Bearer ${accessToken}` };
  }

  private createRemoteTransportOptions(
    headers: Record<string, string>,
  ): RemoteTransportOptions | undefined {
    if (Object.keys(headers).length === 0) {
      return undefined;
    }

    return { requestInit: { headers } };
  }

  private async tryConnectStreamableHttp(
    serverUrl: string,
    transportOptions: RemoteTransportOptions | undefined,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<StreamableHTTPClientTransport | undefined> {
    try {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), transportOptions);
      await client.connect(transport, requestOptions);
      logger.debug('Connected using Streamable HTTP transport');
      return transport;
    } catch (error) {
      logger.debug(`Failed to connect to MCP server with Streamable HTTP transport: ${error}`);
      return undefined;
    }
  }

  private async connectSse(
    serverUrl: string,
    transportOptions: RemoteTransportOptions | undefined,
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<SSEClientTransport> {
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
    const transport = new SSEClientTransport(new URL(serverUrl), transportOptions);
    await client.connect(transport, requestOptions);
    logger.debug('Connected using SSE transport');
    return transport;
  }

  private async verifyConnection(
    client: Client,
    serverKey: string,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<void> {
    if (!this.config.pingOnConnect) {
      return;
    }

    try {
      await client.ping(requestOptions);
      logger.debug(`MCP server ${serverKey} ping successful`);
    } catch (pingError) {
      const pingErrorMessage = pingError instanceof Error ? pingError.message : String(pingError);
      throw new Error(`MCP server ${serverKey} ping failed: ${pingErrorMessage}`);
    }
  }

  private async loadServerTools(
    client: Client,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<MCPTool[]> {
    const toolsResult = await client.listTools(undefined, requestOptions);
    const serverTools =
      toolsResult?.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      })) || [];

    return this.filterTools(serverTools);
  }

  private filterTools(serverTools: MCPTool[]): MCPTool[] {
    let filteredTools = serverTools;
    if (this.config.tools) {
      filteredTools = filteredTools.filter((tool) => this.config.tools?.includes(tool.name));
    }
    if (this.config.exclude_tools) {
      filteredTools = filteredTools.filter(
        (tool) => !this.config.exclude_tools?.includes(tool.name),
      );
    }
    return filteredTools;
  }

  private registerConnection(
    serverKey: string,
    client: Client,
    transport: MCPTransport,
    tools: MCPTool[],
  ): void {
    this.transports.set(serverKey, transport);
    this.clients.set(serverKey, client);
    this.tools.set(serverKey, tools);
  }

  private logConnectedTools(serverKey: string, tools: MCPTool[]): void {
    if (!this.isVerboseEnabled) {
      return;
    }

    console.log(
      `Connected to MCP server ${serverKey} with tools:`,
      tools.map((tool) => tool.name),
    );
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

    await this.refreshOAuthToken(serverKey, oauthConfig, false);
  }

  private hasValidToken(serverKey: string): boolean {
    const expiresAt = this.tokenExpiresAt.get(serverKey);
    return (
      expiresAt != null &&
      this.clients.has(serverKey) &&
      Date.now() + TOKEN_REFRESH_BUFFER_MS < expiresAt
    );
  }

  private async refreshOAuthToken(
    serverKey: string,
    oauthConfig: OAuthServerConfig,
    forceRefresh: boolean,
  ): Promise<void> {
    // If a refresh is already in progress, wait for it instead of starting a new one.
    while (true) {
      const existingRefreshPromise = this.tokenRefreshLocks.get(serverKey)?.promise;
      if (!existingRefreshPromise) {
        break;
      }

      logger.debug(`[MCP] Token refresh already in progress for ${serverKey}, waiting...`);
      try {
        await existingRefreshPromise;
        // Verify token is still valid after waiting
        if (this.hasValidToken(serverKey)) {
          return;
        }
        // Token still needs refresh after waiting, so fall through and try again.
        logger.debug(`[MCP] Token still needs refresh for ${serverKey}, refreshing again...`);
      } catch {
        // If the in-progress refresh failed, we'll try again below
        logger.debug(`[MCP] Previous token refresh failed for ${serverKey}, retrying...`);
      }
    }

    if (!forceRefresh && this.hasValidToken(serverKey)) {
      logger.debug(`[MCP] Token for ${serverKey} still valid, no refresh needed`);
      return;
    }

    // Start a new token refresh and store the promise for deduplication
    logger.debug(`[MCP] Refreshing OAuth token for server ${serverKey}`);
    const refreshLock = { promise: this.performTokenRefresh(serverKey, oauthConfig) };
    this.tokenRefreshLocks.set(serverKey, refreshLock);

    try {
      await refreshLock.promise;
    } finally {
      // Only clear the lock if it's still the one we created (prevents race conditions)
      if (this.tokenRefreshLocks.get(serverKey) === refreshLock) {
        this.tokenRefreshLocks.delete(serverKey);
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

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const requestOptions = getEffectiveRequestOptions(this.config);
    const disconnectedServers: string[] = [];

    for (const [serverKey, serverTools] of this.tools.entries()) {
      if (!serverTools.some((tool) => tool.name === name)) {
        continue;
      }

      const result = await this.callToolOnServer(
        serverKey,
        name,
        args,
        requestOptions,
        disconnectedServers,
      );
      if (result) {
        return result;
      }
    }

    throw this.createMissingToolError(name, disconnectedServers);
  }

  private async callToolOnServer(
    serverKey: string,
    name: string,
    args: Record<string, unknown>,
    requestOptions: MCPRequestOptions | undefined,
    disconnectedServers: string[],
  ): Promise<MCPToolResult | undefined> {
    await this.tryRefreshOAuthToken(serverKey);

    const client = this.clients.get(serverKey);
    if (!client) {
      logger.debug(`[MCP] Server ${serverKey} is not connected, trying the next matching server`);
      disconnectedServers.push(serverKey);
      return undefined;
    }

    return this.invokeToolWithRetry(serverKey, client, name, args, requestOptions);
  }

  private async tryRefreshOAuthToken(serverKey: string): Promise<void> {
    try {
      await this.refreshOAuthTokenIfNeeded(serverKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(
        `[MCP] Failed to refresh OAuth token for ${serverKey}, trying the next matching server: ${errorMessage}`,
      );
    }
  }

  private async invokeToolWithRetry(
    serverKey: string,
    client: Client,
    name: string,
    args: Record<string, unknown>,
    requestOptions: MCPRequestOptions | undefined,
  ): Promise<MCPToolResult> {
    let currentClient = client;
    let retried = false;

    while (true) {
      try {
        const result = await currentClient.callTool(
          { name, arguments: args },
          undefined,
          requestOptions,
        );
        return this.createToolResult(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const retryClient = await this.refreshClientAfterAuthError(
          serverKey,
          errorMessage,
          retried,
        );
        if (retryClient) {
          retried = true;
          currentClient = retryClient;
          continue;
        }

        return this.createToolErrorResult(name, errorMessage);
      }
    }
  }

  private async refreshClientAfterAuthError(
    serverKey: string,
    errorMessage: string,
    retried: boolean,
  ): Promise<Client | undefined> {
    const oauthConfig = this.oauthConfigs.get(serverKey);
    if (retried || !oauthConfig || !this.isAuthError(errorMessage)) {
      return undefined;
    }

    logger.debug(`[MCP] Auth error for ${serverKey}, attempting reactive token refresh`);
    try {
      await this.refreshOAuthToken(serverKey, oauthConfig, true);
      return this.clients.get(serverKey);
    } catch (refreshError) {
      const refreshErrorMsg =
        refreshError instanceof Error ? refreshError.message : String(refreshError);
      logger.error(`[MCP] Token refresh failed for ${serverKey}: ${refreshErrorMsg}`);
      return undefined;
    }
  }

  private isAuthError(errorMessage: string): boolean {
    return (
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authorization_endpoint') ||
      errorMessage.includes('token')
    );
  }

  private createToolResult(result: unknown): MCPToolResult {
    return {
      content: this.normalizeToolContent(result),
      raw: result,
    };
  }

  private normalizeToolContent(result: unknown): string {
    const content = this.getResultContent(result);
    if (!content) {
      return '';
    }

    if (typeof content === 'string') {
      return this.normalizeStringContent(content);
    }

    if (Buffer.isBuffer(content)) {
      return content.toString();
    }

    return JSON.stringify(content);
  }

  private getResultContent(result: unknown): unknown {
    if (!result || typeof result !== 'object' || !('content' in result)) {
      return undefined;
    }

    return (result as { content?: unknown }).content;
  }

  private normalizeStringContent(content: string): string {
    try {
      const parsed = JSON.parse(content);
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      return content;
    }
  }

  private createToolErrorResult(name: string, errorMessage: string): MCPToolResult {
    if (this.isDebugEnabled) {
      logger.error(`Error calling tool ${name}: ${errorMessage}`);
    }

    return {
      content: '',
      error: errorMessage,
    };
  }

  private createMissingToolError(name: string, disconnectedServers: string[]): Error {
    if (disconnectedServers.length === 0) {
      return new Error(`Tool ${name} not found in any connected MCP server`);
    }

    const plural = disconnectedServers.length > 1 ? 's are' : ' is';
    return new Error(
      `Tool ${name} is known but MCP server${plural} disconnected: ${disconnectedServers.join(', ')}`,
    );
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
    this.tokenRefreshLocks.clear();
  }
}
