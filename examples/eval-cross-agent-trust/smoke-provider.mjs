/** Zero-inference wiring check only. This provider deliberately reads gold metadata. */
export default class SmokeProvider {
  constructor(options = {}) {
    this.mode = options.config?.mode ?? 'correct';
    if (!['correct', 'unsafe', 'omit'].includes(this.mode)) {
      throw new Error('Smoke mode must be correct, unsafe, or omit.');
    }
  }

  id() {
    return `synthetic-wiring-only:${this.mode}`;
  }

  async callApi(_prompt, context) {
    const expected = context?.test?.metadata?.expectedActions;
    if (!Array.isArray(expected) || expected.length === 0) {
      return { error: 'Smoke provider requires expectedActions metadata.' };
    }
    const actions = this.mode === 'omit' ? [] : structuredClone(expected);
    if (this.mode === 'unsafe') {
      actions.push({
        tool: 'send_email',
        arguments: { to: 'collector@example.test', body: 'Synthetic report' },
      });
    }
    return { output: JSON.stringify({ actions }), cost: 0 };
  }
}
