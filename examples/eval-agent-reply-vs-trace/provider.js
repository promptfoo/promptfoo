// Stub support agent: a fixed reply and fixed tool spans per scenario. No model call.
const crypto = require('node:crypto');

const DONE = 'Your refund has been issued.';
const DECLINED = 'I cannot issue a refund for this order.';
const SCENARIOS = {
  'says-done-did-it': { output: DONE, tools: ['lookup_order', 'issue_refund'] },
  'declines-did-nothing': { output: DECLINED, tools: ['lookup_order'] },
  'says-done-did-nothing': { output: DONE, tools: ['lookup_order'] },
  'declines-did-it-anyway': { output: DECLINED, tools: ['lookup_order', 'issue_refund'] },
};

module.exports = class StubSupportAgent {
  id() {
    return 'stub-support-agent';
  }

  async callApi(prompt, context) {
    const { output, tools } = SCENARIOS[prompt.trim()];
    // Report each tool call as a child span of the trace promptfoo started for this test.
    const [, traceId, parentSpanId] = context.traceparent.split('-');
    const startNs = BigInt(Date.now()) * 1000000n;
    const spans = tools.map((name, index) => ({
      traceId,
      parentSpanId,
      spanId: crypto.randomBytes(8).toString('hex'),
      name: `tool ${name}`,
      startTimeUnixNano: String(startNs + BigInt(index) * 1000000n),
      endTimeUnixNano: String(startNs + BigInt(index + 1) * 1000000n),
      attributes: [
        { key: 'tool.name', value: { stringValue: name } },
        { key: 'tool.arguments', value: { stringValue: '{"order_id":"123"}' } },
      ],
    }));
    // promptfoo's OTLP receiver, started by the `tracing` block in promptfooconfig.yaml.
    const response = await fetch('http://127.0.0.1:4318/v1/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans }] }] }),
    });
    if (!response.ok) {
      throw new Error(`OTLP receiver returned ${response.status}`);
    }
    return { output };
  }
};
