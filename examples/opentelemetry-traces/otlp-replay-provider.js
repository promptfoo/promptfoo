const fs = require('fs');

class OTLPReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadFromOTLP();
  }

  id() {
    return 'otlp-replay';
  }

  loadFromOTLP() {
    const traceFile = this.config.traceFile;
    const rawData = fs.readFileSync(traceFile, 'utf8');
    const otlpData = JSON.parse(rawData);

    const conversations = {};

    // Parse OTLP traces into conversation format
    for (const resourceSpan of otlpData.resourceSpans) {
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          // Extract attributes into a more usable format
          const attrs = {};
          for (const attr of span.attributes) {
            const value = attr.value.stringValue || attr.value.intValue || attr.value.boolValue;
            attrs[attr.key] = value;
          }

          const sessionId = attrs['conversation.session_id'];
          if (!sessionId) continue;

          if (!conversations[sessionId]) {
            conversations[sessionId] = [];
          }

          conversations[sessionId].push({
            role: attrs['conversation.role'],
            content: attrs['conversation.content'],
            turnNumber: parseInt(attrs['conversation.turn_number']) || 0,
            timestamp: new Date(parseInt(span.startTimeUnixNano) / 1000000).toISOString(),
            traceId: span.traceId,
            spanId: span.spanId,
            metadata: {
              llmModel: attrs['llm.model'],
              latencyMs: attrs['llm.response.latency_ms'],
              userId: attrs['user.id'],
              agentId: attrs['agent.id'],
              intent: attrs['conversation.intent'],
              channel: attrs['conversation.channel'],
              resolution: attrs['resolution.action'],
              qualifiedLead: attrs['sales.qualified_lead']
            }
          });
        }
      }
    }

    // Sort conversations by turn number
    for (const sessionId in conversations) {
      conversations[sessionId].sort((a, b) => a.turnNumber - b.turnNumber);
    }

    return conversations;
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;
    const mode = context?.vars?.mode || 'full';
    const turnIndex = context?.vars?.turnIndex || 0;

    if (!sessionId || !this.conversations[sessionId]) {
      return {
        output: `No conversation found for session ID: ${sessionId}`,
        error: 'Conversation not found'
      };
    }

    const conversation = this.conversations[sessionId];

    // Return specific turn
    if (mode === 'turn') {
      const turn = conversation[turnIndex];
      return {
        output: turn ? turn.content : 'Turn not found',
        metadata: {
          role: turn?.role,
          timestamp: turn?.timestamp,
          turnIndex,
          totalTurns: conversation.length,
          traceId: turn?.traceId,
          spanId: turn?.spanId,
          originalMetadata: turn?.metadata
        }
      };
    }

    // Return full conversation
    const conversationText = conversation
      .map((turn, idx) => {
        const metadata = turn.metadata.llmModel ? ` (${turn.metadata.llmModel}, ${turn.metadata.latencyMs}ms)` : '';
        return `[Turn ${idx + 1}] ${turn.role}: ${turn.content}${metadata}`;
      })
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        sessionId,
        totalTurns: conversation.length,
        traceId: conversation[0]?.traceId,
        firstMessage: conversation[0]?.timestamp,
        lastMessage: conversation[conversation.length - 1]?.timestamp,
        conversationMetadata: {
          models: [...new Set(conversation.map(t => t.metadata.llmModel).filter(Boolean))],
          avgLatency: conversation
            .filter(t => t.metadata.latencyMs)
            .reduce((sum, t, _, arr) => sum + parseInt(t.metadata.latencyMs) / arr.length, 0),
          userIds: [...new Set(conversation.map(t => t.metadata.userId).filter(Boolean))],
          intents: [...new Set(conversation.map(t => t.metadata.intent).filter(Boolean))]
        }
      }
    };
  }
}

module.exports = OTLPReplayProvider;