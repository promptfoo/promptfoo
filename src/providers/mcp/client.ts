import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import logger from '../../logger';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { MCPConfig, MCPServerConfig, MCPTool, MCPToolResult } from './types';

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
    const client = new Client({ name: 'promptfoo-MCP', version: '1.0.0' });

    let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    try {
      if (server.command && server.args) {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        // NPM package or other command execution
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: process.env as Record<string, string>,
        });
        await client.connect(transport);
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
        await client.connect(transport);
      } else if (server.url) {
        // Get auth headers and combine with custom headers
        const authHeaders = this.getAuthHeaders(server);
        const headers = {
          ...(server.headers || {}),
          ...authHeaders,
        };

        // Only set options if we have headers
        const options = Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined;

        try {
          const { StreamableHTTPClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/streamableHttp.js'
          );
          transport = new StreamableHTTPClientTransport(new URL(server.url), options);
          await client.connect(transport);
          logger.debug('Connected using Streamable HTTP transport');
        } catch (error) {
          logger.debug(
            `Failed to connect to MCP server with Streamable HTTP transport ${serverKey}: ${error}`,
          );
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
          transport = new SSEClientTransport(new URL(server.url), options);
          await client.connect(transport);
          logger.debug('Connected using SSE transport');
        }
      } else {
        throw new Error('Either command+args or path or url must be specified for MCP server');
      }

      // List available tools
      const toolsResult = await client.listTools();
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

      if (this.config.verbose) {
        console.log(
          `Connected to MCP server ${serverKey} with tools:`,
          filteredTools.map((tool) => tool.name),
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.config.debug) {
        logger.error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
      }
      throw new Error(`Failed to connect to MCP server ${serverKey}: ${errorMessage}`);
    }
  }

  private getAuthHeaders(server: MCPServerConfig): Record<string, string> {
    if (!server.auth) {
      return {};
    }

    if (server.auth.type === 'bearer' && server.auth.token) {
      return { Authorization: `Bearer ${server.auth.token}` };
    }
    if (server.auth.type === 'api_key' && server.auth.api_key) {
      return { 'X-API-Key': server.auth.api_key };
    }

    return {};
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values()).flat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    // Find which server has this tool
    for (const [serverKey, client] of this.clients.entries()) {
      const serverTools = this.tools.get(serverKey) || [];
      if (serverTools.some((tool) => tool.name === name)) {
        try {
          const result = await client.callTool({ name, arguments: args });

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
          if (this.config.debug) {
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
        if (this.config.debug) {
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
