const OpenAI = require('openai');

class ReactAgent {
  constructor(apiKey, apiBaseUrl, mcpClients = [], model = 'gpt-4o', systemPrompt = null) {
    this.openai = new OpenAI({ apiKey, baseURL: apiBaseUrl });
    this.mcpClients = mcpClients;
    this.maxIterations = 10;
    this.model = model;
    this.systemPrompt =
      systemPrompt ||
      `You are a helpful AI assistant with access to various tools. Use the ReAct pattern:
1. Thought: Think about what you need to do
2. Action: Choose and execute a tool if needed
3. Observation: Observe the result
4. Repeat until you have enough information to provide a final answer
5. Always include all the tools you used in your response.
6. Don't ask for confirmation before using a tool or doing something, just do it.`;
  }

  async getAvailableTools() {
    const tools = [];

    for (let i = 0; i < this.mcpClients.length; i++) {
      const client = this.mcpClients[i];
      try {
        const clientTools = await client.listTools();
        clientTools.forEach((tool) => {
          tools.push({
            type: 'function',
            function: {
              name: `mcp_${i}_${tool.name}`,
              description: tool.description || `Tool from MCP server ${i}`,
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          });
        });
      } catch (error) {
        console.error(`Failed to get tools from MCP client ${i}:`, error);
      }
    }

    return tools;
  }

  async executeTool(toolCall) {
    const { name, arguments: args } = toolCall.function;

    if (name.startsWith('mcp_')) {
      const parts = name.split('_');
      const clientIndex = parseInt(parts[1]);
      const toolName = parts.slice(2).join('_');

      if (clientIndex >= 0 && clientIndex < this.mcpClients.length) {
        try {
          const result = await this.mcpClients[clientIndex].callTool(
            toolName,
            typeof args === 'string' ? JSON.parse(args) : args,
          );
          return JSON.stringify(result);
        } catch (error) {
          return `Error executing tool ${toolName}: ${error.message}`;
        }
      }
    }

    return `Unknown tool: ${name}`;
  }

  async run(prompt, context = {}) {
    const tools = await this.getAvailableTools();

    const messages = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    let iterations = 0;
    let finalResponse = null;
    const toolCalls = [];

    while (iterations < this.maxIterations) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens: 2000,
        });

        const message = completion.choices[0].message;
        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const toolCall of message.tool_calls) {
            toolCalls.push(toolCall);
            const result = await this.executeTool(toolCall);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        } else {
          finalResponse = message.content;
          break;
        }

        iterations++;
      } catch (error) {
        console.error('Error in ReAct loop:', error);
        throw error;
      }
    }

    if (!finalResponse && iterations >= this.maxIterations) {
      finalResponse =
        'I reached the maximum number of iterations while trying to answer your question.';
    }

    return {
      response: finalResponse,
      toolCalls: toolCalls,
      iterations: iterations,
      messages: messages,
    };
  }
}

module.exports = ReactAgent;
