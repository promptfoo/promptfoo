// Fixed teaching fixtures, not a model or a deployable decision policy.
const recordedDecisions = {
  'meeting-missing': 'clarify',
  'meeting-complete': 'answer',
  'translation-missing': 'answer', // Deliberate missed clarification.
  'translation-complete': 'answer',
  'conversion-missing': 'clarify',
  'conversion-complete': 'clarify', // Deliberate unnecessary clarification.
  'summary-missing': 'clarify',
  'summary-complete': 'answer',
  'folder-missing': 'clarify',
  'folder-complete': 'answer',
};

module.exports = class FixtureProvider {
  constructor(options) {
    this.policy = options.config.policy;
    if (!['always-answer', 'always-clarify', 'recorded'].includes(this.policy)) {
      throw new Error(`Unknown fixture policy: ${this.policy}`);
    }
  }

  id() {
    return `fixture:${this.policy}`;
  }

  async callApi(prompt) {
    const { id } = JSON.parse(prompt);
    if (this.policy === 'recorded' && !Object.hasOwn(recordedDecisions, id)) {
      throw new Error(`No recorded decision for case: ${id}`);
    }
    const decision =
      this.policy === 'recorded'
        ? recordedDecisions[id]
        : this.policy === 'always-answer'
          ? 'answer'
          : 'clarify';
    if (!decision) {
      throw new Error(`No recorded decision for case: ${id}`);
    }
    return { output: JSON.stringify({ decision }) };
  }
};
