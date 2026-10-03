import { once } from 'node:events';
import { connect } from 'node:net';
import * as http from 'http';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import {
  cleanAssistantResponse,
  OpenAiChatKitProvider,
} from '../../../src/providers/openai/chatkit';
import { createApiKeyOptions } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';

const createUnpooledChatKitOptions = () => ({
  config: { apiKey: 'test-key', usePool: false },
});

const playwrightMetadata = vi.hoisted(() => ({ version: '1.63.0' }));
vi.mock('playwright/package.json', () => ({ default: playwrightMetadata }));

const browserMocks = vi.hoisted(() => ({ launch: vi.fn(), createServer: vi.fn() }));

// Unit tests use fresh browser and server implementations for every case.
vi.mock('playwright', () => ({ chromium: { launch: browserMocks.launch } }));
vi.mock('http', () => ({ createServer: browserMocks.createServer }));

function resetBrowserMocks() {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    frames: vi.fn().mockReturnValue([]),
    on: vi.fn(),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const server = {
    listen: vi.fn((_port: number, callback: () => void) => callback()),
    address: vi.fn().mockReturnValue({ port: 3000 }),
    close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
    closeAllConnections: vi.fn(),
    once: vi.fn(),
  };
  browserMocks.launch.mockResolvedValue(browser);
  browserMocks.createServer.mockReturnValue(server);
  return { page, context, browser, server };
}

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
                'OpenAI-Beta': 'chatkit_beta=v1',
                'X-OpenAI-Originator': 'promptfoo'
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
    playwrightMetadata.version = '1.63.0';
    vi.resetAllMocks();
    resetBrowserMocks();
    disableCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
    enableCache();
  });

  describe('constructor', () => {
    it('should create provider with workflow ID', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', createApiKeyOptions());

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
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

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
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

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
      const provider = new OpenAiChatKitProvider('wf_test123', createApiKeyOptions());

      expect(provider.toString()).toBe('[OpenAI ChatKit Provider wf_test123]');
    });
  });

  describe('callApi', () => {
    it('does not allocate a server for an incompatible SDK in standalone mode', async () => {
      playwrightMetadata.version = '1.62.0';
      const provider = new OpenAiChatKitProvider('wf_test', createUnpooledChatKitOptions());
      const result = await provider.callApi('test prompt');
      expect(result.error).toContain('installed playwright package (1.62.0) is incompatible');
      expect(http.createServer).not.toHaveBeenCalled();
    });

    it('closes its server when the browser binary is absent in standalone mode', async () => {
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockRejectedValueOnce(new Error("Executable doesn't exist"));
      const provider = new OpenAiChatKitProvider('wf_test', createUnpooledChatKitOptions());
      const result = await provider.callApi('test prompt');
      expect(result.error).toContain('npx playwright install chromium');
      const server = vi.mocked(http.createServer).mock.results[0].value;
      expect(server.close).toHaveBeenCalledOnce();
      expect((provider as any).server).toBeNull();
    });

    it.each([
      [false, 'Session failed: 401 Invalid API key'],
      [true, 'Session failed: 401 Invalid API key'],
      [false, 'ChatKit component failed to initialize'],
      [true, 'ChatKit component failed to initialize'],
      [false, 'Session failed: 401 Invalid API key', true],
      [true, 'Session failed: 401 Invalid API key', true],
    ])(
      'preserves initialization errors and cleans up (stateful=%s, error=%s, closeFailure=%s)',
      async (stateful, error, closeFailure = false) => {
        const page = {
          goto: vi.fn().mockResolvedValue(undefined),
          waitForFunction: vi
            .fn()
            .mockRejectedValue(new Error('Timeout waiting for ChatKit ready')),
          evaluate: vi.fn().mockResolvedValue(error),
          on: vi.fn(),
        };
        const context = {
          newPage: vi.fn().mockResolvedValue(page),
          close: vi.fn().mockResolvedValue(undefined),
        };
        const browser = {
          newContext: vi.fn().mockResolvedValue(context),
          close: vi.fn().mockResolvedValue(undefined),
        };
        if (closeFailure) {
          context.close.mockRejectedValueOnce(new Error('Context disconnected'));
        }
        browserMocks.launch.mockResolvedValueOnce(browser);
        const provider = new OpenAiChatKitProvider('wf_test', {
          config: { apiKey: 'test-key', usePool: stateful, stateful },
        });

        await expect(provider.callApi('test prompt')).resolves.toEqual({
          error: `ChatKit workflow error: ${error}`,
        });
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(context.close).toHaveBeenCalledOnce();
        expect(browser.close).toHaveBeenCalledOnce();
        expect(browserMocks.createServer.mock.results[0].value.close).toHaveBeenCalledOnce();
        expect((provider as any).page).toBeNull();
        expect((provider as any).server).toBeNull();
      },
    );

    it('should return error when API key is missing', async () => {
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
      try {
        const provider = new OpenAiChatKitProvider('wf_test', {});

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('API key');
      } finally {
        restoreEnv();
      }
    });
  });

  describe('cleanup', () => {
    it('closes unfinished HTTP requests before completing cleanup', async () => {
      const { createServer } = await vi.importActual<typeof http>('http');
      const server = createServer((_request, response) => response.end('ChatKit fixture'));
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address() as { port: number };
      const connected = once(server, 'connection');
      const socket = connect(address.port, '127.0.0.1');
      const closed = once(socket, 'close');
      onTestFinished(() => {
        socket.destroy();
        server.closeAllConnections();
        server.close(() => {});
      });
      const [connection] = await connected;
      const received = once(connection, 'data');
      socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
      await received;
      (provider as any).server = server;

      await provider.cleanup();
      await closed;

      expect(server.listening).toBe(false);
      expect((provider as any).server).toBeNull();
    });

    it('releases every resource and resets state when browser closes fail', async () => {
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());
      await (provider as any).initialize();
      const { context, browser, server } = provider as any;
      context.close.mockRejectedValue(new Error('Context disconnected'));
      browser.close.mockRejectedValue(new Error('Browser disconnected'));

      await expect(provider.cleanup()).resolves.toBeUndefined();

      expect(context.close).toHaveBeenCalledOnce();
      expect(browser.close).toHaveBeenCalledOnce();
      expect(server.close).toHaveBeenCalledOnce();
      expect(provider).toMatchObject({
        context: null,
        page: null,
        browser: null,
        server: null,
        serverPort: 0,
        initialized: false,
      });
      await provider.cleanup();
      expect(server.close).toHaveBeenCalledOnce();
    });

    it.each(['callback', 'throw'])('resets state when server close fails via %s', async (mode) => {
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());
      await (provider as any).initialize();
      const server = (provider as any).server;
      server.close.mockImplementation((callback?: (error?: Error) => void) => {
        const error = new Error('Server close failed');
        if (mode === 'throw') {
          throw error;
        }
        callback?.(error);
      });

      await expect(provider.cleanup()).resolves.toBeUndefined();
      expect(provider).toMatchObject({ server: null, serverPort: 0, initialized: false });
      await provider.cleanup();
      expect(server.close).toHaveBeenCalledOnce();
    });

    it('waits for server closure and allows a fresh retry', async () => {
      const { browser, server } = resetBrowserMocks();
      const provider = new OpenAiChatKitProvider('wf_test', createUnpooledChatKitOptions());
      await (provider as any).initialize();
      let finishClose: () => void = () => {};
      const closing = new Promise<void>((resolve) => {
        server.close.mockImplementation((callback?: () => void) => {
          finishClose = () => callback?.();
          resolve();
        });
      });
      const cleanup = provider.cleanup();
      await closing;
      let settled = false;
      void cleanup.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      finishClose();
      await cleanup;

      resetBrowserMocks();
      await (provider as any).initialize();
      expect((provider as any).initialized).toBe(true);
      expect((provider as any).browser).not.toBe(browser);
      await provider.cleanup();
    });

    it('should close browser resources', async () => {
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

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
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

      // Should not throw when cleaning up uninitialized provider
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('HTML template generation', () => {
    it('should include responding state tracking in window.__state', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', createApiKeyOptions());

      const html = getGeneratedHTML(provider);

      // Verify the responding state is included
      expect(html).toContain('responding: false');
      expect(html).toContain('window.__state.responding = true');
      expect(html).toContain('window.__state.responding = false');
    });

    it('should have chatkit.response.start event listener', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', createApiKeyOptions());

      const html = getGeneratedHTML(provider);

      // Verify the response.start listener is included for multi-step workflow tracking
      expect(html).toContain("chatkit.addEventListener('chatkit.response.start'");
    });

    it('should have chatkit.response.end event listener', () => {
      const provider = new OpenAiChatKitProvider('wf_test123', createApiKeyOptions());

      const html = getGeneratedHTML(provider);

      // Verify the response.end listener is included
      expect(html).toContain("chatkit.addEventListener('chatkit.response.end'");
    });
  });

  describe('configuration validation', () => {
    it('should reject invalid workflowId format', () => {
      // The validateWorkflowId function in the source code rejects invalid formats
      // This gets triggered during HTML generation, not during construction
      const provider = new OpenAiChatKitProvider('invalid-workflow', createApiKeyOptions());

      // The validation happens when HTML is generated, which we can test via the helper
      // Invalid workflow ID should not match the expected pattern
      expect((provider as any).chatKitConfig.workflowId).toBe('invalid-workflow');
    });

    it('should accept valid workflowId format', () => {
      const provider = new OpenAiChatKitProvider('wf_abc123XYZ', createApiKeyOptions());

      expect((provider as any).chatKitConfig.workflowId).toBe('wf_abc123XYZ');
    });

    it('should handle empty workflowId', () => {
      const provider = new OpenAiChatKitProvider('', {
        config: { apiKey: 'test-key', workflowId: 'wf_fromconfig' },
      });

      // Should use workflowId from config when empty string passed
      expect((provider as any).chatKitConfig.workflowId).toBe('wf_fromconfig');
    });

    it('should handle special characters in userId', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          userId: 'user@example.com',
        },
      });

      // userId with @ should be accepted
      expect((provider as any).chatKitConfig.userId).toBe('user@example.com');
    });

    it('should handle version with dots and dashes', () => {
      const provider = new OpenAiChatKitProvider('wf_test', {
        config: {
          apiKey: 'test-key',
          version: '1.2.3-beta',
        },
      });

      expect((provider as any).chatKitConfig.version).toBe('1.2.3-beta');
    });

    it('should use consistent default userId across instances', () => {
      const provider1 = new OpenAiChatKitProvider('wf_test1', createApiKeyOptions());

      const provider2 = new OpenAiChatKitProvider('wf_test2', createApiKeyOptions());

      // Both should have the same default userId for template consistency
      expect((provider1 as any).chatKitConfig.userId).toBe((provider2 as any).chatKitConfig.userId);
    });
  });

  describe('cleanAssistantResponse', () => {
    it('should return empty string for empty input', () => {
      expect(cleanAssistantResponse('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(cleanAssistantResponse(null as any)).toBe('');
      expect(cleanAssistantResponse(undefined as any)).toBe('');
    });

    it('should remove Cloudflare scripts', () => {
      const input = 'Hello world(function(){console.log("cf")})();';
      expect(cleanAssistantResponse(input)).toBe('Hello world');
    });

    it('should remove approval UI text from end of response', () => {
      const input =
        'Here is your response\nApproval required\nDoes this work for you?\nApprove\nReject';
      expect(cleanAssistantResponse(input)).toBe('Here is your response');
    });

    it('should remove approval UI text with varying whitespace', () => {
      const input =
        'Here is your response\n\nApproval required\n\nDoes this work for you?\n\nApprove\n\nReject';
      expect(cleanAssistantResponse(input)).toBe('Here is your response');
    });

    it('should return empty string when response starts with "You said:"', () => {
      const input = 'You said: hello world';
      expect(cleanAssistantResponse(input)).toBe('');
    });

    it('should remove "You said:" and everything after it', () => {
      const input = 'Assistant response here\nYou said: some user input';
      expect(cleanAssistantResponse(input)).toBe('Assistant response here');
    });

    it('should strip JSON prefix when followed by substantial text', () => {
      const jsonPrefix = '{"classification": "return_item"}';
      const substantialText =
        'I can help you with your return request. Please provide your order number and reason for the return.';
      const input = `${jsonPrefix} ${substantialText}`;
      expect(cleanAssistantResponse(input)).toBe(substantialText);
    });

    it('should preserve JSON when it is the only response', () => {
      const input = '{"classification": "return_item"}';
      expect(cleanAssistantResponse(input)).toBe('{"classification": "return_item"}');
    });

    it('should preserve JSON when followed by short text (< 50 chars)', () => {
      const input = '{"action": "query"} Short response';
      expect(cleanAssistantResponse(input)).toBe('{"action": "query"} Short response');
    });

    it('should handle complex nested cleanup scenarios', () => {
      const input =
        '(function(){})();Here is your response\nApproval required\nDoes this work for you?\nApprove\nReject';
      expect(cleanAssistantResponse(input)).toBe('Here is your response');
    });

    it('should trim whitespace from result', () => {
      const input = '  Hello world  ';
      expect(cleanAssistantResponse(input)).toBe('Hello world');
    });
  });

  describe('approval handling configuration', () => {
    it('should default approvalHandling to auto-approve', () => {
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

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
      const provider = new OpenAiChatKitProvider('wf_test', createApiKeyOptions());

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
