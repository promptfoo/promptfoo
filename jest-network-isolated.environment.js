const { TestEnvironment } = require('jest-environment-node');

/**
 * Custom Jest environment that completely isolates tests from network access.
 * This environment blocks common network-related modules and provides detailed
 * reporting of any attempted network operations.
 */
class NetworkIsolatedEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.networkAttempts = [];
  }

  async setup() {
    await super.setup();

    // Block common network modules at the environment level
    const blockedModules = ['http', 'https', 'net', 'tls', 'dgram', 'dns', 'url'];

    // Store original modules
    this.originalModules = new Map();

    blockedModules.forEach((moduleName) => {
      try {
        const originalModule = require(moduleName);
        this.originalModules.set(moduleName, originalModule);

        // Create wrapper that logs and blocks network operations
        const moduleWrapper = new Proxy(originalModule, {
          get: (target, prop) => {
            if (typeof target[prop] === 'function') {
              return (...args) => {
                this.networkAttempts.push({
                  module: moduleName,
                  method: prop,
                  args: args.map((arg) => (typeof arg === 'function' ? '[Function]' : arg)),
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });

                console.warn(`🚫 Blocked ${moduleName}.${prop}() call in test environment`);
                throw new Error(`Network operation blocked: ${moduleName}.${prop}()`);
              };
            }
            return target[prop];
          },
        });

        // Override in global context
        this.global[moduleName] = moduleWrapper;
      } catch {
        // Module might not be available, that's okay
      }
    });

    // Block XMLHttpRequest and WebSocket if they exist
    if (this.global.XMLHttpRequest) {
      const OriginalXMLHttpRequest = this.global.XMLHttpRequest;
      this.global.XMLHttpRequest = class extends OriginalXMLHttpRequest {
        constructor() {
          super();
          console.warn('🚫 XMLHttpRequest created in test environment');
        }

        open(method, url, ...args) {
          this.networkAttempts.push({
            type: 'XMLHttpRequest',
            method,
            url,
            timestamp: Date.now(),
          });
          console.warn(`🚫 Blocked XMLHttpRequest: ${method} ${url}`);
          throw new Error(`XMLHttpRequest blocked: ${method} ${url}`);
        }
      };
    }

    if (this.global.WebSocket) {
      const OriginalWebSocket = this.global.WebSocket;
      this.global.WebSocket = class extends OriginalWebSocket {
        constructor(url, protocols) {
          console.warn(`🚫 Blocked WebSocket connection to: ${url}`);
          this.networkAttempts.push({
            type: 'WebSocket',
            url,
            protocols,
            timestamp: Date.now(),
          });
          throw new Error(`WebSocket blocked: ${url}`);
        }
      };
    }
  }

  async teardown() {
    // Report network attempts if any occurred
    if (this.networkAttempts && this.networkAttempts.length > 0) {
      console.log(`\n🔍 Network isolation report:`);
      console.log(`Total blocked attempts: ${this.networkAttempts.length}`);

      const groupedAttempts = this.networkAttempts.reduce((acc, attempt) => {
        const key = attempt.module || attempt.type || 'unknown';
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(attempt);
        return acc;
      }, {});

      Object.entries(groupedAttempts).forEach(([type, attempts]) => {
        console.log(`  ${type}: ${attempts.length} attempts`);
      });
    }

    // Restore original modules
    if (this.originalModules) {
      this.originalModules.forEach((originalModule, moduleName) => {
        this.global[moduleName] = originalModule;
      });
    }

    await super.teardown();
  }
}

module.exports = NetworkIsolatedEnvironment;
