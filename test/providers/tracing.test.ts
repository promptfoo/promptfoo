import { TraceFlags, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  getConfiguredTracingEndpoint,
  getTracingEndpoint,
  getTracingServiceName,
  hasActiveTracingSpan,
} from '../../src/providers/tracing';

describe('provider tracing integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not enable SDK telemetry without an active span', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

    expect(hasActiveTracingSpan()).toBe(false);
  });

  it('ignores invalid active spans when deciding whether to enable SDK telemetry', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(
      trace.wrapSpanContext({
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
        traceFlags: TraceFlags.NONE,
      }),
    );

    expect(hasActiveTracingSpan()).toBe(false);
  });

  it('recognizes usable parent spans for native SDK telemetry', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(
      trace.wrapSpanContext({
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        traceFlags: TraceFlags.SAMPLED,
      }),
    );

    expect(hasActiveTracingSpan()).toBe(true);
  });

  it('distinguishes an explicitly configured receiver from the default collector', () => {
    expect(getConfiguredTracingEndpoint()).toBeUndefined();
    expect(getTracingEndpoint()).toBe('http://127.0.0.1:4318');
  });

  it('uses the receiver scoped to the current evaluation', async () => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: true, host: '127.0.0.2', port: 14318 } } },
      async () => {
        expect(getConfiguredTracingEndpoint()).toBe('http://127.0.0.2:14318');
        expect(getTracingEndpoint()).toBe('http://127.0.0.2:14318');
      },
    );

    expect(getConfiguredTracingEndpoint()).toBeUndefined();
  });

  it('uses the default receiver host when an evaluation omits it', async () => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: true, port: 4318 } } },
      async () => {
        expect(getConfiguredTracingEndpoint()).toBe('http://127.0.0.1:4318');
      },
    );
  });

  it('uses the same service name as the Promptfoo OpenTelemetry configuration', () => {
    vi.stubEnv('PROMPTFOO_OTEL_SERVICE_NAME', 'support-agent-evals');

    expect(getTracingServiceName()).toBe('support-agent-evals');
  });
});
