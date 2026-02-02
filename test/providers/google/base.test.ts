import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the base class
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvInt: vi.fn().mockReturnValue(300000),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/cliState', () => ({
  default: {
    basePath: '/test/base/path',
  },
}));

vi.mock('../../../src/esm', () => ({
  importModule: vi.fn(),
}));

vi.mock('../../../src/util/file', () => ({
  maybeLoadFromExternalFile: vi.fn(),
}));

vi.mock('../../../src/util/index', () => ({
  maybeLoadToolsFromExternalFile: vi.fn().mockResolvedValue([]),
}));

// Use vi.hoisted to hoist mock definitions before vi.mock
const { mockMcpInstance, MockMCPClient } = vi.hoisted(() => {
  const mockMcpInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllTools: vi.fn().mockReturnValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };

  class MockMCPClient {
    initialize = mockMcpInstance.initialize;
    getAllTools = mockMcpInstance.getAllTools;
    cleanup = mockMcpInstance.cleanup;
  }

  return { mockMcpInstance, MockMCPClient };
});

vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: MockMCPClient,
}));

vi.mock('../../../src/providers/mcp/transform', () => ({
  transformMCPToolsToGoogle: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/providers/google/auth', () => ({
  GoogleAuthManager: {
    determineVertexMode: vi.fn().mockReturnValue(false),
    validateAndWarn: vi.fn(),
    getApiKey: vi.fn().mockReturnValue({ apiKey: 'test-key', source: 'config' }),
    resolveRegion: vi.fn().mockReturnValue('us-central1'),
    resolveProjectId: vi.fn().mockResolvedValue('test-project'),
  },
}));

vi.mock('../../../src/providers/google/util', () => ({
  normalizeTools: vi.fn((tools) => tools),
}));

vi.mock('../../../src/util/templates', () => ({
  getNunjucksEngine: vi.fn(() => ({
    renderString: vi.fn((str) => str),
  })),
}));

import { importModule } from '../../../src/esm';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { GoogleGenericProvider } from '../../../src/providers/google/base';
import { maybeLoadToolsFromExternalFile } from '../../../src/util/index';

import type { CallApiContextParams, ProviderResponse } from '../../../src/types/index';

// Create a concrete implementation for testing
class TestGoogleProvider extends GoogleGenericProvider {
  getApiEndpoint(action?: string): string {
    return `https://test-api.example.com/${this.modelName}${action ? `:${action}` : ''}`;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    return { Authorization: 'Bearer test-token' };
  }

  async callApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    return { output: `Response to: ${prompt}` };
  }
}

describe('GoogleGenericProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset hoisted mock instance methods to ensure test isolation
    mockMcpInstance.initialize.mockReset().mockResolvedValue(undefined);
    mockMcpInstance.getAllTools.mockReset().mockReturnValue([]);
    mockMcpInstance.cleanup.mockReset().mockResolvedValue(undefined);
    // Reset utility mocks
    vi.mocked(maybeLoadToolsFromExternalFile).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with model name and default config', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.modelName).toBe('gemini-2.5-pro');
      expect(provider.config).toEqual({});
      expect(GoogleAuthManager.determineVertexMode).toHaveBeenCalled();
      expect(GoogleAuthManager.validateAndWarn).toHaveBeenCalled();
    });

    it('should initialize with custom config', () => {
      const config = { apiKey: 'custom-key', temperature: 0.7 };
      const provider = new TestGoogleProvider('gemini-2.5-pro', { config });

      expect(provider.config).toEqual(config);
    });

    it('should store env overrides', () => {
      const env = { GOOGLE_API_KEY: 'env-key' };
      const provider = new TestGoogleProvider('gemini-2.5-pro', { env });

      expect(provider.env).toEqual(env);
    });

    it('should support custom id', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro', { id: 'custom-id' });

      expect(provider.id()).toBe('custom-id');
    });

    it('should initialize MCP client when configured', async () => {
      const mcpConfig = { enabled: true, servers: [] };
      const _provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { mcp: mcpConfig },
      });

      // Wait for MCP initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify initialization was called on the mock instance
      expect(mockMcpInstance.initialize).toHaveBeenCalled();
    });

    it('should not initialize MCP when not configured', () => {
      mockMcpInstance.initialize.mockClear();
      new TestGoogleProvider('gemini-2.5-pro');

      // Verify initialize was not called since MCP was not configured
      expect(mockMcpInstance.initialize).not.toHaveBeenCalled();
    });
  });

  describe('id()', () => {
    it('should return google prefix for non-vertex mode', () => {
      vi.mocked(GoogleAuthManager.determineVertexMode).mockReturnValue(false);
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.id()).toBe('google:gemini-2.5-pro');
    });

    it('should return vertex prefix for vertex mode', () => {
      vi.mocked(GoogleAuthManager.determineVertexMode).mockReturnValue(true);
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.id()).toBe('vertex:gemini-2.5-pro');
    });

    it('should use custom id when provided', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro', { id: 'my-custom-provider' });

      expect(provider.id()).toBe('my-custom-provider');
    });
  });

  describe('toString()', () => {
    it('should return Google AI Studio string for non-vertex mode', () => {
      vi.mocked(GoogleAuthManager.determineVertexMode).mockReturnValue(false);
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.toString()).toBe('[Google Google AI Studio Provider gemini-2.5-pro]');
    });

    it('should return Vertex AI string for vertex mode', () => {
      vi.mocked(GoogleAuthManager.determineVertexMode).mockReturnValue(true);
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.toString()).toBe('[Google Vertex AI Provider gemini-2.5-pro]');
    });
  });

  describe('getApiKey()', () => {
    it('should delegate to GoogleAuthManager', () => {
      vi.mocked(GoogleAuthManager.getApiKey).mockReturnValue({
        apiKey: 'resolved-key',
        source: 'GOOGLE_API_KEY',
      });

      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { apiKey: 'config-key' },
        env: { GOOGLE_API_KEY: 'env-key' },
      });

      const result = provider.getApiKey();

      expect(result).toBe('resolved-key');
      expect(GoogleAuthManager.getApiKey).toHaveBeenCalled();
    });
  });

  describe('getRegion()', () => {
    it('should delegate to GoogleAuthManager', () => {
      vi.mocked(GoogleAuthManager.resolveRegion).mockReturnValue('europe-west1');

      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { region: 'europe-west1' },
      });

      expect(provider.getRegion()).toBe('europe-west1');
    });
  });

  describe('getProjectId()', () => {
    it('should delegate to GoogleAuthManager', async () => {
      vi.mocked(GoogleAuthManager.resolveProjectId).mockResolvedValue('my-project');

      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { projectId: 'my-project' },
      });

      const result = await provider.getProjectId();

      expect(result).toBe('my-project');
    });
  });

  describe('getAllTools()', () => {
    it('should return empty array when no tools configured', async () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');
      const tools = await provider['getAllTools']();

      expect(tools).toEqual([]);
    });

    it('should load tools from config', async () => {
      const configTools = [{ functionDeclarations: [{ name: 'test_fn' }] }];
      vi.mocked(maybeLoadToolsFromExternalFile).mockResolvedValue(configTools);

      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { tools: configTools },
      });

      const tools = await provider['getAllTools']();

      expect(maybeLoadToolsFromExternalFile).toHaveBeenCalledWith(configTools, undefined);
      expect(tools).toEqual(configTools);
    });

    it('should combine MCP tools with config tools', async () => {
      const mcpConfig = { enabled: true, servers: [] };
      const configTools = [{ functionDeclarations: [{ name: 'config_fn' }] }];

      // Set up mocks before creating provider
      vi.mocked(maybeLoadToolsFromExternalFile).mockResolvedValue(configTools);

      const { transformMCPToolsToGoogle } = await import('../../../src/providers/mcp/transform');
      const mcpTool = { functionDeclarations: [{ name: 'mcp_fn' }] };
      vi.mocked(transformMCPToolsToGoogle).mockReturnValue([mcpTool]);

      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { mcp: mcpConfig, tools: configTools },
      });

      // Wait for MCP initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const tools = await provider['getAllTools']();

      // Should have MCP tool + config tool
      expect(transformMCPToolsToGoogle).toHaveBeenCalled();
      expect(tools).toContainEqual(mcpTool);
      expect(tools.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('loadExternalFunction()', () => {
    it('should load function from file', async () => {
      const mockFn = vi.fn().mockReturnValue('result');
      vi.mocked(importModule).mockResolvedValue(mockFn);

      const provider = new TestGoogleProvider('gemini-2.5-pro');
      const fn = await provider['loadExternalFunction']('file://test.js');

      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'test.js'),
        undefined,
      );
      expect(fn).toBe(mockFn);
    });

    it('should load named function from file', async () => {
      const mockFn = vi.fn().mockReturnValue('result');
      vi.mocked(importModule).mockResolvedValue({ myFunction: mockFn });

      const provider = new TestGoogleProvider('gemini-2.5-pro');
      const fn = await provider['loadExternalFunction']('file://test.js:myFunction');

      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'test.js'),
        'myFunction',
      );
      expect(fn).toBe(mockFn);
    });

    it('should throw error when function not found', async () => {
      vi.mocked(importModule).mockResolvedValue({ someOtherFn: vi.fn() });

      const provider = new TestGoogleProvider('gemini-2.5-pro');

      await expect(provider['loadExternalFunction']('file://test.js:myFunction')).rejects.toThrow(
        'Function callback malformed',
      );
    });

    it('should throw error when module export is not a function', async () => {
      vi.mocked(importModule).mockResolvedValue('not a function');

      const provider = new TestGoogleProvider('gemini-2.5-pro');

      await expect(provider['loadExternalFunction']('file://test.js')).rejects.toThrow(
        'Function callback malformed',
      );
    });
  });

  describe('executeFunctionCallback()', () => {
    it('should execute function callback from config', async () => {
      const mockCallback = vi.fn().mockResolvedValue({ result: 'success' });
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const config = {
        functionToolCallbacks: {
          test_function: mockCallback,
        },
      };

      const result = await provider['executeFunctionCallback'](
        'test_function',
        '{"arg": "value"}',
        config,
      );

      expect(mockCallback).toHaveBeenCalledWith('{"arg": "value"}');
      expect(result).toEqual({ result: 'success' });
    });

    it('should cache loaded function callbacks', async () => {
      const mockCallback = vi.fn().mockResolvedValue({ result: 'success' });
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const config = {
        functionToolCallbacks: {
          test_function: mockCallback,
        },
      };

      await provider['executeFunctionCallback']('test_function', '{}', config);
      await provider['executeFunctionCallback']('test_function', '{}', config);

      // Callback should be cached after first call
      expect(provider['loadedFunctionCallbacks']['test_function']).toBe(mockCallback);
    });

    it('should load function from file:// reference', async () => {
      const mockFn = vi.fn().mockResolvedValue({ loaded: true });
      vi.mocked(importModule).mockResolvedValue(mockFn);

      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const config = {
        functionToolCallbacks: {
          file_function: 'file://callbacks.js:myCallback',
        },
      };

      const result = await provider['executeFunctionCallback']('file_function', '{}', config);

      expect(result).toEqual({ loaded: true });
    });

    it('should throw error when callback not found', async () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const config = {
        functionToolCallbacks: {},
      };

      await expect(
        provider['executeFunctionCallback']('missing_function', '{}', config),
      ).rejects.toThrow("No callback found for function 'missing_function'");
    });
  });

  describe('cleanup()', () => {
    it('should cleanup MCP client when initialized', async () => {
      const mcpConfig = { enabled: true, servers: [] };
      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { mcp: mcpConfig },
      });

      // Wait for MCP initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      await provider.cleanup();

      // MCPClient.cleanup should have been called
      expect(mockMcpInstance.cleanup).toHaveBeenCalled();
    });

    it('should handle cleanup when no MCP client', async () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      // Should not throw
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('getTimeout()', () => {
    it('should return config timeout when set', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro', {
        config: { timeoutMs: 60000 },
      });

      expect(provider['getTimeout']()).toBe(60000);
    });

    it('should return default timeout when not configured', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      // Default is REQUEST_TIMEOUT_MS from shared.ts
      expect(provider['getTimeout']()).toBeGreaterThan(0);
    });
  });

  describe('abstract method implementations', () => {
    it('should call getApiEndpoint on subclass', () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      expect(provider.getApiEndpoint()).toBe('https://test-api.example.com/gemini-2.5-pro');
      expect(provider.getApiEndpoint('generateContent')).toBe(
        'https://test-api.example.com/gemini-2.5-pro:generateContent',
      );
    });

    it('should call getAuthHeaders on subclass', async () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const headers = await provider.getAuthHeaders();

      expect(headers).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('should call callApi on subclass', async () => {
      const provider = new TestGoogleProvider('gemini-2.5-pro');

      const response = await provider.callApi('Hello');

      expect(response).toEqual({ output: 'Response to: Hello' });
    });
  });
});
