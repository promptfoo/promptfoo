const fs = require('fs');

class LangChainReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadConversations();
  }

  id() {
    return 'langchain-replay';
  }

  loadConversations() {
    const logFile = this.config.logFile;
    const rawData = fs.readFileSync(logFile, 'utf8');
    const lines = rawData.split('\n').filter(line => line.trim());

    const sessions = {};

    for (const line of lines) {
      const entry = JSON.parse(line);
      const sessionId = entry.metadata?.session_id;

      if (!sessionId) continue;

      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          messages: [],
          chains: [],
          tools: [],
          metadata: {
            sessionId,
            models: new Set(),
            totalTokens: 0,
            avgLatency: 0,
            toolCalls: 0
          }
        };
      }

      const session = sessions[sessionId];

      // Process different LangChain event types
      if (entry.type === 'chain_start') {
        session.chains.push({
          type: 'start',
          timestamp: entry.timestamp,
          input: entry.data.inputs.input,
          chainName: entry.metadata.chain_name
        });

        // Add user message
        session.messages.push({
          role: 'user',
          content: entry.data.inputs.input,
          timestamp: entry.timestamp,
          metadata: entry.metadata
        });
      }

      else if (entry.type === 'chain_end') {
        session.chains.push({
          type: 'end',
          timestamp: entry.timestamp,
          output: entry.data.outputs.output
        });

        // Add assistant message
        session.messages.push({
          role: 'assistant',
          content: entry.data.outputs.output,
          timestamp: entry.timestamp,
          metadata: entry.metadata
        });

        // Aggregate metadata
        if (entry.metadata.total_tokens) {
          session.metadata.totalTokens += entry.metadata.total_tokens;
        }
      }

      else if (entry.type === 'llm_start') {
        if (entry.metadata.model) {
          session.metadata.models.add(entry.metadata.model);
        }
      }

      else if (entry.type === 'llm_end') {
        if (entry.metadata.latency_ms) {
          const currentAvg = session.metadata.avgLatency;
          const count = session.messages.filter(m => m.role === 'assistant').length;
          session.metadata.avgLatency = (currentAvg * (count - 1) + entry.metadata.latency_ms) / count;
        }
      }

      else if (entry.type === 'tool_start' || entry.type === 'tool_end') {
        session.tools.push({
          type: entry.type,
          timestamp: entry.timestamp,
          tool: entry.data.tool || 'unknown',
          data: entry.data
        });

        if (entry.type === 'tool_start') {
          session.metadata.toolCalls++;
        }
      }
    }

    // Convert models Set to Array for JSON serialization
    for (const sessionId in sessions) {
      sessions[sessionId].metadata.models = Array.from(sessions[sessionId].metadata.models);
    }

    return sessions;
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;
    const mode = context?.vars?.mode || 'conversation';
    const includeTools = context?.vars?.includeTools || false;

    if (!sessionId || !this.conversations[sessionId]) {
      return {
        output: `No LangChain session found for ID: ${sessionId}`,
        error: 'Session not found'
      };
    }

    const session = this.conversations[sessionId];

    if (mode === 'conversation') {
      // Return conversation messages only
      const conversationText = session.messages
        .map((msg, idx) => `[Turn ${Math.floor(idx / 2) + 1}] ${msg.role}: ${msg.content}`)
        .join('\n---\n');

      return {
        output: conversationText,
        metadata: {
          sessionId,
          messageCount: session.messages.length,
          chainCount: session.chains.length,
          toolCallCount: session.metadata.toolCalls,
          models: session.metadata.models,
          avgLatency: Math.round(session.metadata.avgLatency),
          totalTokens: session.metadata.totalTokens
        }
      };
    }

    else if (mode === 'chains') {
      // Return chain execution details
      const chainText = session.chains
        .map((chain, idx) => {
          if (chain.type === 'start') {
            return `[Chain ${idx / 2 + 1} Start] Input: ${chain.input}`;
          } else {
            return `[Chain ${Math.floor(idx / 2) + 1} End] Output: ${chain.output}`;
          }
        })
        .join('\n---\n');

      return {
        output: chainText,
        metadata: {
          sessionId,
          chainExecutions: session.chains.length / 2,
          toolsUsed: session.tools.filter(t => t.type === 'tool_start').map(t => t.tool)
        }
      };
    }

    else if (mode === 'tools') {
      // Return tool usage details
      if (session.tools.length === 0) {
        return {
          output: 'No tools were used in this conversation',
          metadata: { sessionId, toolCallCount: 0 }
        };
      }

      const toolText = session.tools
        .map(tool => `[${tool.type}] ${tool.tool}: ${JSON.stringify(tool.data, null, 2)}`)
        .join('\n---\n');

      return {
        output: toolText,
        metadata: {
          sessionId,
          toolCallCount: session.metadata.toolCalls,
          uniqueTools: [...new Set(session.tools.map(t => t.tool))]
        }
      };
    }

    else if (mode === 'full') {
      // Return comprehensive session analysis
      const fullAnalysis = [
        '=== CONVERSATION ===',
        session.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n'),
        '',
        '=== CHAIN EXECUTION ===',
        `Total chains executed: ${session.chains.length / 2}`,
        `Models used: ${session.metadata.models.join(', ')}`,
        `Average latency: ${Math.round(session.metadata.avgLatency)}ms`,
        `Total tokens: ${session.metadata.totalTokens}`,
        '',
        '=== TOOL USAGE ===',
        session.tools.length > 0
          ? `Tools called: ${session.tools.filter(t => t.type === 'tool_start').map(t => t.tool).join(', ')}`
          : 'No tools used'
      ].join('\n');

      return {
        output: fullAnalysis,
        metadata: session.metadata
      };
    }

    return {
      output: 'Invalid mode specified',
      error: 'Invalid mode'
    };
  }
}

module.exports = LangChainReplayProvider;