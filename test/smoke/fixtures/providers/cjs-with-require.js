/**
 * CJS provider that uses require() internally (10.1.2)
 *
 * Tests that require() calls work in custom provider code after ESM migration.
 * Bug #6468: require() resolution was broken in 0.120.0
 */

// Use require() to load a built-in module
const path = require('path');
const os = require('os');

class CjsWithRequireProvider {
  constructor(options) {
    this.providerId = options?.id || 'cjs-with-require';
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // Use the required modules to prove they loaded correctly
    const platform = os.platform();
    const separator = path.sep;

    return {
      output: `Require Test: platform=${platform}, sep=${separator}, prompt=${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}

module.exports = CjsWithRequireProvider;
