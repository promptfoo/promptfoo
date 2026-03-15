/**
 * Smoke-test provider that returns deterministic cost data and optional latency.
 */
export default class MetricsProvider {
  #providerId;

  constructor(options) {
    this.#providerId = options?.id || 'metrics-provider';
  }

  id() {
    return this.#providerId;
  }

  async callApi(prompt, context) {
    const delayMs = Number(context?.vars?.delayMs ?? 0);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return {
      output: `Metrics Echo: ${prompt}`,
      cost: context?.vars?.cost == null ? undefined : Number(context.vars.cost),
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}
