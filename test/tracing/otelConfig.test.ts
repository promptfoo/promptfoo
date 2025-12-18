import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOtelConfigFromEnv,
  getOtelConfigFromYaml,
  mergeOtelConfigs,
  type OtelConfig,
} from '../../src/tracing/otelConfig';

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

  describe('getOtelConfigFromYaml', () => {
    it('should return empty object when no tracing config', () => {
      const config = getOtelConfigFromYaml({});

      expect(config).toEqual({});
    });

    it('should return empty object when tracing is undefined', () => {
      const config = getOtelConfigFromYaml({ tracing: undefined });

      expect(config).toEqual({});
    });

    it('should parse all tracing config options', () => {
      const config = getOtelConfigFromYaml({
        tracing: {
          enabled: true,
          serviceName: 'yaml-service',
          endpoint: 'http://yaml:4318',
          localExport: false,
          debug: true,
        },
      });

      expect(config).toEqual({
        enabled: true,
        serviceName: 'yaml-service',
        endpoint: 'http://yaml:4318',
        localExport: false,
        debug: true,
      });
    });

    it('should only include valid boolean/string values', () => {
      const config = getOtelConfigFromYaml({
        tracing: {
          enabled: 'true', // string, not boolean - should be ignored
          serviceName: 123, // number, not string - should be ignored
          endpoint: 'http://valid:4318',
        },
      });

      expect(config).toEqual({
        endpoint: 'http://valid:4318',
      });
    });
  });

  describe('mergeOtelConfigs', () => {
    const defaultEnvConfig: OtelConfig = {
      enabled: false,
      serviceName: 'promptfoo',
      endpoint: undefined,
      localExport: true,
      debug: false,
    };

    it('should use env config when yaml config is empty', () => {
      const merged = mergeOtelConfigs(defaultEnvConfig, {});

      expect(merged).toEqual(defaultEnvConfig);
    });

    it('should prefer yaml config over env config', () => {
      const envConfig: OtelConfig = {
        enabled: false,
        serviceName: 'env-service',
        endpoint: 'http://env:4318',
        localExport: true,
        debug: false,
      };

      const yamlConfig = {
        enabled: true,
        serviceName: 'yaml-service',
        endpoint: 'http://yaml:4318',
      };

      const merged = mergeOtelConfigs(envConfig, yamlConfig);

      expect(merged).toEqual({
        enabled: true,
        serviceName: 'yaml-service',
        endpoint: 'http://yaml:4318',
        localExport: true, // from env
        debug: false, // from env
      });
    });

    it('should handle partial yaml overrides', () => {
      const envConfig: OtelConfig = {
        enabled: true,
        serviceName: 'env-service',
        endpoint: 'http://env:4318',
        localExport: true,
        debug: true,
      };

      const yamlConfig = {
        serviceName: 'yaml-service',
      };

      const merged = mergeOtelConfigs(envConfig, yamlConfig);

      expect(merged.serviceName).toBe('yaml-service');
      expect(merged.enabled).toBe(true); // from env
      expect(merged.endpoint).toBe('http://env:4318'); // from env
    });
  });
});
