import { OpenAiChatKitProvider } from '../../../src/providers/openai/chatkit';
import { disableCache, enableCache } from '../../../src/cache';

// Mock Playwright - we don't want to actually launch browsers in unit tests
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(undefined),
          waitForFunction: jest.fn().mockResolvedValue(undefined),
          waitForTimeout: jest.fn().mockResolvedValue(undefined),
          evaluate: jest.fn().mockResolvedValue(undefined),
          reload: jest.fn().mockResolvedValue(undefined),
          frames: jest.fn().mockReturnValue([]),
        }),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock http server
jest.mock('http', () => ({
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn((_port: number, callback: () => void) => callback()),
    address: jest.fn().mockReturnValue({ port: 3000 }),
    close: jest.fn(),
    once: jest.fn(), // For error event handler
  }),
}));

describe('OpenAiChatKitProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disableCache();
  });

  afterEach(() => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    jest.clearAllMocks();
    enableCache();
  });

  describe('constructor', () => {
    it('should create provider with workflow ID', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.id()).toBe('openai:chatkit:wf_test123');
    });

    it('should use workflowId from config if provided', () => {
      const provider = new OpenAiChatKitProvider('default', {
        config: {
          apiKey: 'test-key',
          workflowId: 'wf_custom',
        },
      });

      expect(provider.id()).toBe('openai:chatkit:wf_custom');
    });

    it('should include version in id() when provided', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: {
          apiKey: 'test-key',
          version: '3',
        },
      });

      expect(provider.id()).toBe('openai:chatkit:wf_test123:3');
    });

    it('should use default timeout of 120000ms', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      // Access private config via any
      expect((provider as any).chatKitConfig.timeout).toBe(120000);
    });

    it('should use custom timeout when provided', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          timeout: 60000,
        },
      });

      expect((provider as any).chatKitConfig.timeout).toBe(60000);
    });

    it('should default headless to true', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      expect((provider as any).chatKitConfig.headless).toBe(true);
    });

    it('should allow headless to be set to false', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          headless: false,
        },
      });

      expect((provider as any).chatKitConfig.headless).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return descriptive string', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.toString()).toBe('[OpenAI ChatKit Provider wf_test123]');
    });
  });

  describe('callApi', () => {
    it('should return error when API key is missing', async () => {
      // Clear environment
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiChatKitProvider('wf_test', {});

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('API key');
      } finally {
        // Restore environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });
  });

  describe('cleanup', () => {
    it('should close browser resources', async () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      // Initialize first (will use mocked playwright)
      await (provider as any).initialize();

      // Then cleanup
      await provider.cleanup();

      // Verify state is reset
      expect((provider as any).browser).toBeNull();
      expect((provider as any).context).toBeNull();
      expect((provider as any).page).toBeNull();
      expect((provider as any).server).toBeNull();
      expect((provider as any).initialized).toBe(false);
    });

    it('should handle cleanup when not initialized', async () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      // Should not throw when cleaning up uninitialized provider
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
  });
});
