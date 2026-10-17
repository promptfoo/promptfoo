/**
 * Smoke fixture provider that emits OTLP JSON spans with a configurable status code.
 * Drives the trajectory:step-status smoke tests with zero external dependencies.
 */

const OTLP_ENDPOINT =
  process.env.PROMPTFOO_SMOKE_OTLP_ENDPOINT ||
  `http://127.0.0.1:${process.env.PROMPTFOO_SMOKE_OTLP_PORT}/v1/traces`;

const OTEL_STATUS_OK = 1;
const OTEL_STATUS_UNSET = 0;
const OTEL_SPAN_KIND_INTERNAL = 1;

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function nowNanos() {
  return (BigInt(Date.now()) * NANOSECONDS_PER_MILLISECOND).toString();
}

function randomHex(nibbles) {
  return Array.from(
    { length: nibbles },
    () => '0123456789abcdef'[Math.floor(Math.random() * 16)],
  ).join('');
}

function parseTraceparent(traceparent) {
  if (!traceparent) {
    return null;
  }
  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }
  return {
    traceId: parts[1],
    spanId: parts[2],
  };
}

function toOtlpAttribute(key, value) {
  if (typeof value === 'string') {
    return { key, value: { stringValue: value } };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { key, value: { intValue: String(value) } };
  }
  if (typeof value === 'boolean') {
    return { key, value: { boolValue: value } };
  }
  if (value === null || value === undefined) {
    return null;
  }
  return { key, value: { stringValue: JSON.stringify(value) } };
}

export default class TrajectoryStatusProvider {
  #providerId;
  config;

  constructor(options) {
    this.#providerId = options?.id || 'trajectory-status';
    this.config = options?.config || {};
  }

  id() {
    return this.#providerId;
  }

  async callApi(prompt, context) {
    const vars = context?.vars ?? {};
    const code = Number(vars.code ?? OTEL_STATUS_OK);
    const message = vars.message ? String(vars.message) : undefined;

    const parent = parseTraceparent(context?.traceparent);
    const traceId = parent?.traceId ?? randomHex(32);
    const spanId = randomHex(16);
    const startNanos = nowNanos();
    const endNanos = startNanos;

    const attributes = [
      toOtlpAttribute('tool.name', 'search_orders'),
      toOtlpAttribute('tool.arguments', JSON.stringify({ query: 'smoke test' })),
      toOtlpAttribute('prompt.text', prompt),
      toOtlpAttribute('smoke.test_code', code),
      context?.evaluationId ? toOtlpAttribute('evaluation.id', context.evaluationId) : null,
      context?.testCaseId ? toOtlpAttribute('test.case.id', context.testCaseId) : null,
    ].filter(Boolean);

    const span = {
      traceId,
      spanId,
      ...(parent?.spanId ? { parentSpanId: parent.spanId } : {}),
      name: 'search_orders',
      kind: OTEL_SPAN_KIND_INTERNAL,
      startTimeUnixNano: startNanos,
      endTimeUnixNano: endNanos,
      attributes,
      ...(code === OTEL_STATUS_UNSET
        ? {}
        : {
            status: {
              code,
              ...(message ? { message } : {}),
            },
          }),
    };

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              toOtlpAttribute('service.name', 'trajectory-status-fixture'),
              toOtlpAttribute('service.version', '1.0.0'),
            ].filter(Boolean),
          },
          scopeSpans: [
            {
              scope: { name: 'trajectory-status-fixture', version: '1.0.0' },
              spans: [span],
            },
          ],
        },
      ],
    };

    try {
      await fetch(OTLP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (_error) {
      // Best-effort OTLP emit; swallow so the fixture stays deterministic.
    }

    const succeeded = code === OTEL_STATUS_OK;
    return {
      output: succeeded
        ? `search_orders succeeded (status code ${code})`
        : `search_orders ${code === OTEL_STATUS_UNSET ? 'unset' : 'failed'} (status code ${code}${message ? `: ${message}` : ''})`,
      tokenUsage: { total: prompt.length, prompt: prompt.length, completion: 0 },
    };
  }
}
