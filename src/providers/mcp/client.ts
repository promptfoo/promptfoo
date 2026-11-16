import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'path';

import cliState from '../../cliState';
import { type McpConfigParsed, McpConfigSchema } from '../../contracts/providerConfig/mcp';
import { getEnvBool, getEnvInt, getProcessEnv } from '../../envars';
import logger from '../../logger';
import { isCallerAbortError } from '../../util/fetch/requestSignal';
import { isMissingPackageImportError } from '../../util/packageImportErrors';
import { waitForPromiseWithAbort } from '../shared';
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
import type { RequestOptions as MCPRequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';

import type {
  MCPConfig,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
} from './types';

const oauthRequestSignal = new AsyncLocalStorage<AbortSignal>();

interface PublishedMcpTool {
  serverKey: string;
  physicalName: string;
  tool: MCPTool;
}

/** Keep unique names unchanged. Qualify only colliding tool names, using ordinal
 * server IDs instead of addresses or arbitrary config names that may contain secrets. */
function publishMcpToolNames(toolsByServer: ReadonlyMap<string, MCPTool[]>): PublishedMcpTool[] {
  const reserved = new Set<string>();
  for (const tools of toolsByServer.values()) {
    for (const tool of tools) {
      reserved.add(tool.name);
    }
  }
  const usedNames = new Set<string>();
  const published: PublishedMcpTool[] = [];
  let serverNumber = 0;
  for (const [serverKey, tools] of toolsByServer) {
    serverNumber++;
    // Alias suffixes must be tied to physical names, not listTools response order:
    // reconnects may return the same tools in a different order.
    const serverRoutes = new Map<string, PublishedMcpTool>();
    const sortedTools = [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const tool of sortedTools) {
      // Preserve the first server's unqualified tool for existing callers.
      // Later servers with the same tool name receive a unique public alias.
      if (!usedNames.has(tool.name)) {
        usedNames.add(tool.name);
        serverRoutes.set(tool.name, { serverKey, physicalName: tool.name, tool });
        continue;
      }
      const prefix = `mcp_${serverNumber}_`;
      const safeName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      let candidate = '';
      for (let suffix = 1; ; suffix++) {
        const postfix = suffix > 1 ? `_${suffix}` : '';
        candidate =
          prefix + safeName.slice(0, Math.max(0, 64 - prefix.length - postfix.length)) + postfix;
        if (!reserved.has(candidate)) {
          break;
        }
      }
      reserved.add(candidate);
      serverRoutes.set(tool.name, {
        serverKey,
        physicalName: tool.name,
        tool: {
          ...tool,
          name: candidate,
          description: `${tool.description}${tool.description ? ' ' : ''}(MCP server #${serverNumber})`,
        },
      });
    }
    // Preserve the provider's presentation order without using it as identity.
    for (const tool of tools) {
      const route = serverRoutes.get(tool.name);
      if (route) {
        published.push(route);
      }
    }
  }
  return published;
}

/**
 * Refresh tokens per request without reconnecting and aborting other tool calls.
 * Retry a rejected token once on HTTP 401; return other failures without a retry.
 */
function createOAuthFetch(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
  serverUrl: string,
): FetchLike {
  return async (url, init) => {
    // SDK transports pass their lifetime signal, not the individual tool request's signal.
    // Only bind tools/call: the SDK must still be able to send notifications/cancelled.
    let requestSignal: AbortSignal | undefined;
    if (typeof init?.body === 'string') {
      try {
        if (JSON.parse(init.body).method === 'tools/call') {
          requestSignal = oauthRequestSignal.getStore();
        }
      } catch {
        // Non-JSON transport requests use only their transport signal.
      }
    }
    const signal =
      requestSignal && init?.signal
        ? AbortSignal.any([requestSignal, init.signal])
        : (requestSignal ?? init?.signal);
    const send = async (rejectedToken?: string) => {
      signal?.throwIfAborted();
      const { accessToken } = await getOAuthTokenWithExpiry(
        auth,
        serverUrl,
        rejectedToken,
        signal ?? undefined,
      );
      signal?.throwIfAborted();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      // biome-ignore lint/style/noRestrictedGlobals: SDK default; fetchWithProxy retries tool calls on 5xx
      return { accessToken, response: await fetch(url, { ...init, headers, signal }) };
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

  private cleanupPromise: Promise<void> | null = null;
  private startupController = new AbortController();
  private readonly pendingConnections = new Set<() => Promise<void>>();

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
    if (this.cleanupPromise) {
      await this.cleanupPromise;
    }
    if (!this.config.enabled) {
      return;
    }

    if (this.startupController.signal.aborted) {
      this.startupController = new AbortController();
    }
    const signal = this.startupController.signal;
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
      await this.connectToServer(server, serverKey, signal);
    }
  }

  private async connectToServer(
    server: MCPServerConfig,
    serverKey: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const { Client } = await loadMcpClientSdk();
    signal.throwIfAborted();
    const client = new Client({
      name: 'promptfoo-MCP',
      version: '1.0.0',
      description: 'Promptfoo MCP client for connecting to MCP servers during LLM evaluations',
    });

    let transport:
      | StdioClientTransport
      | SSEClientTransport
      | StreamableHTTPClientTransport
      | undefined;
    let closingTransport: typeof transport;
    let closePromise: Promise<void> | undefined;
    const close = () => {
      if (!closePromise || closingTransport !== transport) {
        closingTransport = transport;
        closePromise = this.closeConnection(client, transport);
      }
      return closePromise;
    };
    this.pendingConnections.add(close);
    try {
      const requestOptions = { ...getEffectiveRequestOptions(this.config), signal };

      if (server.command) {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        signal.throwIfAborted();
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
        signal.throwIfAborted();
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
          await getOAuthTokenWithExpiry(oauthAuth, server.url, undefined, signal);
          signal.throwIfAborted();
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
          signal.throwIfAborted();
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
          // The failed HTTP transport is not stored in the connection maps.
          // Release it before replacing it with the fallback transport.
          if (transport) {
            await transport.close().catch(() => undefined);
            transport = undefined;
          }
          signal.throwIfAborted();
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
          signal.throwIfAborted();
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

      signal.throwIfAborted();
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

      // Duplicate names within a single server cannot be routed even with aliases.
      const seenToolNames = new Set<string>();
      for (const tool of serverTools) {
        if (seenToolNames.has(tool.name)) {
          throw new Error(`MCP server returned duplicate tool name "${tool.name}"`);
        }
        seenToolNames.add(tool.name);
      }

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

      signal.throwIfAborted();
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
      // OAuth, connect, ping, and listTools can fail before these resources are
      // published. They still belong to this connection attempt.
      if (this.clients.get(serverKey) === client) {
        this.clients.delete(serverKey);
        this.transports.delete(serverKey);
        this.tools.delete(serverKey);
      }
      await close();
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.isDebugEnabled) {
        logger.error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
      }
      throw new Error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
    } finally {
      this.pendingConnections.delete(close);
    }
  }

  private async closeConnection(
    client: Client,
    transport?: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport,
  ): Promise<void> {
    // A transport close failure must not skip closing the client.
    for (const resource of [transport, client]) {
      try {
        await resource?.close();
      } catch (error) {
        if (this.isDebugEnabled) {
          logger.error(
            `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  getAllTools(): MCPTool[] {
    return publishMcpToolNames(this.tools).map(({ tool }) => tool);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<MCPToolResult> {
    signal?.throwIfAborted();
    return await withGenAIToolSpan(
      { name, arguments: sanitizeMcpToolData(args), resultFormat: 'mcp' },
      () => this.callToolInternal(name, args, signal),
    );
  }

  private async callToolInternal(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<MCPToolResult> {
    const timeoutOptions = getEffectiveRequestOptions(this.config);
    const requestOptions = signal ? { ...timeoutOptions, signal } : timeoutOptions;
    // Resolve the model-visible name to exactly one physical MCP server/tool.
    const route = publishMcpToolNames(this.tools).find(({ tool }) => tool.name === name);
    if (!route) {
      throw new Error(`Tool ${name} not found in any connected MCP server`);
    }
    const client = this.clients.get(route.serverKey);
    if (!client) {
      throw new Error(`Tool ${name} is known but its MCP server disconnected`);
    }
    signal?.throwIfAborted();
    try {
      const finished = new AbortController();
      const requestSignal = signal ? AbortSignal.any([signal, finished.signal]) : finished.signal;
      let result;
      try {
        result = await waitForPromiseWithAbort(
          oauthRequestSignal.run(requestSignal, () =>
            client.callTool(
              { name: route.physicalName, arguments: args },
              undefined, // use default result schema
              requestOptions,
            ),
          ),
          signal,
        );
      } finally {
        // A timeout can reject the SDK request while a shared token refresh is still pending.
        // Stop that request's eventual send without cancelling other callers' refreshes.
        finished.abort();
      }
      if (!result.isError) {
        signal?.throwIfAborted();
      }

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
      if (isCallerAbortError(error, signal, { requireReasonMatch: true })) {
        throw signal!.reason;
      }
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

  async cleanup(): Promise<void> {
    this.cleanupPromise ??= this.cleanupInternal();
    const cleanup = this.cleanupPromise;
    try {
      await cleanup;
    } finally {
      if (this.cleanupPromise === cleanup) {
        this.cleanupPromise = null;
      }
    }
  }

  private async cleanupInternal(): Promise<void> {
    this.startupController.abort();
    await Promise.all([...this.pendingConnections].map((close) => close()));
    const connections = [...this.clients].map(([serverKey, client]) => ({
      client,
      transport: this.transports.get(serverKey),
    }));
    this.clients.clear();
    this.transports.clear();
    this.tools.clear();
    for (const { client, transport } of connections) {
      await this.closeConnection(client, transport);
    }
  }
}
