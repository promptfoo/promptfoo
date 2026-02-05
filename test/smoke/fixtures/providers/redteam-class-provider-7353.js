/**
 * Class-based provider for redteam smoke test (#7353).
 *
 * This provider is used as the redteam/attacker provider to verify that
 * class-based providers with prototype id() method work correctly when
 * wrapped with rate limiting.
 *
 * The bug was: wrapProviderWithRateLimiting used spread operator which
 * doesn't copy prototype methods like id(), causing:
 * "TypeError: redteamProvider.id is not a function"
 *
 * This provider returns simple attack prompts to allow the redteam flow
 * to complete without requiring actual LLM API access.
 */

class RedteamClassProvider {
  constructor(options) {
    this.providerId = options?.id || 'redteam-class-provider-7353';
    this.config = options?.config || {};
  }

  // This method is on the prototype, NOT an own property.
  // The spread operator (...provider) won't copy it.
  // The fix in #7353 explicitly delegates id() to the original provider.
  id() {
    return this.providerId;
  }

  async callApi(_prompt) {
    // Return a simple response that can be used as an attack prompt.
    // The actual content doesn't matter for this smoke test - we just
    // need to verify that provider.id() is accessible.
    return {
      output: 'This is a test attack prompt for security testing purposes.',
      tokenUsage: {
        total: 50,
        prompt: 30,
        completion: 20,
      },
    };
  }
}

module.exports = RedteamClassProvider;
