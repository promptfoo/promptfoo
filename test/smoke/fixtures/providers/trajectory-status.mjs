import { randomBytes } from 'node:crypto';

/**
 * Smoke-test provider that emits a single OTLP tool span to the promptfoo
 * OTLP HTTP receiver, with status derived from the per-test `code` var.
 *
 * vars.code mapping to OTel span status.code:
 *   1 (or "success")  → 1 (OK)
 *   2 (or "error")    → 2 (ERROR), message from vars.message when provided
 *   0 / "unset" / any → 0 (UNSET — explicit unset so numeric status=0 assertions match)
 */
export default class TrajectoryStatusProvider {
  constructor(options) {
    this.providerId = options?.id || 'trajectory-status';
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    const port = process.env.PROMPTFOO_SMOKE_OTLP_PORT;
    const vars = context?.vars ?? {};
    const code = vars.code;
    const message = vars.message;

    // Build OTLP span status from vars.code. Always emit a status so that
    // numeric assertions against code 0 (UNSET) also match.
    let statusCode = 0; // UNSET default
    let statusMessage;
    if (code === 1 || code === 'success') {
      statusCode = 1;
    } else if (code === 2 || code === 'error') {
      statusCode = 2;
      if (message) {
        statusMessage = String(message);
      }
    }

    const spanStatus = statusMessage
      ? { code: statusCode, message: statusMessage }
      : { code: statusCode };

    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const nowNs = String(Date.now() * 1_000_000);

    const otlpRequest = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'trajectory-status-smoke' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'trajectory-status-provider' },
              spans: [
                {
                  traceId,
                  spanId,
                  name: 'search_orders',
                  kind: 1, // INTERNAL
                  startTimeUnixNano: nowNs,
                  endTimeUnixNano: nowNs,
                  attributes: [
                    { key: 'gen_ai.tool.name', value: { stringValue: 'search_orders' } },
                    {
                      key: 'tool.arguments',
                      value: { stringValue: JSON.stringify({ query: 'test query' }) },
                    },
                  ],
                  ...(spanStatus ? { status: spanStatus } : {}),
                },
              ],
            },
          ],
        },
      ],
    };

    if (port) {
      try {
        await fetch(`http://127.0.0.1:${port}/v1/traces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otlpRequest),
        });
      } catch (error) {
        // Don't let OTLP delivery failures fail the provider call — the
        // eval harness reports its own errors separately.
        console.error('[trajectory-status-smoke] OTLP POST failed:', error?.message ?? error);
      }
    }

    const statusLabel =
      code === 1 ? 'success' : code === 2 ? 'error' : code === 0 ? 'unset' : 'unset';

    return {
      output: `Deterministic tool result (code=${String(code)}, status=${statusLabel})`,
      tokenUsage: { total: 1, prompt: 0, completion: 1 },
    };
  }
}
