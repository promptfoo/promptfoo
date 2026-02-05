/**
 * Local provider in subdir for path resolution test (10.2.1)
 *
 * This provider is in a subdirectory and referenced with a relative path
 * from a config file in the same directory.
 *
 * Bug #6503: Provider paths were resolved from CWD instead of config directory
 */

class LocalSubdirProvider {
  constructor(options) {
    this.providerId = options?.id || 'local-subdir-provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    return {
      output: `Subdir Provider: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}

module.exports = LocalSubdirProvider;
