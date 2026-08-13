import { TraceFlags, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  getConfiguredTracingEndpoint,
  getConfiguredTracingExport,
  getTracingEndpoint,
  getTracingServiceName,
  hasActiveTracingSpan,
  isActiveTracingExport,
} from '../../src/providers/tracing';

describe('provider tracing integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    cliState.setActiveOtlpReceiver();
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

  it('uses the active shared receiver when another evaluation requests different settings', async () => {
    cliState.setActiveOtlpReceiver({
      host: '127.0.0.2',
      port: 14318,
      acceptFormats: ['protobuf'],
    });

    await cliState.withRequestTracingConfig(
      {
        enabled: true,
        otlp: {
          http: { enabled: true, host: '127.0.0.3', port: 24318, acceptFormats: ['json'] },
        },
      },
      async () => {
        expect(getConfiguredTracingExport()).toEqual({
          endpoint: 'http://127.0.0.2:14318',
          format: 'protobuf',
        });
      },
    );
  });

  it('uses the default receiver host when an evaluation omits it', async () => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: true, port: 4318 } } },
      async () => {
        expect(getConfiguredTracingEndpoint()).toBe('http://127.0.0.1:4318');
      },
    );
  });

  it('does not expose disabled HTTP receivers as configured export destinations', async () => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: false, port: 4318 } } },
      async () => {
        expect(getConfiguredTracingEndpoint()).toBeUndefined();
        expect(getConfiguredTracingExport()).toBeUndefined();
      },
    );
  });

  it('selects protobuf for receivers that do not accept JSON', async () => {
    await cliState.withRequestTracingConfig(
      {
        enabled: true,
        otlp: { http: { enabled: true, port: 14318, acceptFormats: ['protobuf'] } },
      },
      async () => {
        expect(getConfiguredTracingExport()).toEqual({
          endpoint: 'http://127.0.0.1:14318',
          format: 'protobuf',
        });
      },
    );
  });

  it('prefers JSON when receivers accept both export formats', async () => {
    await cliState.withRequestTracingConfig(
      {
        enabled: true,
        otlp: { http: { enabled: true, port: 4318, acceptFormats: ['protobuf', 'json'] } },
      },
      async () => {
        expect(getConfiguredTracingExport()).toEqual({
          endpoint: 'http://127.0.0.1:4318',
          format: 'json',
        });
      },
    );
  });

  it.each(['::1', '[::1]'])('formats IPv6 receiver host %s as a valid URL', async (host) => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: true, host, port: 14318 } } },
      async () => {
        expect(getConfiguredTracingEndpoint()).toBe('http://[::1]:14318');
      },
    );
  });

  it('recognizes only supported exports to the running receiver', () => {
    cliState.setActiveOtlpReceiver({
      host: '::1',
      port: 14318,
      acceptFormats: ['protobuf'],
    });

    expect(isActiveTracingExport('http://[::1]:14318', 'http/protobuf')).toBe(true);
    expect(isActiveTracingExport('http://[::1]:14318/v1/traces', 'http/protobuf')).toBe(true);
    expect(isActiveTracingExport('http://[::1]:14318', 'http/json')).toBe(false);
    expect(isActiveTracingExport('https://collector.example.com', 'http/protobuf')).toBe(false);
    expect(isActiveTracingExport('http://[::1]:14318/custom-traces', 'http/protobuf')).toBe(false);
  });

  it('uses the same service name as the Promptfoo OpenTelemetry configuration', () => {
    vi.stubEnv('PROMPTFOO_OTEL_SERVICE_NAME', 'support-agent-evals');

    expect(getTracingServiceName()).toBe('support-agent-evals');
  });
});
