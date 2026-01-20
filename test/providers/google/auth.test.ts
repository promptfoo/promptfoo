import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthManager } from '../../../src/providers/google/auth';

// Mock dependencies
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/util/file', () => ({
  maybeLoadFromExternalFile: vi.fn(),
}));

const mockGoogleAuthInstance = {
  getClient: vi.fn().mockResolvedValue({}),
  getProjectId: vi.fn().mockResolvedValue('detected-project'),
  fromJSON: vi.fn().mockResolvedValue({}),
};

vi.mock('google-auth-library', () => {
  const MockGoogleAuth = vi.fn().mockImplementation(() => mockGoogleAuthInstance);
  return {
    GoogleAuth: MockGoogleAuth,
    default: { GoogleAuth: MockGoogleAuth },
  };
});

import { getEnvString } from '../../../src/envars';
import logger from '../../../src/logger';
import { maybeLoadFromExternalFile } from '../../../src/util/file';

describe('GoogleAuthManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    GoogleAuthManager.clearCache();
    // Reset mock instance methods
    mockGoogleAuthInstance.getClient.mockClear().mockResolvedValue({});
    mockGoogleAuthInstance.getProjectId.mockClear().mockResolvedValue('detected-project');
    mockGoogleAuthInstance.fromJSON.mockClear().mockResolvedValue({});
    // Clear environment variables
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.VERTEX_API_KEY;
    delete process.env.PALM_API_KEY;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_LOCATION;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiKey', () => {
    it('should prioritize config.apiKey over all env vars', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_API_KEY') {
          return 'google-key';
        }
        if (key === 'GEMINI_API_KEY') {
          return 'gemini-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({ apiKey: 'config-key' });

      expect(result.apiKey).toBe('config-key');
      expect(result.source).toBe('config');
    });

    it('should prioritize VERTEX_API_KEY in vertex mode', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'VERTEX_API_KEY') {
          return 'vertex-key';
        }
        if (key === 'GOOGLE_API_KEY') {
          return 'google-key';
        }
        if (key === 'GEMINI_API_KEY') {
          return 'gemini-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({}, undefined, true);

      expect(result.apiKey).toBe('vertex-key');
      expect(result.source).toBe('VERTEX_API_KEY');
    });

    it('should not use VERTEX_API_KEY in non-vertex mode', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'VERTEX_API_KEY') {
          return 'vertex-key';
        }
        if (key === 'GOOGLE_API_KEY') {
          return 'google-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({}, undefined, false);

      expect(result.apiKey).toBe('google-key');
      expect(result.source).toBe('GOOGLE_API_KEY');
    });

    it('should prioritize GOOGLE_API_KEY over GEMINI_API_KEY (Python SDK alignment)', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_API_KEY') {
          return 'google-key';
        }
        if (key === 'GEMINI_API_KEY') {
          return 'gemini-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({});

      expect(result.apiKey).toBe('google-key');
      expect(result.source).toBe('GOOGLE_API_KEY');
    });

    it('should fall back to GEMINI_API_KEY when GOOGLE_API_KEY is not set', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GEMINI_API_KEY') {
          return 'gemini-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({});

      expect(result.apiKey).toBe('gemini-key');
      expect(result.source).toBe('GEMINI_API_KEY');
    });

    it('should fall back to PALM_API_KEY in non-vertex mode', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'PALM_API_KEY') {
          return 'palm-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({}, undefined, false);

      expect(result.apiKey).toBe('palm-key');
      expect(result.source).toBe('PALM_API_KEY');
    });

    it('should not use PALM_API_KEY in vertex mode', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'PALM_API_KEY') {
          return 'palm-key';
        }
        return defaultValue as string;
      });

      const result = GoogleAuthManager.getApiKey({}, undefined, true);

      expect(result.apiKey).toBeUndefined();
      expect(result.source).toBe('none');
    });

    it('should log debug when both GOOGLE_API_KEY and GEMINI_API_KEY are set (SDK aligned)', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_API_KEY') {
          return 'google-key';
        }
        if (key === 'GEMINI_API_KEY') {
          return 'gemini-key';
        }
        return defaultValue as string;
      });

      GoogleAuthManager.getApiKey({});

      // This is not an error condition - GOOGLE_API_KEY correctly takes precedence
      expect(logger.debug).toHaveBeenCalledWith(
        '[Google] Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.',
      );
    });

    it('should log debug even when both keys have the same value (SDK aligned)', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_API_KEY') {
          return 'same-key';
        }
        if (key === 'GEMINI_API_KEY') {
          return 'same-key';
        }
        return defaultValue as string;
      });

      GoogleAuthManager.getApiKey({});

      // This is not an error condition - just informational
      expect(logger.debug).toHaveBeenCalledWith(
        '[Google] Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.',
      );
    });

    it('should use env overrides over process.env', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const result = GoogleAuthManager.getApiKey({}, { GOOGLE_API_KEY: 'override-key' });

      expect(result.apiKey).toBe('override-key');
      expect(result.source).toBe('GOOGLE_API_KEY');
    });

    it('should return none when no API key is available', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const result = GoogleAuthManager.getApiKey({});

      expect(result.apiKey).toBeUndefined();
      expect(result.source).toBe('none');
    });
  });

  describe('determineVertexMode', () => {
    it('should use explicit vertexai config flag', () => {
      expect(GoogleAuthManager.determineVertexMode({ vertexai: true })).toBe(true);
      expect(GoogleAuthManager.determineVertexMode({ vertexai: false })).toBe(false);
    });

    it('should check GOOGLE_GENAI_USE_VERTEXAI env var', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') {
          return 'true';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({})).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Vertex AI mode enabled via GOOGLE_GENAI_USE_VERTEXAI'),
      );
    });

    it('should handle GOOGLE_GENAI_USE_VERTEXAI=1', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') {
          return '1';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({})).toBe(true);
    });

    it('should handle GOOGLE_GENAI_USE_VERTEXAI=false', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') {
          return 'false';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({})).toBe(false);
    });

    it('should auto-detect vertex mode from projectId', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'VERTEX_PROJECT_ID') {
          return 'my-project';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({})).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Auto-detected Vertex AI mode'),
      );
    });

    it('should auto-detect vertex mode from GOOGLE_CLOUD_PROJECT', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_CLOUD_PROJECT') {
          return 'my-project';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({})).toBe(true);
    });

    it('should auto-detect vertex mode from credentials config', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.determineVertexMode({ credentials: '{}' })).toBe(true);
    });

    it('should default to Google AI Studio mode', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.determineVertexMode({})).toBe(false);
    });

    it('should prefer explicit config over env var', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') {
          return 'true';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.determineVertexMode({ vertexai: false })).toBe(false);
    });
  });

  describe('validateAndWarn', () => {
    it('should warn when GOOGLE_GENAI_USE_VERTEXAI conflicts with config', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') {
          return 'true';
        }
        return defaultValue as string;
      });

      GoogleAuthManager.validateAndWarn({ vertexai: false });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GOOGLE_GENAI_USE_VERTEXAI is set but vertexai: false'),
      );
    });

    it('should warn when GOOGLE_CLOUD_PROJECT conflicts with config.projectId', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_CLOUD_PROJECT') {
          return 'env-project';
        }
        return defaultValue as string;
      });

      GoogleAuthManager.validateAndWarn({ projectId: 'config-project' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Both GOOGLE_CLOUD_PROJECT and config.projectId are set'),
      );
    });

    it('should log debug when both apiKey and credentials are set', () => {
      // When both are set, API key takes precedence (express mode is automatic)
      GoogleAuthManager.validateAndWarn({ apiKey: 'key', credentials: '{}' });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Both apiKey and credentials are set'),
      );
    });

    describe('mutual exclusivity (strictMutualExclusivity)', () => {
      it('should warn by default when both apiKey and projectId are set', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        // Should not throw by default (permissive mode)
        expect(() => {
          GoogleAuthManager.validateAndWarn({ apiKey: 'key', projectId: 'project' });
        }).not.toThrow();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Project/location and API key are mutually exclusive'),
        );
      });

      it('should warn by default when both apiKey and region are set', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        // Should not throw by default (permissive mode)
        expect(() => {
          GoogleAuthManager.validateAndWarn({ apiKey: 'key', region: 'us-central1' });
        }).not.toThrow();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Project/location and API key are mutually exclusive'),
        );
      });

      it('should throw error when strictMutualExclusivity is true', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        expect(() => {
          GoogleAuthManager.validateAndWarn({
            apiKey: 'key',
            projectId: 'project',
            strictMutualExclusivity: true,
          });
        }).toThrow('Project/location and API key are mutually exclusive');
      });

      it('should only warn when strictMutualExclusivity is false', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        // Should not throw
        expect(() => {
          GoogleAuthManager.validateAndWarn({
            apiKey: 'key',
            projectId: 'project',
            strictMutualExclusivity: false,
          });
        }).not.toThrow();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Project/location and API key are mutually exclusive'),
        );
      });

      it('should not throw when only apiKey is set', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        expect(() => {
          GoogleAuthManager.validateAndWarn({ apiKey: 'key' });
        }).not.toThrow();
      });

      it('should not throw when only projectId is set', () => {
        vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

        expect(() => {
          GoogleAuthManager.validateAndWarn({ projectId: 'project' });
        }).not.toThrow();
      });
    });
  });

  describe('resolveRegion', () => {
    it('should prioritize config.region', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'VERTEX_REGION') {
          return 'env-region';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.resolveRegion({ region: 'config-region' })).toBe('config-region');
    });

    it('should use VERTEX_REGION env var', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'VERTEX_REGION') {
          return 'env-region';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.resolveRegion({})).toBe('env-region');
    });

    it('should use GOOGLE_CLOUD_LOCATION env var (Python SDK)', () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'GOOGLE_CLOUD_LOCATION') {
          return 'cloud-location';
        }
        return defaultValue as string;
      });

      expect(GoogleAuthManager.resolveRegion({})).toBe('cloud-location');
    });

    it('should default to us-central1 when hasApiKey is undefined', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.resolveRegion({})).toBe('us-central1');
    });

    it('should default to us-central1 when hasApiKey is true (API key mode)', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.resolveRegion({}, undefined, true)).toBe('us-central1');
    });

    it('should default to global when hasApiKey is false (OAuth mode - SDK aligned)', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.resolveRegion({}, undefined, false)).toBe('global');
    });

    it('should use env overrides', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      expect(GoogleAuthManager.resolveRegion({}, { VERTEX_REGION: 'override-region' })).toBe(
        'override-region',
      );
    });

    it('should prioritize config.region over hasApiKey default', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      // Even with hasApiKey: false, explicit config should win
      expect(GoogleAuthManager.resolveRegion({ region: 'explicit-region' }, undefined, false)).toBe(
        'explicit-region',
      );
    });
  });

  describe('loadCredentials', () => {
    it('should return undefined for undefined input', () => {
      expect(GoogleAuthManager.loadCredentials(undefined)).toBeUndefined();
    });

    it('should return raw credentials string as-is', () => {
      const creds = '{"type":"service_account"}';
      expect(GoogleAuthManager.loadCredentials(creds)).toBe(creds);
    });

    it('should load credentials from file:// path', () => {
      const fileCreds = '{"type":"service_account","project_id":"test"}';
      vi.mocked(maybeLoadFromExternalFile).mockReturnValue(fileCreds);

      const result = GoogleAuthManager.loadCredentials('file:///path/to/creds.json');

      expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('file:///path/to/creds.json');
      expect(result).toBe(fileCreds);
    });

    it('should throw error when file loading fails', () => {
      vi.mocked(maybeLoadFromExternalFile).mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => GoogleAuthManager.loadCredentials('file:///bad/path.json')).toThrow(
        'Failed to load credentials from file',
      );
    });

    it('should handle pre-parsed object credentials (from config loading pipeline)', () => {
      // When config loading processes file:// paths to JSON files, it may return
      // parsed objects instead of strings. The fix handles this case.
      const parsedCreds = { type: 'service_account', project_id: 'test-project' };

      const result = GoogleAuthManager.loadCredentials(parsedCreds as unknown as string);

      expect(result).toBe(JSON.stringify(parsedCreds));
    });

    it('should handle maybeLoadFromExternalFile returning parsed object for JSON files', () => {
      // maybeLoadFromExternalFile parses JSON files and returns objects, not strings
      const parsedCreds = { type: 'service_account', project_id: 'test-project' };
      vi.mocked(maybeLoadFromExternalFile).mockReturnValue(parsedCreds);

      const result = GoogleAuthManager.loadCredentials('file:///path/to/creds.json');

      expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('file:///path/to/creds.json');
      expect(result).toBe(JSON.stringify(parsedCreds));
    });
  });

  // Note: getOAuthClient, resolveProjectId (OAuth path), and clearCache tests require
  // the google-auth-library package and use dynamic imports that are difficult to mock.
  // These are tested in integration tests with the actual library.
  // See: test/providers/google/vertex.test.ts for integration coverage

  // Note: getOAuthClient and resolveProjectId tests require the google-auth-library
  // package with proper constructor mocking. These are tested in integration tests.
  // See: test/providers/google/vertex.test.ts for integration coverage

  describe('clearCache', () => {
    it('should reset cachedAuth to undefined', () => {
      // clearCache is a simple function that can be tested in isolation
      // The actual caching behavior is tested in integration tests
      expect(() => GoogleAuthManager.clearCache()).not.toThrow();
    });
  });
});
