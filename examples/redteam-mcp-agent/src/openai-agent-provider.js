const MCPClient = require('./mcp-client');
const ReactAgent = require('./react-agent');
require('dotenv').config({ quiet: true });

class OpenAIAgentProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'openai-react-agent';
    this.apiKey = options.config?.apiKey || process.env.OPENAI_API_KEY;
    this.apiBaseUrl = options.config?.apiBaseUrl || 'https://api.openai.com/v1';
    this.mcpServers = options.config?.mcpServers || [];
    this.model = options.config?.model || 'gpt-4o';
    this.systemPrompt =
      options.config?.systemPrompt ||
      `You are a helpful AI assistant with access to various tools. Use the ReAct pattern:
1. Thought: Think about what you need to do
2. Action: Choose and execute a tool if needed
3. Observation: Observe the result
4. Repeat until you have enough information to provide a final answer
5. Always include all the tools you used in your response.
6. Don't ask for confirmation before using a tool or doing something, just do it.`;
    this.mcpClients = [];
    this.agent = null;
    this.initializationState = 'not_initialized'; // 'not_initialized', 'initializing', 'initialized', 'failed'
    this.initializationPromise = null;
  }

  id() {
    return this.providerId;
  }

  async initialize() {
    // If already initialized, return immediately
    if (this.initializationState === 'initialized') {
      return;
    }

    // If currently initializing, wait for the existing initialization to complete
    if (this.initializationState === 'initializing' && this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationState = 'initializing';

    // Store the initialization promise to prevent concurrent attempts
    this.initializationPromise = this._doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      // Clear the promise reference after completion (success or failure)
      this.initializationPromise = null;
    }
  }

  async _doInitialize() {
    try {
      if (!this.apiKey) {
        throw new Error(
          'OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide it in config.',
        );
      }

      // Clear any existing clients before initializing (without changing state)
      await this._cleanupClients();

      const connectedClients = [];
      const failedServers = [];

      for (const server of this.mcpServers) {
        const client = new MCPClient(server);
        try {
          await client.connect();
          connectedClients.push(client);
        } catch (error) {
          console.error(
            `Failed to connect to MCP server ${server.command || server.path || server.url}:`,
            error,
          );
          failedServers.push(server);
        }
      }

      // Only proceed if at least one server connected successfully
      if (connectedClients.length === 0 && this.mcpServers.length > 0) {
        this.initializationState = 'failed';
        throw new Error('Failed to connect to any MCP servers');
      }

      // Store successfully connected clients
      this.mcpClients = connectedClients;

      // Create the agent with connected clients
      this.agent = new ReactAgent(
        this.apiKey,
        this.apiBaseUrl,
        this.mcpClients,
        this.model,
        this.systemPrompt,
      );

      // Mark as initialized
      this.initializationState = 'initialized';

      // Log warning if some servers failed
      if (failedServers.length > 0) {
        console.warn(`Warning: ${failedServers.length} MCP server(s) failed to connect`);
      }
    } catch (error) {
      // Clean up any partial connections on failure
      await this._cleanupClients();
      this.initializationState = 'failed';
      throw error;
    }
  }

  async callApi(prompt, context, options) {
    try {
      await this.initialize();

      const enhancedPrompt =
        typeof prompt === 'string' ? prompt : prompt.raw || prompt.label || JSON.stringify(prompt);

      const vars = context.vars || {};
      const fullPrompt = Object.keys(vars).reduce((p, key) => {
        return p.replace(new RegExp(`{{${key}}}`, 'g'), vars[key]);
      }, enhancedPrompt);

      const startTime = Date.now();
      const result = await this.agent.run(fullPrompt, context);
      const endTime = Date.now();

      const tokenUsage = {
        total: result.messages.length * 100,
        prompt: Math.floor(result.messages.length * 60),
        completion: Math.floor(result.messages.length * 40),
      };

      return {
        output:
          result.response +
          '\n\n Called Tools: ' +
          result.toolCalls
            .map(
              (tool) =>
                `Tool called ${tool.function.name} with args \n${JSON.stringify(
                  tool.function.arguments,
                  null,
                  2,
                )}`,
            )
            .join('\n\n'),
        tokenUsage: tokenUsage,
        cost: tokenUsage.total * 0.00002,
        cached: false,
        metadata: {
          iterations: result.iterations,
          toolCalls: result.toolCalls,
          executionTime: endTime - startTime,
          mcpServersConnected: this.mcpClients.length,
        },
      };
    } catch (error) {
      return {
        error: `Error calling OpenAI agent: ${error.message}`,
        output: null,
      };
    }
  }

  async _cleanupClients() {
    // Internal cleanup that doesn't change initialization state
    for (const client of this.mcpClients) {
      try {
        console.log('Disconnecting MCP client');
        await client.disconnect();
      } catch (error) {
        console.error('Error disconnecting MCP client:', error);
      }
    }
    this.mcpClients = [];
    this.agent = null;
  }

  async cleanup() {
    await this._cleanupClients();
    this.initializationState = 'not_initialized';
    this.initializationPromise = null;
  }
}

module.exports = OpenAIAgentProvider;
