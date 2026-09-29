import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted() to create mock functions and classes that are available in the vi.mock() factory
const mocks = vi.hoisted(() => {
  const mockGetPrompt = vi.fn();
  const constructorCalls: any[] = [];
  // Set by tests to make importing the SDK or constructing the client fail.
  const failures: { importError?: Error; constructorError?: Error } = {};

  // Create a proper class mock for the Langfuse v5 client.
  class MockLangfuseClient {
    prompt: { get: typeof mockGetPrompt };

    constructor(params: any) {
      constructorCalls.push(params);
      if (failures.constructorError) {
        throw failures.constructorError;
      }
      this.prompt = { get: mockGetPrompt };
    }
  }

  const envStringFor =
    (env: { publicKey?: string; secretKey?: string; host?: string }) =>
    (key: string): string | undefined => {
      switch (key) {
        case 'LANGFUSE_PUBLIC_KEY':
          return env.publicKey;
        case 'LANGFUSE_SECRET_KEY':
          return env.secretKey;
        case 'LANGFUSE_HOST':
          return env.host;
        default:
          return '';
      }
    };

  const defaultEnvString = envStringFor({
    publicKey: 'test-public-key',
    secretKey: 'test-secret-key',
    host: 'https://test.langfuse.com',
  });

  const mockGetEnvString = vi.fn(defaultEnvString);

  return {
    mockGetPrompt,
    MockLangfuseClient,
    constructorCalls,
    failures,
    envStringFor,
    defaultEnvString,
    mockGetEnvString,
  };
});

// Mock envars module
vi.mock('../../src/envars', () => ({
  getEnvString: mocks.mockGetEnvString,
}));

vi.mock('@langfuse/client', () => ({
  // A getter, so a test can make loading the SDK fail with the original error.
  get LangfuseClient() {
    if (mocks.failures.importError) {
      throw mocks.failures.importError;
    }
    return mocks.MockLangfuseClient;
  },
}));

describe('langfuse integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetEnvString.mockReset();
    mocks.mockGetEnvString.mockImplementation(mocks.defaultEnvString);
    // Clear the constructor calls array
    mocks.constructorCalls.length = 0;
    mocks.failures.importError = undefined;
    mocks.failures.constructorError = undefined;
    // Reset the module to clear the cached langfuse instance
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('client reuse and loading', () => {
    const compiledPrompt = () => ({ compile: vi.fn().mockReturnValue('compiled') });

    it('should share one client and one request across concurrent fetches of the same prompt', async () => {
      mocks.mockGetPrompt.mockResolvedValue(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      const results = await Promise.all(
        Array.from({ length: 5 }, () => getPrompt('greeting', {}, 'text', undefined, 'production')),
      );

      expect(results).toEqual(Array(5).fill('compiled'));
      expect(mocks.constructorCalls).toHaveLength(1);
      expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(1);
    });

    it('should not share requests between different prompts, types, versions, or labels', async () => {
      mocks.mockGetPrompt.mockResolvedValue(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      await Promise.all([
        getPrompt('greeting', {}, 'text', 1),
        getPrompt('greeting', {}, 'chat', 1),
        getPrompt('greeting', {}, 'text', 2),
        getPrompt('greeting', {}, 'text', undefined, 'staging'),
        getPrompt('farewell', {}, 'text', 1),
      ]);

      expect(mocks.constructorCalls).toHaveLength(1);
      expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(5);
    });

    it('should not share an in-flight request between different credentials', async () => {
      let resolveFirstRequest!: (prompt: unknown) => void;
      mocks.mockGetPrompt
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstRequest = resolve;
            }),
        )
        .mockResolvedValueOnce(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      const first = getPrompt('greeting', {}, 'text', 1);
      await vi.waitFor(() => expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(1));
      mocks.mockGetEnvString.mockImplementation(
        mocks.envStringFor({
          publicKey: 'other-public-key',
          secretKey: 'other-secret-key',
          host: 'https://test.langfuse.com',
        }),
      );
      const second = getPrompt('greeting', {}, 'text', 1);
      // The first request is still in flight, so the new client only calls the SDK if it isn't reused.
      await vi.waitFor(() => expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(2));
      resolveFirstRequest(compiledPrompt());
      await Promise.all([first, second]);

      expect(mocks.constructorCalls).toHaveLength(2);
    });

    it('should leave repeat fetches to the SDK cache once a request has settled', async () => {
      mocks.mockGetPrompt.mockResolvedValue(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      await getPrompt('greeting', {}, 'text', 1);
      await getPrompt('greeting', {}, 'text', 1);

      expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(2);
    });

    it('should share a failed request with concurrent callers and retry on the next fetch', async () => {
      mocks.mockGetPrompt
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      const results = await Promise.allSettled([
        getPrompt('greeting', {}, 'text'),
        getPrompt('greeting', {}, 'text'),
      ]);

      expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(1);
      await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');
      expect(mocks.mockGetPrompt).toHaveBeenCalledTimes(2);
    });

    it('should explain how to install @langfuse/client when it is missing', async () => {
      mocks.failures.importError = Object.assign(
        new Error(
          "Cannot find package '@langfuse/client' imported from /app/dist/src/integrations/langfuse.js",
        ),
        { code: 'ERR_MODULE_NOT_FOUND' },
      );
      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('greeting', {}, 'text')).rejects.toThrow(
        'The @langfuse/client package is required for Langfuse integration. Please install it with: npm install @langfuse/client',
      );
    });

    it('should surface other errors from loading @langfuse/client unchanged', async () => {
      // Installing @langfuse/client does not fix a missing dependency of the installed SDK.
      const importError = Object.assign(
        new Error(
          "Cannot find package '@langfuse/core' imported from /app/node_modules/@langfuse/client/dist/index.mjs",
        ),
        { code: 'ERR_MODULE_NOT_FOUND' },
      );
      mocks.failures.importError = importError;
      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('greeting', {}, 'text')).rejects.toBe(importError);
    });

    it('should retry creating the client after it fails', async () => {
      mocks.failures.constructorError = new Error('Invalid Langfuse configuration');
      mocks.mockGetPrompt.mockResolvedValue(compiledPrompt());
      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('greeting', {}, 'text')).rejects.toThrow(
        'Invalid Langfuse configuration',
      );
      mocks.failures.constructorError = undefined;
      await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');

      expect(mocks.constructorCalls).toHaveLength(2);
    });
  });

  describe('getPrompt', () => {
    it('should fetch a text prompt by version', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Hello, world!'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 2);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: 2,
        type: 'text',
      });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe('Hello, world!');
    });

    it('should fetch a text prompt by label', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Hello from production!'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt(
        'test-prompt',
        { name: 'test' },
        'text',
        undefined,
        'production',
      );

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: undefined,
        label: 'production',
        type: 'text',
      });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe('Hello from production!');
    });

    it('should fetch a chat prompt by version', async () => {
      const mockChatMessages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];
      const mockPrompt = {
        compile: vi.fn().mockReturnValue(mockChatMessages),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('chat-prompt', { name: 'test' }, 'chat', 1);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('chat-prompt', {
        version: 1,
        type: 'chat',
      });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe(JSON.stringify(mockChatMessages));
    });

    it('should fetch a chat prompt by label', async () => {
      const mockChatMessages = [
        { role: 'system', content: 'You are a production assistant' },
        { role: 'user', content: 'Hello from production' },
      ];
      const mockPrompt = {
        compile: vi.fn().mockReturnValue(mockChatMessages),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('chat-prompt', { name: 'test' }, 'chat', undefined, 'latest');

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('chat-prompt', {
        version: undefined,
        label: 'latest',
        type: 'chat',
      });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe(JSON.stringify(mockChatMessages));
    });

    it('should handle prompt with no type specified (defaults to text)', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Default text prompt'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, undefined, 3);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: 3,
        type: 'text',
      });
      expect(result).toBe('Default text prompt');
    });

    it('should pass empty options object when no label is provided', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test prompt'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 1);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: 1,
        type: 'text',
      });
      expect(result).toBe('Test prompt');
    });

    it('should handle non-string compiled prompt results', async () => {
      const mockCompiledResult = { structured: 'data', nested: { value: 123 } };
      const mockPrompt = {
        compile: vi.fn().mockReturnValue(mockCompiledResult),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 1);

      expect(result).toBe(JSON.stringify(mockCompiledResult));
    });

    it('should handle prompt compilation with multiple variables', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Hello John, you are 30 years old'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const vars = { name: 'John', age: '30', city: 'New York' };
      const result = await getPrompt('test-prompt', vars, 'text', 1);

      expect(mockPrompt.compile).toHaveBeenCalledWith(vars);
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should handle errors from Langfuse API', async () => {
      mocks.mockGetPrompt.mockRejectedValue(new Error('API Error: Prompt not found'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('non-existent', {}, 'text', 1)).rejects.toThrow(
        'Failed to fetch Langfuse prompt "non-existent" version 1: API Error: Prompt not found',
      );
    });

    it('should provide context in error messages for label-based fetching', async () => {
      mocks.mockGetPrompt.mockRejectedValue(new Error('Label not found'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(
        getPrompt('test-prompt', {}, 'text', undefined, 'non-existent-label'),
      ).rejects.toThrow(
        'Failed to fetch Langfuse prompt "test-prompt" with label "non-existent-label": Label not found',
      );
    });

    it('should provide context in error messages for prompts without version or label', async () => {
      mocks.mockGetPrompt.mockRejectedValue(new Error('Network error'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('test-prompt', {}, 'text')).rejects.toThrow(
        'Failed to fetch Langfuse prompt "test-prompt": Network error',
      );
    });

    it('should reuse the same Langfuse instance across calls', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');

      // Make multiple calls
      await getPrompt('test1', {}, 'text', 1);
      await getPrompt('test2', {}, 'text', 2);
      await getPrompt('test3', {}, 'text', 3);

      // Verify Langfuse constructor was called only once
      expect(mocks.constructorCalls).toHaveLength(1);
      expect(mocks.constructorCalls[0]).toEqual({
        publicKey: 'test-public-key',
        secretKey: 'test-secret-key',
        baseUrl: 'https://test.langfuse.com',
      });
    });

    it('should read Langfuse settings when fetching, not when the module is imported', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);
      // --env-file and the config's `env:` block are applied after the module is imported.
      mocks.mockGetEnvString.mockImplementation(mocks.envStringFor({}));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      mocks.mockGetEnvString.mockImplementation(
        mocks.envStringFor({
          publicKey: 'late-public-key',
          secretKey: 'late-secret-key',
          host: 'https://self-hosted.example.com',
        }),
      );

      await getPrompt('test-prompt', {}, 'text', 1);

      expect(mocks.constructorCalls).toEqual([
        {
          publicKey: 'late-public-key',
          secretKey: 'late-secret-key',
          baseUrl: 'https://self-hosted.example.com',
        },
      ]);
    });

    it.each([
      {
        changed: 'host',
        env: {
          publicKey: 'test-public-key',
          secretKey: 'test-secret-key',
          host: 'https://other.langfuse.com',
        },
      },
      {
        changed: 'public key',
        env: {
          publicKey: 'other-public-key',
          secretKey: 'test-secret-key',
          host: 'https://test.langfuse.com',
        },
      },
      {
        changed: 'secret key',
        env: {
          publicKey: 'test-public-key',
          secretKey: 'other-secret-key',
          host: 'https://test.langfuse.com',
        },
      },
    ])('should create a new Langfuse instance when only the $changed changes', async ({ env }) => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await getPrompt('test1', {}, 'text', 1);
      mocks.mockGetEnvString.mockImplementation(mocks.envStringFor(env));
      await getPrompt('test2', {}, 'text', 1);
      await getPrompt('test3', {}, 'text', 1);

      expect(mocks.constructorCalls).toEqual([
        {
          publicKey: 'test-public-key',
          secretKey: 'test-secret-key',
          baseUrl: 'https://test.langfuse.com',
        },
        {
          publicKey: env.publicKey,
          secretKey: env.secretKey,
          baseUrl: env.host,
        },
      ]);
    });

    it('should treat blank Langfuse settings as unset', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);
      // e.g. `LANGFUSE_HOST=` in an env file. The SDK falls back with `??`, so '' would be used as the base URL.
      mocks.mockGetEnvString.mockImplementation(
        mocks.envStringFor({ publicKey: '', secretKey: '', host: '' }),
      );

      const { getPrompt } = await import('../../src/integrations/langfuse');
      await getPrompt('test-prompt', {}, 'text', 1);

      expect(mocks.constructorCalls).toEqual([
        { publicKey: undefined, secretKey: undefined, baseUrl: undefined },
      ]);
    });

    it('should handle label with latest version', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Latest version content'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', {}, 'text', undefined, 'latest');

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: undefined,
        label: 'latest',
        type: 'text',
      });
      expect(result).toBe('Latest version content');
    });

    it('should handle label with staging environment', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Staging content'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', {}, 'text', undefined, 'staging');

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', {
        version: undefined,
        label: 'staging',
        type: 'text',
      });
      expect(result).toBe('Staging content');
    });

    it('should convert non-string variables to strings for Langfuse compile()', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Result with converted vars'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const vars = {
        name: 'John',
        age: 30,
        active: true,
        metadata: { key: 'value' },
        tags: ['a', 'b'],
      };
      const result = await getPrompt('test-prompt', vars, 'text', 1);

      // Langfuse compile() expects Record<string, string>, so non-strings should be JSON stringified
      expect(mockPrompt.compile).toHaveBeenCalledWith({
        name: 'John',
        age: '30',
        active: 'true',
        metadata: '{"key":"value"}',
        tags: '["a","b"]',
      });
      expect(result).toBe('Result with converted vars');
    });
  });
});
