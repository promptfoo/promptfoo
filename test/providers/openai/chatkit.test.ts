import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import {
  cleanAssistantResponse,
  generateChatKitHTML,
  OpenAiChatKitProvider,
} from '../../../src/providers/openai/chatkit';
import { ChatKitBrowserPool } from '../../../src/providers/openai/chatkit-pool';
import * as fetchModule from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

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
          on: vi.fn(), // Console event listener
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockServerRequestHandler = vi.hoisted(() => vi.fn());

// Mock http server
vi.mock('http', () => ({
  createServer: vi.fn((handler: (...args: any[]) => void) => {
    mockServerRequestHandler.mockImplementation(handler);
    return {
      listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
      address: vi.fn().mockReturnValue({ port: 3000 }),
      close: vi.fn(),
      closeAllConnections: vi.fn(),
      once: vi.fn(), // For error event handler
    };
  }),
}));

describe('OpenAiChatKitProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerRequestHandler.mockReset();
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
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
      try {
        const provider = new OpenAiChatKitProvider('wf_test', {});

        const result = await provider.callApi('test prompt');

        expect(result.error).toContain('API key');
      } finally {
        restoreEnv();
      }
    });

    it.each([false, true])(
      'binds delayed session minting to its evaluation scope (shared provider: %s)',
      async (shared) => {
        const pool = ChatKitBrowserPool.getInstance();
        await cliState.withEnv({ OPENAI_API_BASE_URL: 'http://127.0.0.1:9001/v1' }, () =>
          pool.initialize(),
        );
        const acquire = vi
          .spyOn(pool, 'acquirePage')
          .mockRejectedValue(new Error('stop after registration'));
        const registrations = vi.spyOn(pool, 'registerTemplate');
        const fetchSpy = vi
          .spyOn(fetchModule, 'fetchWithRetries')
          .mockImplementation(
            async () => new Response(JSON.stringify({ client_secret: 'fixture-session' })),
          );
        const first = new OpenAiChatKitProvider('wf_shared', { config: { apiKey: 'fixture-key' } });
        const second = shared
          ? first
          : new OpenAiChatKitProvider('wf_shared', { config: { apiKey: 'fixture-key' } });
        const scopes = [
          { OPENAI_API_BASE_URL: 'http://127.0.0.1:9001/v1' },
          { OPENAI_API_BASE_URL: 'http://127.0.0.1:9002/v1' },
        ];
        try {
          await Promise.all([
            cliState.withEnv(scopes[0], () => first.callApi('first')),
            cliState.withEnv(scopes[1], () => second.callApi('second')),
          ]);
          await cliState.withEnv(scopes[0], () => first.callApi('repeat'));
          const keys = registrations.mock.results.map(({ value }) => value);
          expect(keys[0]).not.toBe(keys[1]);
          expect(keys[0]).toBe(keys[2]);
          const responses = keys.slice(0, 2).map((key) => {
            const response = Object.assign(new EventEmitter(), {
              writeHead: vi.fn(),
              end: vi.fn(),
            });
            mockServerRequestHandler(
              {
                method: 'POST',
                headers: { host: '127.0.0.1:3000' },
                url: `/template/${encodeURIComponent(key)}/session`,
              },
              response,
            );
            return response;
          });
          await vi.waitFor(() =>
            expect(responses.every((response) => response.end.mock.calls.length === 1)).toBe(true),
          );
          expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(
            scopes.map((env) => `${env.OPENAI_API_BASE_URL}/chatkit/sessions`),
          );
          for (const [, init] of fetchSpy.mock.calls) {
            expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-key');
          }
        } finally {
          acquire.mockRestore();
          registrations.mockRestore();
          fetchSpy.mockRestore();
          await pool.shutdown();
          ChatKitBrowserPool.resetInstance();
        }
      },
    );

    it('should keep pooled session factories isolated by provider instance', async () => {
      const pool = ChatKitBrowserPool.getInstance();
      const registrations = vi.spyOn(pool, 'registerTemplate');
      const acquire = vi
        .spyOn(pool, 'acquirePage')
        .mockRejectedValue(new Error('stop after registration'));
      const sharedConfig = {
        usePool: true,
        workflowId: 'wf_shared',
        userId: 'shared-user',
      };
      const firstProvider = new OpenAiChatKitProvider('wf_shared', {
        config: { ...sharedConfig, apiKey: 'first-key' },
      });
      const secondProvider = new OpenAiChatKitProvider('wf_shared', {
        config: { ...sharedConfig, apiKey: 'second-key' },
      });

      try {
        await Promise.all([
          firstProvider.callApi('first prompt'),
          secondProvider.callApi('second prompt'),
        ]);
        await firstProvider.callApi('third prompt');

        const [firstKey, secondKey, repeatedFirstKey] = registrations.mock.results.map(
          ({ value }) => value,
        );
        expect(firstKey).toBe(repeatedFirstKey);
        expect(firstKey).not.toBe(secondKey);
        expect(pool.getStats().templates).toBe(2);
        await pool.shutdown();
        expect(pool.getStats().templates).toBe(0);
        await firstProvider.callApi('after shutdown');
        expect(registrations.mock.results[3].value).not.toBe(firstKey);
        expect(firstKey).not.toContain('first-key');
        expect(secondKey).not.toContain('second-key');
      } finally {
        acquire.mockRestore();
        registrations.mockRestore();
        await pool.shutdown();
        ChatKitBrowserPool.resetInstance();
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
    it('keeps session minting behind the local provider endpoint', () => {
      const html = generateChatKitHTML('/api/chatkit/session');

      expect(html).toContain("fetch('/api/chatkit/session'");
      expect(html).not.toContain('Authorization');
      expect(html).not.toContain('https://api.openai.com/v1/chatkit/sessions');
    });

    it('should include responding state tracking in window.__state', () => {
      const html = generateChatKitHTML('/api/chatkit/session');

      // Verify the responding state is included
      expect(html).toContain('responding: false');
      expect(html).toContain('window.__state.responding = true');
      expect(html).toContain('window.__state.responding = false');
    });

    it('should have chatkit.response.start event listener', () => {
      const html = generateChatKitHTML('/api/chatkit/session');

      // Verify the response.start listener is included for multi-step workflow tracking
      expect(html).toContain("chatkit.addEventListener('chatkit.response.start'");
    });

    it('should have chatkit.response.end event listener', () => {
      const html = generateChatKitHTML('/api/chatkit/session');

      // Verify the response.end listener is included
      expect(html).toContain("chatkit.addEventListener('chatkit.response.end'");
    });
  });

  describe('session route', () => {
    it.each([undefined, 'false', 'true'])(
      'verifies TLS unless explicitly disabled: %s',
      async (insecure) => {
        const restore = mockProcessEnv({ PROMPTFOO_INSECURE_SSL: insecure });
        const fetchSpy = vi
          .spyOn(fetchModule, 'fetchWithRetries')
          .mockResolvedValue(new Response(JSON.stringify({ client_secret: 'fixture-session' })));
        const provider = new OpenAiChatKitProvider('wf_fixture', {
          config: { apiKey: 'fixture-key' },
        });
        try {
          await (provider as any).createChatKitClientSecret();
          expect(fetchSpy.mock.calls[0][1]?.rejectUnauthorized).toBe(insecure !== 'true');
        } finally {
          fetchSpy.mockRestore();
          restore();
        }
      },
    );

    it('uses provider configuration and keeps sessions out of the response cache', async () => {
      const fetchSpy = vi.spyOn(fetchModule, 'fetchWithRetries').mockImplementation(
        async () =>
          new Response(JSON.stringify({ client_secret: 'session-fixture' }), {
            headers: { 'content-type': 'application/json' },
          }),
      );
      const provider = new OpenAiChatKitProvider('wf_fixture', {
        config: {
          apiKey: 'account-fixture',
          apiBaseUrl: 'https://gateway.example/v1?route=a%2Fb&route=c',
          organization: 'fixture-org',
          headers: { authorization: 'Bearer custom-fixture', 'x-route': 'fixture' },
          version: '2',
          userId: 'fixture-user',
        },
      });
      try {
        await expect((provider as any).createChatKitClientSecret()).resolves.toBe(
          'session-fixture',
        );
        await expect((provider as any).createChatKitClientSecret()).resolves.toBe(
          'session-fixture',
        );
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [url, request, timeout, retries] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://gateway.example/v1/chatkit/sessions?route=a%2Fb&route=c');
        const headers = new Headers(request?.headers);
        expect(headers.get('authorization')).toBe('Bearer custom-fixture');
        expect(headers.get('openai-organization')).toBe('fixture-org');
        expect(headers.get('openai-beta')).toBe('chatkit_beta=v1');
        expect(headers.get('x-route')).toBe('fixture');
        expect(JSON.parse(request?.body as string)).toEqual({
          workflow: { id: 'wf_fixture', version: '2' },
          user: 'fixture-user',
        });
        expect(timeout).toBeGreaterThan(0);
        expect(retries).toBe(0);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it.each([
      {
        response: () => new Response('{}', { status: 500 }),
        error: 'ChatKit session request failed: 500',
      },
      { response: () => new Response('{}'), error: 'did not include a client secret' },
    ])('rejects unusable session responses: $error', async ({ response, error }) => {
      const fetchSpy = vi
        .spyOn(fetchModule, 'fetchWithRetries')
        .mockImplementation(async () => response());
      const provider = new OpenAiChatKitProvider('wf_fixture', {
        config: { apiKey: 'account-fixture' },
      });
      try {
        await expect((provider as any).createChatKitClientSecret()).rejects.toThrow(error);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('adds Promptfoo request headers when minting a client secret', async () => {
      const fetchSpy = vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(
        new Response(JSON.stringify({ client_secret: 'secret-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });

      try {
        const secret = await (provider as any).createChatKitClientSecret();

        expect(secret).toBe('secret-123');
        const [, requestInit] = fetchSpy.mock.calls[0];
        expect(new Headers(requestInit?.headers).get('x-openai-originator')).toBe('promptfoo');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it.each(['disconnect', 'cleanup'])(
      'cancels pending standalone session minting on %s',
      async (reason) => {
        const provider = new OpenAiChatKitProvider('wf_test123', {
          config: { apiKey: 'fixture-key' },
        });
        let signal: AbortSignal | undefined;
        const fetchSpy = vi.spyOn(fetchModule, 'fetchWithRetries').mockImplementation(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              signal = options?.signal as AbortSignal;
              signal.addEventListener('abort', () => reject(signal!.reason), { once: true });
            }),
        );
        const response = Object.assign(new EventEmitter(), { writeHead: vi.fn(), end: vi.fn() });
        try {
          await (provider as any).initialize();
          (provider as any).server.closeAllConnections.mockImplementation(() =>
            response.emit('close'),
          );
          mockServerRequestHandler(
            { method: 'POST', url: '/api/chatkit/session', headers: { host: '127.0.0.1:3000' } },
            response,
          );
          expect(signal?.aborted).toBe(false);
          if (reason === 'cleanup') {
            await provider.cleanup();
          } else {
            response.emit('close');
          }
          await vi.waitFor(() => expect(response.listenerCount('close')).toBe(0));
          expect(signal?.aborted).toBe(true);
          expect(response.writeHead).not.toHaveBeenCalled();
          expect(response.end).not.toHaveBeenCalled();
        } finally {
          fetchSpy.mockRestore();
          await provider.cleanup();
        }
      },
    );

    it('returns client secrets through the local provider route', async () => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });
      vi.spyOn(provider as any, 'createChatKitClientSecret').mockResolvedValue('secret-123');

      await (provider as any).initialize();

      const writeHead = vi.fn();
      const end = vi.fn();

      mockServerRequestHandler(
        {
          method: 'POST',
          url: '/api/chatkit/session',
          headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
        },
        Object.assign(new EventEmitter(), {
          writeHead,
          end,
        }),
      );

      await Promise.resolve();
      await Promise.resolve();

      expect(writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      expect(end).toHaveBeenCalledWith(JSON.stringify({ client_secret: 'secret-123' }));
    });

    it.each([
      ['GET', '/api/chatkit/session'],
      ['POST', '/'],
      ['GET', '/missing'],
    ])('returns 404 for %s %s without minting a session', async (method, url) => {
      const provider = new OpenAiChatKitProvider('wf_test123', {
        config: { apiKey: 'test-key' },
      });
      const mint = vi.spyOn(provider as any, 'createChatKitClientSecret');
      await (provider as any).initialize();
      const response = { writeHead: vi.fn(), end: vi.fn() };

      mockServerRequestHandler({ method, url, headers: { host: '127.0.0.1:3000' } }, response);

      expect(response.writeHead).toHaveBeenCalledWith(404);
      expect(mint).not.toHaveBeenCalled();
    });
  });

  describe('configuration validation', () => {
    it('rejects an invalid workflowId before starting the browser', async () => {
      const provider = new OpenAiChatKitProvider('invalid-workflow', {
        config: { apiKey: 'test-key' },
      });

      await expect((provider as any).initialize()).rejects.toThrow('Invalid workflowId format');
    });

    it('should accept valid workflowId format', () => {
      const provider = new OpenAiChatKitProvider('wf_abc123XYZ', {
        config: { apiKey: 'test-key' },
      });

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
      const provider1 = new OpenAiChatKitProvider('wf_test1', {
        config: { apiKey: 'test-key' },
      });

      const provider2 = new OpenAiChatKitProvider('wf_test2', {
        config: { apiKey: 'test-key' },
      });

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
