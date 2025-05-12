import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import logger from '../../logger';
import type { MCPConfig, MCPServerConfig, MCPTool, MCPToolResult } from './types';

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private config: MCPConfig;

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
      await this.connectToServer(server);
    }
  }

  private async connectToServer(server: MCPServerConfig): Promise<void> {
    const serverKey = server.name || server.url || server.path || 'default';
    let transport: StdioClientTransport;

    try {
      if (server.command && server.args) {
        // NPM package or other command execution
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
        });
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

        transport = new StdioClientTransport({
          command,
          args: [server.path],
        });
      } else if (server.url) {
        // Remote servers not supported yet - MCP is designed for local tool execution
        throw new Error(
          'Remote MCP servers are not supported. Please use a local server file or npm package.',
        );
      } else {
        throw new Error('Either command+args or path must be specified for MCP server');
      }

      const client = new Client({ name: 'promptfoo-anthropic', version: '1.0.0' });
      client.connect(transport);

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
          return {
            content: result?.content?.toString() || '',
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
    for (const client of this.clients.values()) {
      try {
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
    this.tools.clear();
  }
}
