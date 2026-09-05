import { randomBytes } from 'node:crypto';

export default class TrajectoryStatusProvider {
  id() {
    return 'trajectory-status';
  }

  async callApi(_prompt, context) {
    const [, traceId, parentSpanId] = context.traceparent.split('-');
    const startTime = BigInt(Date.now()) * 1_000_000n;
    const response = await fetch(
      `http://127.0.0.1:${process.env.PROMPTFOO_SMOKE_OTLP_PORT}/v1/traces`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId,
                      parentSpanId,
                      spanId: randomBytes(8).toString('hex'),
                      name: 'tool.call',
                      kind: 1,
                      startTimeUnixNano: startTime.toString(),
                      endTimeUnixNano: (startTime + 1_000_000n).toString(),
                      attributes: [{ key: 'tool.name', value: { stringValue: 'search_orders' } }],
                      status: { code: context.vars.code, message: context.vars.message ?? '' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`OTLP export failed: ${response.status} ${await response.text()}`);
    }
    await response.arrayBuffer();
    return { output: `status ${context.vars.code}` };
  }
}
