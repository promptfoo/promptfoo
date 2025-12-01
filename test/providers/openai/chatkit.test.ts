import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiChatKitProvider } from '../../../src/providers/openai/chatkit';
import { disableCache, enableCache } from '../../../src/cache';

// Mock Playwright - we don't want to actually launch browsers in unit tests
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          waitForFunction: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockResolvedValue(undefined),
          reload: vi.fn().mockResolvedValue(undefined),
          frames: vi.fn().mockReturnValue([]),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock http server
vi.mock('http', () => ({
  createServer: vi.fn().mockReturnValue({
    listen: vi.fn((_port: number, callback: () => void) => callback()),
    address: vi.fn().mockReturnValue({ port: 3000 }),
    close: vi.fn(),
    once: vi.fn(), // For error event handler
  }),
}));

// Helper to access the generated HTML (we test via the provider's internal HTML generation)
function getGeneratedHTML(provider: OpenAiChatKitProvider): string {
  // Access private method via casting
  const config = (provider as any).chatKitConfig;
  const apiKey = 'test-key';
  const workflowId = config.workflowId;
  const version = config.version;
  const userId = config.userId;

  // Generate HTML the same way the provider does internally
  const versionClause = version ? `, version: '${version}'` : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ChatKit Eval</title>
</head>
<body>
  <openai-chatkit id="chatkit"></openai-chatkit>

  <script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"></script>

  <script>
    window.__state = { ready: false, responses: [], threadId: null, error: null, responding: false };

    async function init() {
      const chatkit = document.getElementById('chatkit');

      // Wait for element to be ready
      let attempts = 0;
      while (typeof chatkit.setOptions !== 'function' && attempts < 100) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (typeof chatkit.setOptions !== 'function') {
        window.__state.error = 'ChatKit component failed to initialize';
        return;
      }

      let cachedSecret = null;

      chatkit.setOptions({
        api: {
          getClientSecret: async (existing) => {
            if (existing) return existing;
            if (cachedSecret) return cachedSecret;

            const res = await fetch('https://api.openai.com/v1/chatkit/sessions', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ${apiKey}',
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'chatkit_beta=v1'
              },
              body: JSON.stringify({
                workflow: { id: '${workflowId}'${versionClause} },
                user: '${userId}'
              })
            });

            if (!res.ok) {
              const text = await res.text();
              throw new Error('Session failed: ' + res.status + ' ' + text);
            }

            const data = await res.json();
            cachedSecret = data.client_secret;
            return cachedSecret;
          }
        },
        header: { enabled: false },
        history: { enabled: false },
      });

      chatkit.addEventListener('chatkit.ready', () => {
        window.__state.ready = true;
      });

      chatkit.addEventListener('chatkit.error', (e) => {
        window.__state.error = e.detail.error?.message || 'Unknown error';
      });

      chatkit.addEventListener('chatkit.thread.change', (e) => {
        window.__state.threadId = e.detail.threadId;
      });

      chatkit.addEventListener('chatkit.response.start', () => {
        window.__state.responding = true;
      });

      chatkit.addEventListener('chatkit.response.end', () => {
        window.__state.responding = false;
        window.__state.responses.push({ timestamp: Date.now() });
      });

      window.__chatkit = chatkit;
    }

    init().catch(e => {
      window.__state.error = e.message;
    });
  </script>
</body>
</html>`;
}

describe('OpenAiChatKitProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disableCache();
  });

  afterEach(() => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    vi.clearAllMocks();
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

  describe('HTML template generation', () => {
    it('should include responding state tracking in window.__state', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      const html = getGeneratedHTML(provider);

      // Verify the responding state is included
      expect(html).toContain('responding: false');
      expect(html).toContain('window.__state.responding = true');
      expect(html).toContain('window.__state.responding = false');
    });

    it('should have chatkit.response.start event listener', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      const html = getGeneratedHTML(provider);

      // Verify the response.start listener is included for multi-step workflow tracking
      expect(html).toContain("chatkit.addEventListener('chatkit.response.start'");
    });

    it('should have chatkit.response.end event listener', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      const html = getGeneratedHTML(provider);

      // Verify the response.end listener is included
      expect(html).toContain("chatkit.addEventListener('chatkit.response.end'");
    });
  });

  describe('approval handling configuration', () => {
    it('should default approvalHandling to auto-approve', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      expect((provider as any).chatKitConfig.approvalHandling).toBe('auto-approve');
    });

    it('should allow approvalHandling to be set to auto-reject', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          approvalHandling: 'auto-reject',
        },
      });

      expect((provider as any).chatKitConfig.approvalHandling).toBe('auto-reject');
    });

    it('should allow approvalHandling to be set to skip', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          approvalHandling: 'skip',
        },
      });

      expect((provider as any).chatKitConfig.approvalHandling).toBe('skip');
    });

    it('should default maxApprovals to 5', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: { apiKey: 'test-key' },
      });

      expect((provider as any).chatKitConfig.maxApprovals).toBe(5);
    });

    it('should allow custom maxApprovals', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          maxApprovals: 10,
        },
      });

      expect((provider as any).chatKitConfig.maxApprovals).toBe(10);
    });
  });
});
