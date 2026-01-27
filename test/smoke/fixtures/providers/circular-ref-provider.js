/**
 * Provider that returns data with circular references.
 * This simulates the bug in #7266 where Timeout objects with circular
 * _idlePrev/_idleNext references leaked into eval results.
 *
 * On main (without the fix), this causes:
 * "TypeError: Converting circular structure to JSON"
 *
 * With the fix, sanitizeForDb strips the circular references.
 */

const id = 'circular-ref-provider';

class CircularRefProvider {
  constructor(options) {
    this.providerId = options?.id || id;
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // Create a circular reference structure similar to Node.js Timeout internals
    const circularData = {
      name: 'TimersList',
      _idleNext: null,
      _idlePrev: null,
    };
    // Create the circular reference
    circularData._idleNext = circularData;
    circularData._idlePrev = circularData;

    return {
      output: `Processed: ${prompt}`,
      // Include the circular reference in metadata (simulating leaked Timeout)
      metadata: {
        normalData: 'this is fine',
        // This circular structure will cause JSON.stringify to fail
        // without proper sanitization
        leakedTimer: circularData,
      },
    };
  }
}

// CommonJS export
module.exports = CircularRefProvider;
