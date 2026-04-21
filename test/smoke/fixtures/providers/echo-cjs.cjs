/**
 * CJS provider class using module.exports (3.2.1)
 */
class EchoCjsProvider {
  constructor(options) {
    this.providerId = options?.id || 'echo-cjs';
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    return {
      output: `CJS Echo: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}

module.exports = EchoCjsProvider;
