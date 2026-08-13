import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import {
  getCodexTraceProtocol,
  getCodexTraceShutdownGraceMs,
  withCodexTraceExporter,
} from '../../../src/providers/openai/codex-tracing';

describe('getCodexTraceShutdownGraceMs', () => {
  it('matches the default OTLP exporter timeout', () => {
    expect(getCodexTraceShutdownGraceMs({})).toBe(10_000);
  });

  it('prefers the trace-specific exporter timeout', () => {
    expect(
      getCodexTraceShutdownGraceMs({
        OTEL_EXPORTER_OTLP_TIMEOUT: '12_000',
        OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: '15000',
      }),
    ).toBe(15_000);
  });

  it('honors a valid generic exporter timeout when the trace-specific value is invalid', () => {
    expect(
      getCodexTraceShutdownGraceMs({
        OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: '-1',
        OTEL_EXPORTER_OTLP_TIMEOUT: '20000',
      }),
    ).toBe(20_000);
  });

  it('always gives the exporter at least five seconds to flush', () => {
    expect(getCodexTraceShutdownGraceMs({ OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: '250' })).toBe(5_000);
  });
});

describe('withCodexTraceExporter', () => {
  afterEach(() => {
    cliState.setActiveOtlpReceiver();
  });

  it('leaves ordinary Codex calls unchanged', () => {
    const config = { model_provider: 'amazon-bedrock' };

    expect(withCodexTraceExporter(config, {}, false)).toBe(config);
  });

  it('configures the documented OTLP HTTP exporter for deep tracing', () => {
    expect(withCodexTraceExporter({}, {}, true)).toEqual({
      otel: {
        trace_exporter: {
          'otlp-http': {
            endpoint: 'http://127.0.0.1:4318/v1/traces',
            protocol: 'json',
          },
        },
      },
    });
  });

  it('preserves existing Codex telemetry settings and protobuf collector configuration', () => {
    expect(
      withCodexTraceExporter(
        { otel: { environment: 'staging' } },
        {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example.com/',
          OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        },
        true,
      ),
    ).toEqual({
      otel: {
        environment: 'staging',
        trace_exporter: {
          'otlp-http': {
            endpoint: 'https://collector.example.com/v1/traces',
            protocol: 'binary',
          },
        },
      },
    });
  });

  it('preserves signal-specific trace endpoints verbatim', () => {
    expect(
      withCodexTraceExporter(
        {},
        { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector.example.com/v1/traces/' },
        true,
      ),
    ).toEqual({
      otel: {
        trace_exporter: {
          'otlp-http': {
            endpoint: 'https://collector.example.com/v1/traces/',
            protocol: 'json',
          },
        },
      },
    });
  });

  it.each([
    'https://collector.example.com/custom-traces',
    'https://collector.example.com/custom-traces?token=redacted',
  ])('does not alter the signal-specific endpoint %s', (endpoint) => {
    expect(
      withCodexTraceExporter({}, { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint }, true),
    ).toEqual({
      otel: {
        trace_exporter: {
          'otlp-http': { endpoint, protocol: 'json' },
        },
      },
    });
  });

  it.each([
    [
      'https://collector.example.com/otlp?api-version=1',
      'https://collector.example.com/otlp/v1/traces?api-version=1',
    ],
    [
      'https://collector.example.com/otlp/?api-version=1#trace',
      'https://collector.example.com/otlp/v1/traces?api-version=1#trace',
    ],
    [
      'https://collector.example.com/v1/traces?api-version=1',
      'https://collector.example.com/v1/traces?api-version=1',
    ],
  ])('appends trace paths before query parameters in %s', (endpoint, expectedEndpoint) => {
    expect(withCodexTraceExporter({}, { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }, true)).toEqual({
      otel: {
        trace_exporter: {
          'otlp-http': { endpoint: expectedEndpoint, protocol: 'json' },
        },
      },
    });
  });

  it('matches the active receiver format when a later evaluation requests another format', async () => {
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
        expect(getCodexTraceProtocol()).toBe('http/protobuf');
        expect(withCodexTraceExporter({}, {}, true)).toEqual({
          otel: {
            trace_exporter: {
              'otlp-http': {
                endpoint: 'http://127.0.0.2:14318/v1/traces',
                protocol: 'binary',
              },
            },
          },
        });
      },
    );
  });

  it('preserves an explicit trace-specific protocol override', async () => {
    await cliState.withRequestTracingConfig(
      { enabled: true, otlp: { http: { enabled: true, port: 4318, acceptFormats: ['protobuf'] } } },
      async () => {
        expect(
          withCodexTraceExporter({}, { OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json' }, true),
        ).toMatchObject({
          otel: { trace_exporter: { 'otlp-http': { protocol: 'json' } } },
        });
      },
    );
  });

  it('supports gRPC trace exporters', () => {
    expect(
      withCodexTraceExporter(
        {},
        {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.example.com:4317',
          OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        },
        true,
      ),
    ).toEqual({
      otel: {
        trace_exporter: {
          'otlp-grpc': { endpoint: 'http://collector.example.com:4317' },
        },
      },
    });
  });

  it('never replaces an explicitly configured Codex trace exporter', () => {
    const config = {
      otel: {
        trace_exporter: {
          'otlp-http': { endpoint: 'https://existing.example.com/v1/traces', protocol: 'binary' },
        },
      },
    };

    expect(withCodexTraceExporter(config, {}, true)).toBe(config);
  });

  it.each([
    { 'otel.trace_exporter': 'none' },
    { 'otel.trace_exporter.otlp-http.endpoint': 'https://collector.example.com/v1/traces' },
    { otel: { 'trace_exporter.otlp-http.endpoint': 'https://collector.example.com/v1/traces' } },
  ])('preserves existing exporter settings expressed as dotted config keys', (config) => {
    expect(withCodexTraceExporter(config, {}, true)).toBe(config);
  });

  it('leaves invalid existing telemetry configuration unchanged', () => {
    const config = { otel: 'disabled' };

    expect(withCodexTraceExporter(config, {}, true)).toBe(config);
  });
});
