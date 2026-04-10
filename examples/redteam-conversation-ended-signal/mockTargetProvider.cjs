class MockThreadClosingProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'mock-thread-closing-provider';
    this.config = options.config || {};
    this.closeAfterUserTurns = Number(this.config.closeAfterUserTurns ?? 1);
  }

  id() {
    return this.providerId;
  }

  parseMessages(prompt) {
    if (typeof prompt !== 'string') {
      return [];
    }

    try {
      const parsed = JSON.parse(prompt);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (parsed && typeof parsed === 'object') {
        // Hybrid payload used by some multi-modal layer strategies.
        if (
          parsed._promptfoo_audio_hybrid === true &&
          Array.isArray(parsed.history) &&
          parsed.currentTurn
        ) {
          return [...parsed.history, parsed.currentTurn];
        }

        if (Array.isArray(parsed.messages)) {
          return parsed.messages;
        }
      }
    } catch {
      // Not JSON chat history, treat as single-turn text input below.
    }

    return [{ role: 'user', content: prompt }];
  }

  async callApi(prompt) {
    const messages = this.parseMessages(prompt);
    const userTurns = messages.filter((message) => message?.role === 'user').length;

    if (userTurns > this.closeAfterUserTurns) {
      // Intentionally omit `output` to verify promptfoo accepts a stop signal alone.
      return {
        conversationEnded: true,
        conversationEndReason: 'thread_closed',
        metadata: {
          reason: 'Mock target closed the active thread',
          userTurns,
        },
      };
    }

    return {
      output: `Mock support reply for turn ${userTurns}.`,
      metadata: {
        threadOpen: true,
        userTurns,
      },
    };
  }
}

module.exports = MockThreadClosingProvider;
