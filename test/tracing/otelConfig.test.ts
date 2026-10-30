import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOtelConfigFromEnv } from '../../src/tracing/otelConfig';

// Mock envars module
vi.mock('../../src/envars', () => ({
  getEnvBool: vi.fn(),
  getEnvString: vi.fn(),
}));

import { getEnvBool, getEnvString } from '../../src/envars';

const mockedGetEnvBool = vi.mocked(getEnvBool);
const mockedGetEnvString = vi.mocked(getEnvString);

describe('otelConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
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

    describe('OTLP traces endpoint resolution', () => {
      const withEnv = (values: Record<string, string>) => {
        mockedGetEnvBool.mockImplementation((_key, defaultVal) => defaultVal ?? false);
        mockedGetEnvString.mockImplementation(
          ((key: string, defaultVal?: string) => values[key] ?? defaultVal) as typeof getEnvString,
        );
      };

      it.each([
        ['http://standard:4318', 'http://standard:4318/v1/traces'],
        ['http://standard:4318/', 'http://standard:4318/v1/traces'],
        ['http://standard:4318/custom/v1/traces', 'http://standard:4318/custom/v1/traces'],
      ])('treats generic OTEL_EXPORTER_OTLP_ENDPOINT %s as a base URL', (generic, expected) => {
        withEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: generic });
        expect(getOtelConfigFromEnv().endpoint).toBe(expected);
      });

      it('uses signal-specific OTEL_EXPORTER_OTLP_TRACES_ENDPOINT verbatim, ahead of the generic one', () => {
        withEnv({
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://traces:4318',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://standard:4318',
        });
        expect(getOtelConfigFromEnv().endpoint).toBe('http://traces:4318');
      });
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
