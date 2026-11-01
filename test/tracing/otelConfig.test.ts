import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOtelConfigFromEnv, getOtelRoutingKey } from '../../src/tracing/otelConfig';

// Mock envars module
vi.mock('../../src/envars', () => ({
  getEnvBool: vi.fn(),
  getEnvString: vi.fn(),
  getEnvOverrides: vi.fn(),
}));

import { getEnvBool, getEnvOverrides, getEnvString } from '../../src/envars';

const mockedGetEnvBool = vi.mocked(getEnvBool);
const mockedGetEnvString = vi.mocked(getEnvString);

describe('otelConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY'])(
    'rejects invocation-only %s when the external exporter would use process credentials',
    (key) => {
      vi.stubEnv(key, 'host');
      mockedGetEnvString.mockImplementation((name, fallback) =>
        name === key ? 'suite' : (process.env[name] ?? fallback),
      );
      const config = { enabled: true, localExport: true, serviceName: 'test', debug: false };
      expect(getOtelRoutingKey(config)).toBeDefined();
      expect(() => getOtelRoutingKey({ ...config, endpoint: 'https://collector.test' })).toThrow(
        'Set OpenTelemetry credentials and SDK settings in the process environment',
      );
    },
  );

  describe('SDK construction settings', () => {
    const settings = [
      'OTEL_ATTRIBUTE_COUNT_LIMIT',
      'OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      'OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT',
      'OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      'OTEL_SPAN_EVENT_COUNT_LIMIT',
      'OTEL_SPAN_LINK_COUNT_LIMIT',
      'OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT',
      'OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT',
      'OTEL_BSP_MAX_QUEUE_SIZE',
      'OTEL_BSP_MAX_EXPORT_BATCH_SIZE',
      'OTEL_BSP_SCHEDULE_DELAY',
      'OTEL_BSP_EXPORT_TIMEOUT',
      'OTEL_EXPORTER_OTLP_TIMEOUT',
      'OTEL_EXPORTER_OTLP_TRACES_TIMEOUT',
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      'OTEL_EXPORTER_OTLP_TRACES_COMPRESSION',
    ];
    const config = {
      enabled: true,
      localExport: true,
      serviceName: 'test',
      debug: false,
      endpoint: 'https://collector.test',
    };

    beforeEach(() => {
      mockedGetEnvString.mockImplementation((key, fallback) => process.env[key] ?? fallback);
    });

    it.each(settings)('changes the compatibility key when process %s changes', (key) => {
      const [first, second] = key.endsWith('_COMPRESSION') ? ['none', 'gzip'] : ['100', '200'];
      vi.stubEnv(key, first);
      const initial = getOtelRoutingKey(config);
      expect(getOtelRoutingKey(config)).toBe(initial);

      vi.stubEnv(key, second);
      expect(getOtelRoutingKey(config)).not.toBe(initial);

      vi.stubEnv(key, first);
      expect(getOtelRoutingKey(config)).toBe(initial);
    });

    it.each(settings)('rejects evaluation-only %s instead of using the process value', (key) => {
      vi.stubEnv(key, key.endsWith('_COMPRESSION') ? 'none' : '100');
      mockedGetEnvString.mockImplementation((name, fallback) =>
        name === key
          ? key.endsWith('_COMPRESSION')
            ? 'gzip'
            : '200'
          : (process.env[name] ?? fallback),
      );
      expect(() => getOtelRoutingKey(config)).toThrow('process environment');
    });
  });

  describe('getOtelConfigFromEnv', () => {
    it('should return default config when no env vars are set', () => {
      mockedGetEnvBool.mockImplementation((_key, defaultVal) => defaultVal ?? false);
      mockedGetEnvString.mockImplementation((_key, defaultVal) => defaultVal);

      const config = getOtelConfigFromEnv();

      expect(config).toEqual({
        enabled: false,
        serviceName: 'promptfoo',
        endpoint: undefined,
        localExport: true,
        debug: false,
      });
    });

    it('should read PROMPTFOO_OTEL_ENABLED', () => {
      mockedGetEnvBool.mockImplementation((key, defaultVal) => {
        if (key === 'PROMPTFOO_OTEL_ENABLED') {
          return true;
        }
        return defaultVal ?? false;
      });
      mockedGetEnvString.mockImplementation((_key, defaultVal) => defaultVal);

      const config = getOtelConfigFromEnv();

      expect(config.enabled).toBe(true);
    });

    it('should read PROMPTFOO_OTEL_SERVICE_NAME', () => {
      mockedGetEnvBool.mockImplementation((_key, defaultVal) => defaultVal ?? false);
      mockedGetEnvString.mockImplementation((key, defaultVal) => {
        if (key === 'PROMPTFOO_OTEL_SERVICE_NAME') {
          return 'my-service';
        }
        return defaultVal;
      });

      const config = getOtelConfigFromEnv();

      expect(config.serviceName).toBe('my-service');
    });

    it('should prefer PROMPTFOO_OTEL_ENDPOINT over OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      mockedGetEnvBool.mockImplementation((_key, defaultVal) => defaultVal ?? false);
      mockedGetEnvString.mockImplementation((key, defaultVal) => {
        if (key === 'PROMPTFOO_OTEL_ENDPOINT') {
          return 'http://custom:4318';
        }
        if (key === 'OTEL_EXPORTER_OTLP_ENDPOINT') {
          return 'http://standard:4318';
        }
        return defaultVal;
      });

      const config = getOtelConfigFromEnv();

      expect(config.endpoint).toBe('http://custom:4318');
    });

    it('should fall back to OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      mockedGetEnvBool.mockImplementation((_key, defaultVal) => defaultVal ?? false);
      mockedGetEnvString.mockImplementation(((key: string, defaultVal?: string) => {
        if (key === 'PROMPTFOO_OTEL_ENDPOINT') {
          return defaultVal;
        }
        if (key === 'OTEL_EXPORTER_OTLP_ENDPOINT') {
          return 'http://standard:4318';
        }
        return defaultVal;
      }) as typeof getEnvString);

      const config = getOtelConfigFromEnv();

      expect(config.endpoint).toBe('http://standard:4318');
    });

    it('should read PROMPTFOO_OTEL_LOCAL_EXPORT', () => {
      mockedGetEnvBool.mockImplementation((key, defaultVal) => {
        if (key === 'PROMPTFOO_OTEL_LOCAL_EXPORT') {
          return false;
        }
        return defaultVal ?? false;
      });
      mockedGetEnvString.mockImplementation((_key, defaultVal) => defaultVal);

      const config = getOtelConfigFromEnv();

      expect(config.localExport).toBe(false);
    });

    it('identifies only the inherited process collector as host-managed', () => {
      const endpoint = 'https://collector.test/';
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', endpoint);
      mockedGetEnvString.mockImplementation((key, fallback) =>
        key === 'OTEL_EXPORTER_OTLP_ENDPOINT' ? endpoint : fallback,
      );
      expect(getOtelConfigFromEnv().inheritedEndpoint).toBe(true);

      vi.mocked(getEnvOverrides).mockImplementation((layer) =>
        layer === 'suite' ? { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint } : undefined,
      );
      expect(getOtelConfigFromEnv().inheritedEndpoint).toBeUndefined();

      vi.mocked(getEnvOverrides).mockReturnValue(undefined);
      mockedGetEnvString.mockImplementation((key, fallback) =>
        key === 'PROMPTFOO_OTEL_ENDPOINT' ? endpoint : fallback,
      );
      expect(getOtelConfigFromEnv().inheritedEndpoint).toBeUndefined();
    });

    it('should read PROMPTFOO_OTEL_DEBUG', () => {
      mockedGetEnvBool.mockImplementation((key, defaultVal) => {
        if (key === 'PROMPTFOO_OTEL_DEBUG') {
          return true;
        }
        return defaultVal ?? false;
      });
      mockedGetEnvString.mockImplementation((_key, defaultVal) => defaultVal);

      const config = getOtelConfigFromEnv();

      expect(config.debug).toBe(true);
    });
  });
});
