const { query } = require('./index.js');

class CustomApiProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = 'sql-provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const result = await query(prompt);

    return {
      output: result,
    };
  }
}

module.exports = CustomApiProvider;
