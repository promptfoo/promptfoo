import { describe, expect, it } from 'vitest';
import { withCodexTraceExporter } from '../../../src/providers/openai/codex-tracing';

describe('withCodexTraceExporter', () => {
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

  it('does not append a traces path when the signal-specific endpoint already includes one', () => {
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
            endpoint: 'https://collector.example.com/v1/traces',
            protocol: 'json',
          },
        },
      },
    });
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
