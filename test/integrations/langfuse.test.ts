jest.mock('../../src/envars');
jest.mock('langfuse');

describe('langfuse integration', () => {
  let mockLangfuse: any;
  let mockGetPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock getEnvString before importing modules
    jest.doMock('../../src/envars', () => ({
      getEnvString: jest.fn((key: string) => {
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
      }),
    }));

    // Create mock for langfuse module
    mockGetPrompt = jest.fn();
    mockLangfuse = {
      getPrompt: mockGetPrompt,
    };

    jest.doMock('langfuse', () => ({
      Langfuse: jest.fn().mockImplementation(() => mockLangfuse),
    }));
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  describe('getPrompt', () => {
    it('should fetch a text prompt by version', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Hello, world!'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 2);

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', 2, { type: 'text' });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe('Hello, world!');
    });

    it('should fetch a text prompt by label', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Hello from production!'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt(
        'test-prompt',
        { name: 'test' },
        'text',
        undefined,
        'production',
      );

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
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
        compile: jest.fn().mockReturnValue(mockChatMessages),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('chat-prompt', { name: 'test' }, 'chat', 1);

      expect(mockGetPrompt).toHaveBeenCalledWith('chat-prompt', 1, { type: 'chat' });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe(JSON.stringify(mockChatMessages));
    });

    it('should fetch a chat prompt by label', async () => {
      const mockChatMessages = [
        { role: 'system', content: 'You are a production assistant' },
        { role: 'user', content: 'Hello from production' },
      ];
      const mockPrompt = {
        compile: jest.fn().mockReturnValue(mockChatMessages),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('chat-prompt', { name: 'test' }, 'chat', undefined, 'latest');

      expect(mockGetPrompt).toHaveBeenCalledWith('chat-prompt', undefined, {
        label: 'latest',
        type: 'chat',
      });
      expect(mockPrompt.compile).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toBe(JSON.stringify(mockChatMessages));
    });

    it('should handle prompt with no type specified (defaults to text)', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Default text prompt'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, undefined, 3);

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', 3, { type: 'text' });
      expect(result).toBe('Default text prompt');
    });

    it('should pass empty options object when no label is provided', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Test prompt'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 1);

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', 1, { type: 'text' });
      expect(result).toBe('Test prompt');
    });

    it('should handle non-string compiled prompt results', async () => {
      const mockCompiledResult = { structured: 'data', nested: { value: 123 } };
      const mockPrompt = {
        compile: jest.fn().mockReturnValue(mockCompiledResult),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', { name: 'test' }, 'text', 1);

      expect(result).toBe(JSON.stringify(mockCompiledResult));
    });

    it('should handle prompt compilation with multiple variables', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Hello John, you are 30 years old'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const vars = { name: 'John', age: 30, city: 'New York' };
      const result = await getPrompt('test-prompt', vars, 'text', 1);

      expect(mockPrompt.compile).toHaveBeenCalledWith(vars);
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should handle errors from Langfuse API', async () => {
      mockGetPrompt.mockRejectedValue(new Error('API Error: Prompt not found'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('non-existent', {}, 'text', 1)).rejects.toThrow(
        'Failed to fetch Langfuse prompt "non-existent" version 1: API Error: Prompt not found',
      );
    });

    it('should provide context in error messages for label-based fetching', async () => {
      mockGetPrompt.mockRejectedValue(new Error('Label not found'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(
        getPrompt('test-prompt', {}, 'text', undefined, 'non-existent-label'),
      ).rejects.toThrow(
        'Failed to fetch Langfuse prompt "test-prompt" with label "non-existent-label": Label not found',
      );
    });

    it('should provide context in error messages for prompts without version or label', async () => {
      mockGetPrompt.mockRejectedValue(new Error('Network error'));

      const { getPrompt } = await import('../../src/integrations/langfuse');

      await expect(getPrompt('test-prompt', {}, 'text')).rejects.toThrow(
        'Failed to fetch Langfuse prompt "test-prompt": Network error',
      );
    });

    it('should reuse the same Langfuse instance across calls', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Test'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');

      // Make multiple calls
      await getPrompt('test1', {}, 'text', 1);
      await getPrompt('test2', {}, 'text', 2);
      await getPrompt('test3', {}, 'text', 3);

      // Verify Langfuse constructor was called only once
      const { Langfuse } = await import('langfuse');
      expect(Langfuse).toHaveBeenCalledTimes(1);
      expect(Langfuse).toHaveBeenCalledWith({
        publicKey: 'test-public-key',
        secretKey: 'test-secret-key',
        baseUrl: 'https://test.langfuse.com',
      });
    });

    it('should handle label with latest version', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Latest version content'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', {}, 'text', undefined, 'latest');

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
        label: 'latest',
        type: 'text',
      });
      expect(result).toBe('Latest version content');
    });

    it('should handle label with staging environment', async () => {
      const mockPrompt = {
        compile: jest.fn().mockReturnValue('Staging content'),
      };
      mockGetPrompt.mockResolvedValue(mockPrompt);

      const { getPrompt } = await import('../../src/integrations/langfuse');
      const result = await getPrompt('test-prompt', {}, 'text', undefined, 'staging');

      expect(mockGetPrompt).toHaveBeenCalledWith('test-prompt', undefined, {
        label: 'staging',
        type: 'text',
      });
      expect(result).toBe('Staging content');
    });
  });
});
