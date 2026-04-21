/**
 * Class-based provider with id() on the prototype.
 *
 * This reproduces the bug in #7353 where spread operator in wrapProviderWithRateLimiting
 * didn't copy prototype methods, causing "provider.id is not a function" errors
 * in redteam strategies that call TokenUsageTracker.trackUsage(provider.id(), ...).
 *
 * The fix explicitly delegates id() to the original provider.
 */

class ClassProviderWithPrototypeId {
  constructor(options) {
    this.providerId = options?.id || 'class-provider-prototype-id';
    this.config = options?.config || {};
  }

  // This method is on the prototype, NOT an own property.
  // The spread operator (...provider) won't copy it.
  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // Return a response that includes the provider ID to verify id() works
    const providerId = this.id();
    return {
      output: `ClassProvider[${providerId}]: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}

module.exports = ClassProviderWithPrototypeId;
