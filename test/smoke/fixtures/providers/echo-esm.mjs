/**
 * ESM provider class using export default (3.2.4)
 */
export default class EchoEsmProvider {
  #providerId;
  config;

  constructor(options) {
    this.#providerId = options?.id || 'echo-esm';
    this.config = options?.config || {};
  }

  id() {
    return this.#providerId;
  }

  async callApi(prompt) {
    return {
      output: `ESM Echo: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}
