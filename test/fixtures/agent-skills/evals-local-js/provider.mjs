export default class EvalsLocalJsProvider {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return 'evals-local-js-provider';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const topic = vars.topic || this.config.defaultTopic || 'unknown';
    const traceId = vars.trace_id || this.config.defaultTraceId || 'missing';
    return {
      output: `PONG topic=${topic} trace id ${traceId} prompt="${prompt}"`,
    };
  }
}
