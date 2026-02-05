/**
 * CJS provider with module.exports syntax (10.1.1)
 *
 * Tests that .js files with CommonJS module.exports still work after ESM migration.
 * Bug #6501: CJS fallback was broken in 0.120.0
 */

// Use CommonJS syntax explicitly
const id = 'cjs-module-exports-provider';

class CjsModuleExportsProvider {
  constructor(options) {
    this.providerId = options?.id || id;
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

// CommonJS export - this is the pattern that broke in 0.120.0
module.exports = CjsModuleExportsProvider;
