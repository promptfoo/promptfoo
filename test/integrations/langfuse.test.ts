import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted() to create mock functions and classes that are available in the vi.mock() factory
const mocks = vi.hoisted(() => {
  const mockGetPrompt = vi.fn();
  const constructorCalls: any[] = [];

  // Create a proper class mock for Langfuse
  class MockLangfuse {
    getPrompt: typeof mockGetPrompt;

    constructor(params: any) {
      constructorCalls.push(params);
      this.getPrompt = mockGetPrompt;
    }
  }

  const mockGetEnvString = vi.fn((key: string) => {
    switch (key) {
      case 'LANGFUSE_PUBLIC_KEY':
        return 'test-public-key';
      case 'LANGFUSE_SECRET_KEY':
        return 'test-secret-key';
      case 'LANGFUSE_HOST':
        return 'https://test.langfuse.com';
      default:
        return '';
    }
  });

  return {
    mockGetPrompt,
    MockLangfuse,
    constructorCalls,
    mockGetEnvString,
  };
});

// Mock envars module
vi.mock('../../src/envars', () => ({
  getEnvString: mocks.mockGetEnvString,
}));

// Mock langfuse module with the class
vi.mock('langfuse', () => ({
  Langfuse: mocks.MockLangfuse,
}));

describe('langfuse integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the constructor calls array
    mocks.constructorCalls.length = 0;
    // Reset the module to clear the cached langfuse instance
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getPrompt', () => {
    it('should fetch a text prompt by version', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Hello, world!'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 2);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', 2, { type: 'text' });
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

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
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

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('chat-prompt', 1, { type: 'chat' });
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

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('chat-prompt', undefined, {
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

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', 3, { type: 'text' });
      expect(result).toBe('Default text prompt');
    });

    it('should pass empty options object when no label is provided', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Test prompt'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 1);

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', 1, { type: 'text' });
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

    it('should handle label with latest version', async () => {
      const mockPrompt = {
        compile: vi.fn().mockReturnValue('Latest version content'),
      };
      mocks.mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', {}, 'text', undefined, 'latest');

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
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

      expect(mocks.mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
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
