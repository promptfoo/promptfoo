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

    it.each([
      [undefined, undefined, 'http://collector:4318', 'http://collector:4318/v1/traces'],
      [' ', ' ', 'http://collector:4318/?tenant=a', 'http://collector:4318/v1/traces?tenant=a'],
      [undefined, undefined, 'http://collector/v1/traces', 'http://collector/v1/traces'],
      [undefined, undefined, 'http://collector/custom/path', 'http://collector/custom/path'],
      [undefined, undefined, 'invalid URL', 'invalid URL'],
      [undefined, 'http://traces:4318', 'http://collector', 'http://traces:4318'],
      ['http://override/root', 'http://traces', 'http://collector', 'http://override/root'],
    ])(
      'resolves traces endpoints with override %s, signal %s, and generic %s',
      (override, signal, generic, expected) => {
        const values: Record<string, string | undefined> = {
          PROMPTFOO_OTEL_ENDPOINT: override,
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: signal,
          OTEL_EXPORTER_OTLP_ENDPOINT: generic,
        };
        mockedGetEnvString.mockImplementation((key, fallback) => values[key] ?? fallback);
        expect(getOtelConfigFromEnv().endpoint).toBe(expected);
      },
    );

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
