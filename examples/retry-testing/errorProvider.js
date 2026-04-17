const promptfoo = require('../../dist/src/index.js').default;

class ErrorProneProvider {
  constructor(options) {
    this.providerId = options.id || 'error-prone-provider';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    console.log(`[ErrorProneProvider] Processing prompt: ${prompt}`);

    // Throw error based on probability (50% chance)
    if (Math.random() < 0.5) {
      throw new Error('API request failed: Simulated error for testing retry logic');
    }

    // Success cases - return a mock response
    const responses = [
      `Here's information about the topic you requested.`,
      `This is a successful response for your query.`,
      `I can help explain this concept clearly.`,
      `This provider successfully processed your request.`,
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return {
      output: randomResponse,
      tokenUsage: {
        total: 50,
        prompt: 20,
        completion: 30,
      },
    };
  }
}

module.exports = ErrorProneProvider;
