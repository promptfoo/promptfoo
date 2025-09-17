const fs = require('fs');

class DatabaseReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadConversations();
  }

  id() {
    return 'database-replay';
  }

  loadConversations() {
    const dataFile = this.config.dataFile;
    const rawData = fs.readFileSync(dataFile, 'utf8');
    const conversationsArray = JSON.parse(rawData);

    // Convert array to session-indexed object for easy lookup
    const conversations = {};

    for (const conv of conversationsArray) {
      const sessionId = conv.session_id;

      conversations[sessionId] = {
        sessionId: conv.session_id,
        userId: conv.user_id,
        createdAt: conv.created_at,
        channel: conv.channel,
        status: conv.status,
        messages: conv.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata || {}
        })),
        metadata: {
          messageCount: conv.messages.length,
          userMessages: conv.messages.filter(m => m.role === 'user').length,
          assistantMessages: conv.messages.filter(m => m.role === 'assistant').length,
          duration: this.calculateDuration(conv.messages),
          avgResponseTime: this.calculateAvgResponseTime(conv.messages),
          channel: conv.channel,
          status: conv.status,
          agents: [...new Set(conv.messages
            .filter(m => m.metadata?.agent_id)
            .map(m => m.metadata.agent_id))],
          escalated: conv.status === 'escalated',
          businessOutcome: this.determineBusinessOutcome(conv)
        }
      };
    }

    return conversations;
  }

  calculateDuration(messages) {
    if (messages.length < 2) return 0;
    const start = new Date(messages[0].timestamp);
    const end = new Date(messages[messages.length - 1].timestamp);
    return Math.round((end - start) / 1000); // seconds
  }

  calculateAvgResponseTime(messages) {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return 0;

    const responseTimes = assistantMessages
      .map(msg => msg.metadata?.response_time_ms)
      .filter(time => time != null);

    if (responseTimes.length === 0) return 0;
    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }

  determineBusinessOutcome(conversation) {
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const metadata = lastMessage?.metadata || {};

    // Determine business outcome based on conversation content and metadata
    if (metadata.upgrade_completed) return 'upsell_success';
    if (metadata.password_reset_sent) return 'issue_resolved';
    if (metadata.cancellation_processed) return 'churn';
    if (conversation.status === 'escalated') return 'escalation';
    if (conversation.status === 'completed') return 'resolution';
    return 'unknown';
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;
    const mode = context?.vars?.mode || 'conversation';
    const includeMetadata = context?.vars?.includeMetadata || false;

    if (!sessionId || !this.conversations[sessionId]) {
      return {
        output: `No database conversation found for session ID: ${sessionId}`,
        error: 'Session not found'
      };
    }

    const conversation = this.conversations[sessionId];

    if (mode === 'conversation') {
      // Return formatted conversation
      const conversationText = conversation.messages
        .map((msg, idx) => {
          const turnNum = Math.floor(idx / 2) + 1;
          const metadata = includeMetadata ? ` (${JSON.stringify(msg.metadata)})` : '';
          return `[Turn ${turnNum}] ${msg.role}: ${msg.content}${metadata}`;
        })
        .join('\n---\n');

      return {
        output: conversationText,
        metadata: conversation.metadata
      };
    }

    else if (mode === 'analysis') {
      // Return conversation analysis
      const analysis = [
        `=== CONVERSATION ANALYSIS ===`,
        `Session ID: ${conversation.sessionId}`,
        `Channel: ${conversation.channel}`,
        `Status: ${conversation.status}`,
        `Duration: ${conversation.metadata.duration} seconds`,
        `Messages: ${conversation.metadata.messageCount} (${conversation.metadata.userMessages} user, ${conversation.metadata.assistantMessages} assistant)`,
        `Average Response Time: ${conversation.metadata.avgResponseTime}ms`,
        `Agents Involved: ${conversation.metadata.agents.join(', ') || 'Unknown'}`,
        `Business Outcome: ${conversation.metadata.businessOutcome}`,
        ``,
        `=== CONVERSATION FLOW ===`,
        conversation.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n')
      ].join('\n');

      return {
        output: analysis,
        metadata: conversation.metadata
      };
    }

    else if (mode === 'metadata') {
      // Return just metadata analysis
      const metadataText = [
        `=== DATABASE METADATA ===`,
        `Session: ${conversation.sessionId}`,
        `User: ${conversation.userId}`,
        `Created: ${conversation.createdAt}`,
        `Channel: ${conversation.channel}`,
        `Status: ${conversation.status}`,
        ``,
        `=== PERFORMANCE METRICS ===`,
        `Total Messages: ${conversation.metadata.messageCount}`,
        `Conversation Duration: ${conversation.metadata.duration} seconds`,
        `Average Response Time: ${conversation.metadata.avgResponseTime}ms`,
        ``,
        `=== BUSINESS METRICS ===`,
        `Outcome: ${conversation.metadata.businessOutcome}`,
        `Escalated: ${conversation.metadata.escalated ? 'Yes' : 'No'}`,
        `Agents: ${conversation.metadata.agents.join(', ') || 'Not tracked'}`,
        ``,
        `=== MESSAGE METADATA ===`,
        conversation.messages.map((msg, idx) =>
          `Message ${idx + 1} (${msg.role}): ${JSON.stringify(msg.metadata, null, 2)}`
        ).join('\n\n')
      ].join('\n');

      return {
        output: metadataText,
        metadata: conversation.metadata
      };
    }

    else if (mode === 'sql') {
      // Return SQL-like representation
      const sqlText = [
        `-- Reconstructed from database export`,
        `-- Session: ${conversation.sessionId}`,
        ``,
        `SELECT`,
        `  session_id,`,
        `  user_id,`,
        `  message_role,`,
        `  message_content,`,
        `  timestamp,`,
        `  metadata`,
        `FROM conversations`,
        `WHERE session_id = '${conversation.sessionId}'`,
        `ORDER BY timestamp;`,
        ``,
        `-- Results:`,
        conversation.messages.map(msg =>
          `-- ${msg.id} | ${msg.session_id || conversation.sessionId} | ${msg.role} | "${msg.content.substring(0, 50)}..." | ${msg.timestamp}`
        ).join('\n')
      ].join('\n');

      return {
        output: sqlText,
        metadata: conversation.metadata
      };
    }

    return {
      output: 'Invalid mode specified. Use: conversation, analysis, metadata, or sql',
      error: 'Invalid mode'
    };
  }
}

module.exports = DatabaseReplayProvider;