// Replays the judge replies stored in tests.yaml, so the example runs offline
// and returns the same numbers every time. `recorded_v1` and `recorded_v5`
// hold what Claude Haiku 5.5 answered to each prompt; the prompt label picks one.
class RecordedJudge {
  constructor(options) {
    this.providerId = options.id || 'recorded-judge';
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    const version = context.prompt.label.match(/judge-(v\d+)/)?.[1];
    const reply = context.vars[`recorded_${version}`];
    if (typeof reply !== 'string') {
      return { error: `No recorded reply for prompt ${context.prompt.label}` };
    }
    return { output: reply };
  }
}

module.exports = RecordedJudge;
