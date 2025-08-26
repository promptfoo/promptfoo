const { Client } = require('@modelcontextprotocol/sdk/client/index.js');

class MCPClient {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.transport = null;
    this.tools = [];
    this._isConnected = false;
  }

  get isConnected() {
    return this._isConnected;
  }

  async connect() {
    if (this._isConnected) {
      console.log('Already connected to MCP server');
      return true;
    }

    const clientInfo = {
      name: this.config.clientName || 'mcp-agent-provider',
      version: this.config.clientVersion || '1.0.0',
    };

    const capabilities = this.config.capabilities || {};

    this.client = new Client(clientInfo, { capabilities });

    try {
      // Create appropriate transport based on config
      this.transport = await this.createTransport();

      // Connect the client
      await this.client.connect(this.transport);

      const serverName = this.getServerName();
      console.log(`Connected to MCP server: ${serverName}`);

      // List and store available tools
      const toolsResult = await this.client.listTools();
      this.tools = (toolsResult?.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      }));

      // Apply tool filtering if configured
      if (this.config.allowedTools) {
        this.tools = this.tools.filter((tool) => this.config.allowedTools.includes(tool.name));
      }
      if (this.config.excludedTools) {
        this.tools = this.tools.filter((tool) => !this.config.excludedTools.includes(tool.name));
      }

      if (this.config.debug) {
        console.log(`Available tools: ${this.tools.map((t) => t.name).join(', ')}`);
      }

      this._isConnected = true;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to connect to MCP server: ${errorMessage}`);
      if (this.config.debug) {
        console.error('Full error:', error);
      }
      throw new Error(`Failed to connect to MCP server: ${errorMessage}`);
    }
  }

  async createTransport() {
    // Command + args (stdio transport)
    if (this.config.command) {
      return this.createStdioTransport(this.config.command, this.config.args);
    }

    // Local file path (.js or .py)
    if (this.config.path) {
      return this.createLocalFileTransport(this.config.path);
    }

    // HTTP/SSE URL
    if (this.config.url) {
      return this.createHttpTransport();
    }

    throw new Error('Configuration must specify either command, path, or url for MCP server');
  }

  async createStdioTransport(command, args = []) {
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    return new StdioClientTransport({
      command: command,
      args: args,
      env: process.env,
      stderr: this.config.debug ? 'inherit' : 'pipe',
    });
  }

  async createLocalFileTransport(path) {
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

    const isJs = path.endsWith('.js');
    const isPy = path.endsWith('.py');

    if (!isJs && !isPy) {
      throw new Error('Local server file must be a .js or .py file');
    }

    const command = isPy ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;

    return new StdioClientTransport({
      command: command,
      args: [path],
      env: process.env,
      stderr: this.config.debug ? 'inherit' : 'pipe',
    });
  }

  async createHttpTransport() {
    const headers = {
      ...(this.config.headers || {}),
      ...this.getAuthHeaders(),
    };

    const options = Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined;

    const url = new URL(this.config.url);

    // Try StreamableHTTP first, fall back to SSE if it fails
    try {
      const {
        StreamableHTTPClientTransport,
      } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const transport = new StreamableHTTPClientTransport(url, options);
      if (this.config.debug) {
        console.log('Using StreamableHTTP transport');
      }
      return transport;
    } catch (error) {
      if (this.config.debug) {
        console.log('StreamableHTTP failed, trying SSE transport:', error.message);
      }

      try {
        const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
        const transport = new SSEClientTransport(url, options);
        if (this.config.debug) {
          console.log('Using SSE transport');
        }
        return transport;
      } catch (sseError) {
        throw new Error(`Failed to create HTTP transport: ${sseError.message}`);
      }
    }
  }

  getAuthHeaders() {
    const auth = this.config.auth;
    if (!auth) {
      return {};
    }

    // Bearer token
    if (auth.type === 'bearer' && auth.token) {
      return { Authorization: `Bearer ${auth.token}` };
    }

    // API Key
    if (auth.type === 'api_key' && auth.api_key) {
      return { 'X-API-Key': auth.api_key };
    }

    // Custom header for API key
    if (auth.type === 'api_key' && auth.key && auth.value) {
      return { [auth.key]: auth.value };
    }

    // Basic authentication
    if (auth.type === 'basic' && auth.username && auth.password) {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return { Authorization: `Basic ${credentials}` };
    }

    return {};
  }

  getServerName() {
    return (
      this.config.name || this.config.url || this.config.path || this.config.command || 'default'
    );
  }

  async listTools() {
    if (!this._isConnected) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }
    return this.tools;
  }

  async callTool(toolName, args = {}) {
    if (!this._isConnected) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }

    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(
        `Tool "${toolName}" not found. Available tools: ${this.tools.map((t) => t.name).join(', ')}`,
      );
    }

    try {
      if (this.config.debug) {
        console.log(`Calling tool "${toolName}" with args:`, args);
      }

      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      // Handle different content types
      let content = '';
      if (response?.content) {
        if (typeof response.content === 'string') {
          content = response.content;
        } else if (Buffer.isBuffer(response.content)) {
          content = response.content.toString();
        } else if (Array.isArray(response.content)) {
          // Handle array of content items (MCP spec allows this)
          content = response.content
            .map((item) => {
              if (typeof item === 'object' && item.text) {
                return item.text;
              }
              return typeof item === 'string' ? item : JSON.stringify(item);
            })
            .join('\n');
        } else {
          content = JSON.stringify(response.content, null, 2);
        }
      }

      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.config.debug) {
        console.error(`Error calling tool ${toolName}:`, errorMessage);
      }
      throw error;
    }
  }

  async disconnect() {
    if (!this._isConnected) {
      return;
    }

    try {
      if (this.config.debug) {
        console.log(`Disconnecting from MCP server: ${this.getServerName()}`);
      }

      if (this.transport && typeof this.transport.close === 'function') {
        await this.transport.close();
      }

      if (this.client && typeof this.client.close === 'function') {
        await this.client.close();
      }

      this._isConnected = false;
      this.tools = [];
      this.client = null;
      this.transport = null;
    } catch (error) {
      if (this.config.debug) {
        console.error('Error during disconnect:', error);
      }
    }
  }
}

module.exports = MCPClient;
