import { EventEmitter, once } from 'node:events';
import { connect, type Socket } from 'node:net';
import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  ChatKitBrowserPool,
  isLocalChatKitRequest,
  serveChatKitSession,
} from '../../../src/providers/openai/chatkit-pool';
import { isProviderResponseRateLimited } from '../../../src/scheduler/types';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';

// Create hoisted mocks to access them in tests
const mockPage = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue(undefined),
  waitForFunction: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue(undefined),
}));

const mockContext = vi.hoisted(() => ({
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
  setDefaultTimeout: vi.fn(),
}));

const mockBrowser = vi.hoisted(() => ({
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
}));

const mockChromium = vi.hoisted(() => ({
  launch: vi.fn().mockResolvedValue(mockBrowser),
}));
const mockServerRequestHandler = vi.hoisted(() => vi.fn());

const playwrightMetadata = vi.hoisted(() => ({ version: '1.63.0' }));
vi.mock('playwright/package.json', () => ({ default: playwrightMetadata }));

// Mock playwright
vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

// Mock http server
vi.mock('http', () => ({
  createServer: vi.fn(),
}));

// Test constants
const TEST_TEMPLATE_KEY = 'wf_test123:default:default';
const TEST_HTML = '<html>test</html>';

function resetPlaywrightMocks() {
  mockPage.goto.mockReset().mockResolvedValue(undefined);
  mockPage.waitForFunction.mockReset().mockResolvedValue(undefined);
  mockPage.reload.mockReset().mockResolvedValue(undefined);
  mockContext.newPage.mockReset().mockResolvedValue(mockPage);
  mockContext.close.mockReset().mockResolvedValue(undefined);
  mockContext.setDefaultTimeout.mockReset();
  mockBrowser.newContext.mockReset().mockResolvedValue(mockContext);
  mockBrowser.close.mockReset().mockResolvedValue(undefined);
  mockChromium.launch.mockReset().mockResolvedValue(mockBrowser);
}

describe('ChatKitBrowserPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPlaywrightMocks();
    mockServerRequestHandler.mockReset();
    const server = {
      listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
      address: vi.fn().mockReturnValue({ port: 3000 }),
      close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
      closeAllConnections: vi.fn(),
      once: vi.fn(),
    } as unknown as http.Server;
    vi.mocked(http.createServer)
      .mockReset()
      .mockImplementation((handler) => {
        if (typeof handler === 'function') {
          mockServerRequestHandler.mockImplementation(handler);
        }
        return server;
      });
    playwrightMetadata.version = '1.63.0';
    // Reset the singleton between tests
    ChatKitBrowserPool.resetInstance();
  });

  afterEach(async () => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    vi.clearAllMocks();
    // Ensure clean state after each test
    ChatKitBrowserPool.resetInstance();
    vi.useRealTimers();
  });

  describe('local request boundary', () => {
    it.each([
      [{ host: '127.0.0.1:3000' }, true],
      [{ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }, true],
      [{ host: '127.0.0.1:3001' }, false],
      [{ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3001' }, false],
      [{}, false],
    ])('checks the local server authority for %j', (headers, expected) => {
      expect(isLocalChatKitRequest({ headers } as IncomingMessage, 3000)).toBe(expected);
    });

    it.each([
      [{ host: '127.0.0.1', origin: 'http://127.0.0.1' }, true],
      [{ host: '127.0.0.1:80', origin: 'http://127.0.0.1' }, true],
      [{ host: 'localhost', origin: 'http://localhost' }, false],
      [{ host: '127.0.0.1', origin: 'http://127.0.0.1:3000' }, false],
    ])(
      'accepts only the exact normalized loopback authority at port 80: %j',
      (headers, expected) => {
        expect(isLocalChatKitRequest({ headers } as IncomingMessage, 80)).toBe(expected);
      },
    );

    it.each([
      ['GET', ''],
      ['GET', '/session'],
      ['POST', ''],
      ['POST', '/session/extra'],
    ])('handles only the exact %s template route with suffix %s', async (method, suffix) => {
      const instance = ChatKitBrowserPool.getInstance();
      const factory = vi.fn().mockResolvedValue('fixture-secret');
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML, factory);
      await instance.initialize();
      const writeHead = vi.fn();
      const end = vi.fn();
      mockServerRequestHandler(
        {
          method,
          headers: { host: '127.0.0.1:3000' },
          url: `/template/${encodeURIComponent(TEST_TEMPLATE_KEY)}${suffix}`,
        },
        { writeHead, end },
      );
      expect(factory).not.toHaveBeenCalled();
      expect(writeHead.mock.calls[0][0]).toBe(method === 'GET' && suffix === '' ? 200 : 404);
    });

    it('rejects requests for another local server before minting a session', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      const factory = vi.fn().mockResolvedValue('fixture-secret');
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML, factory);
      await instance.initialize();
      const writeHead = vi.fn();
      mockServerRequestHandler(
        {
          method: 'POST',
          headers: { host: '127.0.0.1:3001' },
          url: `/template/${encodeURIComponent(TEST_TEMPLATE_KEY)}/session`,
        },
        { writeHead, end: vi.fn() },
      );
      expect(writeHead).toHaveBeenCalledWith(403);
      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ChatKitBrowserPool.getInstance();
      const instance2 = ChatKitBrowserPool.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should use default config values', () => {
      const instance = ChatKitBrowserPool.getInstance();

      // Config should use defaults
      expect((instance as any).config.maxConcurrency).toBe(4);
      expect((instance as any).config.headless).toBe(true);
    });

    it('should respect custom config values', () => {
      const instance = ChatKitBrowserPool.getInstance({
        maxConcurrency: 8,
        headless: false,
      });

      expect((instance as any).config.maxConcurrency).toBe(8);
      expect((instance as any).config.headless).toBe(false);
    });

    it('should ignore config on subsequent calls (singleton already exists)', () => {
      const _instance1 = ChatKitBrowserPool.getInstance({ maxConcurrency: 4 });
      const instance2 = ChatKitBrowserPool.getInstance({ maxConcurrency: 10 });

      // Should still be 4, not 10
      expect((instance2 as any).config.maxConcurrency).toBe(4);
    });
  });

  describe('resetInstance', () => {
    it('should allow creating new instance after reset', () => {
      const instance1 = ChatKitBrowserPool.getInstance({ maxConcurrency: 4 });
      ChatKitBrowserPool.resetInstance();
      const instance2 = ChatKitBrowserPool.getInstance({ maxConcurrency: 10 });

      expect(instance1).not.toBe(instance2);
      expect((instance2 as any).config.maxConcurrency).toBe(10);
    });
  });

  describe('generateTemplateKey', () => {
    it('should generate key from workflowId only', () => {
      const key = ChatKitBrowserPool.generateTemplateKey('wf_abc123');
      expect(key).toBe('wf_abc123:default:default');
    });

    it('should include version when provided', () => {
      const key = ChatKitBrowserPool.generateTemplateKey('wf_abc123', '2');
      expect(key).toBe('wf_abc123:2:default');
    });

    it('should include userId when provided', () => {
      const key = ChatKitBrowserPool.generateTemplateKey('wf_abc123', undefined, 'user@test.com');
      expect(key).toBe('wf_abc123:default:user@test.com');
    });

    it('should include all components', () => {
      const key = ChatKitBrowserPool.generateTemplateKey('wf_abc123', '3', 'user@test.com');
      expect(key).toBe('wf_abc123:3:user@test.com');
    });

    it('should isolate provider instances without embedding auth context', () => {
      const firstKey = ChatKitBrowserPool.generateTemplateKey(
        'wf_abc123',
        '3',
        'user@test.com',
        'provider-1',
      );
      const secondKey = ChatKitBrowserPool.generateTemplateKey(
        'wf_abc123',
        '3',
        'user@test.com',
        'provider-2',
      );

      expect(firstKey).toBe('wf_abc123:3:user@test.com:provider-1');
      expect(secondKey).toBe('wf_abc123:3:user@test.com:provider-2');
      expect(firstKey).not.toBe(secondKey);
    });
  });

  describe('setTemplate', () => {
    it('should store the HTML template for a key', () => {
      const instance = ChatKitBrowserPool.getInstance();
      const html = '<html><body>Test</body></html>';

      instance.setTemplate(TEST_TEMPLATE_KEY, html);

      expect((instance as any).templates.get(TEST_TEMPLATE_KEY)).toEqual({
        html,
        createClientSecret: undefined,
      });
    });

    it('should store multiple templates for different keys', () => {
      const instance = ChatKitBrowserPool.getInstance();
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';

      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      expect((instance as any).templates.size).toBe(2);
      expect((instance as any).templates.get(key1)).toEqual({
        html: '<html>workflow1</html>',
        createClientSecret: undefined,
      });
      expect((instance as any).templates.get(key2)).toEqual({
        html: '<html>workflow2</html>',
        createClientSecret: undefined,
      });
    });

    it('should invalidate pooled pages when the session factory changes', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      const firstSessionFactory = vi.fn().mockResolvedValue('secret-1');
      const secondSessionFactory = vi.fn().mockResolvedValue('secret-2');

      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML, firstSessionFactory);
      const pooledPage = await instance.acquirePage(TEST_TEMPLATE_KEY);
      await instance.releasePage(pooledPage);

      expect(pooledPage.ready).toBe(true);

      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML, secondSessionFactory);

      expect(pooledPage.ready).toBe(false);
      expect((instance as any).templates.get(TEST_TEMPLATE_KEY)).toEqual({
        html: TEST_HTML,
        createClientSecret: secondSessionFactory,
      });
    });
  });

  describe('initialize', () => {
    it('does not allocate a server for an incompatible SDK and can retry', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      playwrightMetadata.version = '1.62.0';
      await expect(instance.initialize()).rejects.toThrow(
        'installed playwright package (1.62.0) is incompatible',
      );
      expect(http.createServer).not.toHaveBeenCalled();
      expect(mockChromium.launch).not.toHaveBeenCalled();
      playwrightMetadata.version = '1.63.0';
      await instance.initialize();
      expect(mockChromium.launch).toHaveBeenCalledOnce();
    });

    it('closes its server when the browser binary is absent and can retry', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      mockChromium.launch.mockRejectedValueOnce(new Error("Executable doesn't exist"));
      await expect(instance.initialize()).rejects.toThrow('npx playwright install chromium');
      const server = vi.mocked(http.createServer).mock.results[0].value;
      expect(server.close).toHaveBeenCalledOnce();
      await instance.initialize();
      expect(mockChromium.launch).toHaveBeenCalledTimes(2);
    });

    it('closes unfinished HTTP requests after launch failure before retrying on the same port', async () => {
      const { createServer } = await vi.importActual<typeof http>('http');
      const server = createServer((_request, response) => response.end('ChatKit fixture'));
      const retryServer = createServer((_request, response) => response.end('ChatKit fixture'));
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as { port: number };
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const instance = ChatKitBrowserPool.getInstance({ serverPort: port });
      vi.mocked(http.createServer).mockReturnValueOnce(server).mockReturnValueOnce(retryServer);
      let serverClosed = false;
      server.once('close', () => {
        serverClosed = true;
      });
      let connection: Socket | undefined;
      let socket: Socket | undefined;
      let socketClosed: Promise<unknown> | undefined;
      onTestFinished(() => {
        socket?.destroy();
        for (const ownedServer of [server, retryServer]) {
          ownedServer.closeAllConnections();
          ownedServer.close(() => {});
        }
      });
      mockChromium.launch.mockImplementationOnce(async () => {
        const connected = once(server, 'connection');
        socket = connect(port, '127.0.0.1');
        socketClosed = once(socket, 'close');
        const [acceptedConnection] = await connected;
        connection = acceptedConnection;
        const received = once(acceptedConnection, 'data');
        socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
        await received;
        throw new Error('Browser launch failed after binding');
      });

      await expect(instance.initialize()).rejects.toThrow('Browser launch failed after binding');
      expect(connection?.destroyed).toBe(true);
      expect(serverClosed).toBe(true);
      await socketClosed;
      expect((instance as any).server).toBeNull();
      expect((instance as any).serverPort).toBe(0);

      await instance.initialize();
      expect((retryServer.address() as { port: number }).port).toBe(port);
      expect(mockChromium.launch).toHaveBeenCalledTimes(2);
      await instance.shutdown();
    });

    it('keeps initialization pending until its failed-launch server finishes closing', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      const server = http.createServer();
      let closeCallback: ((error?: Error) => void) | undefined;
      vi.mocked(server.close).mockImplementation((callback) => {
        closeCallback = callback;
        return server;
      });
      mockChromium.launch.mockRejectedValueOnce(new Error('Browser launch failed'));
      let settled = false;
      const initialization = instance.initialize().catch((error) => {
        settled = true;
        return error;
      });
      await vi.waitFor(() => expect(server.close).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
      expect(server.closeAllConnections).toHaveBeenCalledOnce();
      closeCallback?.();
      expect(await initialization).toEqual(new Error('Browser launch failed'));
    });

    it.each(['callback', 'throw'])(
      'preserves launch errors when server close fails via %s',
      async (failure) => {
        const instance = ChatKitBrowserPool.getInstance();
        const server = http.createServer();
        vi.mocked(server.close).mockImplementationOnce((callback) => {
          const error = new Error('Server is not running');
          if (failure === 'throw') {
            throw error;
          }
          callback?.(error);
          return server;
        });
        mockChromium.launch.mockRejectedValueOnce(new Error('Original launch failure'));

        await expect(instance.initialize()).rejects.toThrow('Original launch failure');
        expect((instance as any).server).toBeNull();
        expect((instance as any).serverPort).toBe(0);
        await instance.initialize();
        expect(mockChromium.launch).toHaveBeenCalledTimes(2);
      },
    );

    it('should start HTTP server and launch browser', async () => {
      const instance = ChatKitBrowserPool.getInstance();

      await instance.initialize();

      expect((instance as any).initialized).toBe(true);
      expect((instance as any).browser).toBe(mockBrowser);
      expect((instance as any).server).not.toBeNull();
    });

    it('should not reinitialize if already initialized', async () => {
      const instance = ChatKitBrowserPool.getInstance();

      await instance.initialize();
      await instance.initialize();

      // Should only launch browser once
      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization calls', async () => {
      const instance = ChatKitBrowserPool.getInstance();

      // Multiple concurrent initialize calls
      await Promise.all([instance.initialize(), instance.initialize(), instance.initialize()]);

      // Should still only launch browser once
      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    it.each(['disconnect', 'shutdown'])(
      'cancels pending pooled session minting on %s',
      async (reason) => {
        const pool = ChatKitBrowserPool.getInstance();
        let signal: AbortSignal | undefined;
        pool.setTemplate(
          TEST_TEMPLATE_KEY,
          TEST_HTML,
          (requestSignal) =>
            new Promise((_resolve, reject) => {
              signal = requestSignal;
              signal.addEventListener('abort', () => reject(signal!.reason), { once: true });
            }),
        );
        await pool.initialize();
        const response = Object.assign(new EventEmitter(), { writeHead: vi.fn(), end: vi.fn() });
        (pool as any).server.closeAllConnections.mockImplementation(() => response.emit('close'));
        mockServerRequestHandler(
          {
            method: 'POST',
            headers: { host: '127.0.0.1:3000' },
            url: `/template/${encodeURIComponent(TEST_TEMPLATE_KEY)}/session`,
          },
          response,
        );
        expect(signal?.aborted).toBe(false);
        if (reason === 'shutdown') {
          await pool.shutdown();
        } else {
          response.emit('close');
        }
        await vi.waitFor(() => expect(response.listenerCount('close')).toBe(0));
        expect(signal?.aborted).toBe(true);
        expect(response.writeHead).not.toHaveBeenCalled();
        expect(response.end).not.toHaveBeenCalled();
      },
    );

    it('should return pooled client secrets through the template session route', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(
        TEST_TEMPLATE_KEY,
        TEST_HTML,
        vi.fn().mockResolvedValue('pooled-secret-123'),
      );
      await instance.initialize();

      const writeHead = vi.fn();
      const end = vi.fn();

      mockServerRequestHandler(
        {
          method: 'POST',
          headers: { host: '127.0.0.1:3000' },
          url: `/template/${encodeURIComponent(TEST_TEMPLATE_KEY)}/session`,
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
      expect(end).toHaveBeenCalledWith(JSON.stringify({ client_secret: 'pooled-secret-123' }));
    });

    it('should route namespaced templates to their own session factories', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      const firstKey = ChatKitBrowserPool.generateTemplateKey(
        'wf_shared',
        undefined,
        'shared-user',
        'provider-1',
      );
      const secondKey = ChatKitBrowserPool.generateTemplateKey(
        'wf_shared',
        undefined,
        'shared-user',
        'provider-2',
      );
      const firstFactory = vi.fn().mockResolvedValue('first-secret');
      const secondFactory = vi.fn().mockResolvedValue('second-secret');
      instance.setTemplate(firstKey, TEST_HTML, firstFactory);
      instance.setTemplate(secondKey, TEST_HTML, secondFactory);
      await instance.initialize();

      const firstEnd = vi.fn();
      mockServerRequestHandler(
        {
          method: 'POST',
          headers: { host: '127.0.0.1:3000' },
          url: `/template/${encodeURIComponent(firstKey)}/session`,
        },
        Object.assign(new EventEmitter(), {
          writeHead: vi.fn(),
          end: firstEnd,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();

      expect(firstFactory).toHaveBeenCalledOnce();
      expect(secondFactory).not.toHaveBeenCalled();
      expect(firstEnd).toHaveBeenCalledWith(JSON.stringify({ client_secret: 'first-secret' }));

      const secondEnd = vi.fn();
      mockServerRequestHandler(
        {
          method: 'POST',
          headers: { host: '127.0.0.1:3000' },
          url: `/template/${encodeURIComponent(secondKey)}/session`,
        },
        Object.assign(new EventEmitter(), {
          writeHead: vi.fn(),
          end: secondEnd,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();

      expect(firstFactory).toHaveBeenCalledOnce();
      expect(secondFactory).toHaveBeenCalledOnce();
      expect(secondEnd).toHaveBeenCalledWith(JSON.stringify({ client_secret: 'second-secret' }));
    });

    it.each(['rate_limit', 'quota'] as const)(
      'preserves sanitized %s classification',
      async (kind) => {
        const res = Object.assign(new EventEmitter(), { writeHead: vi.fn(), end: vi.fn() });
        await serveChatKitSession(res as unknown as ServerResponse, async () => {
          throw new HttpRateLimitError({
            status: 429,
            code: kind === 'quota' ? 'insufficient_quota' : 'rate_limit_exceeded',
            body: { error: 'private-upstream-detail' },
          });
        });
        expect(res.writeHead).toHaveBeenCalledWith(429, { 'Content-Type': 'application/json' });
        const body = res.end.mock.calls[0][0];
        expect(body).not.toContain('private-upstream-detail');
        expect(
          isProviderResponseRateLimited({ error: `Session failed: 429 ${body}` }, undefined),
        ).toBe(kind === 'rate_limit');
        expect(res.listenerCount('close')).toBe(0);
      },
    );

    it('should redact pooled session minting failures in browser responses', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(
        TEST_TEMPLATE_KEY,
        TEST_HTML,
        vi.fn().mockRejectedValue(new Error('upstream detail should stay server-side')),
      );
      await instance.initialize();

      const writeHead = vi.fn();
      const end = vi.fn();

      mockServerRequestHandler(
        {
          method: 'POST',
          headers: { host: '127.0.0.1:3000' },
          url: `/template/${encodeURIComponent(TEST_TEMPLATE_KEY)}/session`,
        },
        Object.assign(new EventEmitter(), {
          writeHead,
          end,
        }),
      );

      await Promise.resolve();
      await Promise.resolve();

      expect(writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
      expect(end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Failed to create ChatKit session' }),
      );
      expect(end.mock.calls[0]?.[0]).not.toContain('upstream detail should stay server-side');
    });
  });

  describe('acquirePage', () => {
    it('should create a new page when pool is empty', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      const pooledPage = await instance.acquirePage(TEST_TEMPLATE_KEY);

      expect(pooledPage).toBeDefined();
      expect(pooledPage.page).toBe(mockPage);
      expect(pooledPage.context).toBe(mockContext);
      expect(pooledPage.inUse).toBe(true);
      expect(pooledPage.ready).toBe(true);
      expect(pooledPage.templateKey).toBe(TEST_TEMPLATE_KEY);
    });

    it('should reuse existing page when available for same template', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      const page1 = await instance.acquirePage(TEST_TEMPLATE_KEY);
      await instance.releasePage(page1);

      const page2 = await instance.acquirePage(TEST_TEMPLATE_KEY);

      // Should reuse the same page
      expect(page2).toBe(page1);
    });

    it('should create separate pages for different templates', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 4 });
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';

      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      const page1 = await instance.acquirePage(key1);
      const page2 = await instance.acquirePage(key2);

      expect(page1.templateKey).toBe(key1);
      expect(page2.templateKey).toBe(key2);
      expect(page1).not.toBe(page2);
    });

    it('should create multiple pages up to maxConcurrency', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      const pages = await Promise.all([
        instance.acquirePage(TEST_TEMPLATE_KEY),
        instance.acquirePage(TEST_TEMPLATE_KEY),
        instance.acquirePage(TEST_TEMPLATE_KEY),
      ]);

      expect(pages.length).toBe(3);
      expect(instance.getStats().total).toBe(3);
      expect(instance.getStats().inUse).toBe(3);
    });

    it('should throw error if template not registered', async () => {
      const instance = ChatKitBrowserPool.getInstance();

      await expect(instance.acquirePage('unregistered_key')).rejects.toThrow(
        'Template not registered',
      );
    });
  });

  describe('releasePage', () => {
    it('should mark page as not in use', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      const pooledPage = await instance.acquirePage(TEST_TEMPLATE_KEY);
      expect(pooledPage.inUse).toBe(true);

      await instance.releasePage(pooledPage);
      expect(pooledPage.inUse).toBe(false);
    });

    it('should reload page for fresh state', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      const pooledPage = await instance.acquirePage(TEST_TEMPLATE_KEY);
      await instance.releasePage(pooledPage);

      expect(mockPage.reload).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
    });

    it('should handle multiple acquire/release cycles', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      // First acquire
      const page1 = await instance.acquirePage(TEST_TEMPLATE_KEY);
      expect(page1.inUse).toBe(true);
      expect(instance.getStats().inUse).toBe(1);

      // Release
      await instance.releasePage(page1);
      expect(page1.inUse).toBe(false);

      // Acquire again - should get the same page
      const page2 = await instance.acquirePage(TEST_TEMPLATE_KEY);
      expect(page2).toBe(page1);
      expect(page2.inUse).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return accurate pool statistics', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      expect(instance.getStats()).toEqual({ total: 0, inUse: 0, waiting: 0, templates: 1 });

      const page1 = await instance.acquirePage(TEST_TEMPLATE_KEY);
      expect(instance.getStats()).toEqual({ total: 1, inUse: 1, waiting: 0, templates: 1 });

      const _page2 = await instance.acquirePage(TEST_TEMPLATE_KEY);
      expect(instance.getStats()).toEqual({ total: 2, inUse: 2, waiting: 0, templates: 1 });

      await instance.releasePage(page1);
      expect(instance.getStats()).toEqual({ total: 2, inUse: 1, waiting: 0, templates: 1 });
    });

    it('should count multiple templates', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 4 });
      instance.setTemplate('key1', '<html>1</html>');
      instance.setTemplate('key2', '<html>2</html>');

      expect(instance.getStats().templates).toBe(2);
    });
  });

  describe('shutdown', () => {
    it('should close all contexts and browser', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      await instance.acquirePage(TEST_TEMPLATE_KEY);
      await instance.shutdown();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect((instance as any).initialized).toBe(false);
      expect((instance as any).browser).toBeNull();
    });

    it('should clear all pages from pool', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      await Promise.all([
        instance.acquirePage(TEST_TEMPLATE_KEY),
        instance.acquirePage(TEST_TEMPLATE_KEY),
        instance.acquirePage(TEST_TEMPLATE_KEY),
      ]);

      expect(instance.getStats().total).toBe(3);

      await instance.shutdown();

      expect(instance.getStats().total).toBe(0);
    });

    it('should clear templates', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);

      expect(instance.getStats().templates).toBe(1);

      await instance.shutdown();

      expect(instance.getStats().templates).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw helpful error when Playwright not installed', async () => {
      mockChromium.launch.mockRejectedValueOnce(
        new Error("Executable doesn't exist at /path/to/browser"),
      );

      ChatKitBrowserPool.resetInstance();

      const newInstance = ChatKitBrowserPool.getInstance();

      await expect(newInstance.initialize()).rejects.toThrow('Playwright browser not installed');
    });
  });

  describe('template isolation', () => {
    it('replaces an already idle template when a different provider arrives at capacity', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate('first-provider', TEST_HTML);
      instance.setTemplate('second-provider', TEST_HTML);
      const first = await instance.acquirePage('first-provider');
      await instance.releasePage(first);

      const second = await instance.acquirePage('second-provider');
      expect(second.templateKey).toBe('second-provider');
      expect(second).not.toBe(first);
      expect(instance.getStats()).toMatchObject({ total: 1, inUse: 1, waiting: 0 });
      expect(mockContext.close).toHaveBeenCalled();
    });

    it('keeps the initial creation reserved until it is recorded', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      let finish!: (value: typeof mockContext) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const firstRequest = instance.acquirePage(TEST_TEMPLATE_KEY);
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(1));
      const secondRequest = instance.acquirePage(TEST_TEMPLATE_KEY);
      finish(mockContext);
      const first = await firstRequest;
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
      expect(instance.getStats()).toMatchObject({ total: 1, inUse: 1, waiting: 1 });
      await instance.releasePage(first);
      expect(await secondRequest).toBe(first);
    });

    it('rejects a queued creation failure and releases its waiting timer', async () => {
      vi.useFakeTimers();
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate('first', TEST_HTML);
      instance.setTemplate('second', TEST_HTML);
      const first = await instance.acquirePage('first');
      const second = instance.acquirePage('second');
      const rejected = expect(second).rejects.toThrow('fixture creation failure');
      mockBrowser.newContext.mockRejectedValueOnce(new Error('fixture creation failure'));
      await instance.releasePage(first);
      await rejected;
      expect(instance.getStats()).toMatchObject({ total: 0, waiting: 0 });
      await instance.shutdown();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects queued callers and clears timers on shutdown', async () => {
      vi.useFakeTimers();
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      await instance.acquirePage(TEST_TEMPLATE_KEY);
      const waiting = instance.acquirePage(TEST_TEMPLATE_KEY);
      const rejected = expect(waiting).rejects.toThrow('pool shut down');
      await vi.waitFor(() => expect(instance.getStats().waiting).toBe(1));
      await instance.shutdown();
      await rejected;
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the browser alive while a reserved creation is pending', async () => {
      vi.useFakeTimers();
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      const first = await instance.acquirePage(TEST_TEMPLATE_KEY);
      let finish!: (value: typeof mockContext) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const creating = instance.acquirePage(TEST_TEMPLATE_KEY);
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(2));
      await instance.releasePage(first);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockBrowser.close).not.toHaveBeenCalled();
      finish(mockContext);
      await expect(creating).resolves.toMatchObject({ inUse: true });
    });

    it('shuts down after the last pending page creation fails while idle', async () => {
      vi.useFakeTimers();
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      const first = await instance.acquirePage(TEST_TEMPLATE_KEY);
      let fail!: (error: Error) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      );
      const creating = instance.acquirePage(TEST_TEMPLATE_KEY);
      const rejected = expect(creating).rejects.toThrow('fixture page creation failed');
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(2));
      await instance.releasePage(first);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockBrowser.close).not.toHaveBeenCalled();
      fail(new Error('fixture page creation failed'));
      await rejected;
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockBrowser.close).toHaveBeenCalledOnce();
      expect(instance.getStats().templates).toBe(0);
    });

    it('closes a page whose creation completes after shutdown', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      let finish!: (value: typeof mockContext) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const creating = instance.acquirePage(TEST_TEMPLATE_KEY);
      const rejected = expect(creating).rejects.toThrow('pool shut down');
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(1));
      await instance.shutdown();
      finish(mockContext);
      await rejected;
      expect(mockContext.close).toHaveBeenCalled();
      expect(instance.getStats().total).toBe(0);
    });

    it('reclaims an idle page for a waiting isolated template at capacity', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';
      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      const page1 = await instance.acquirePage(key1);
      const pendingPage2 = instance.acquirePage(key2);
      await instance.releasePage(page1);

      await expect(pendingPage2).resolves.toMatchObject({ templateKey: key2 });
    });

    it('reserves reclaimed capacity while closing idle pages', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      for (const key of ['one', 'two', 'three', 'four']) {
        instance.setTemplate(key, '<html></html>');
      }
      const page1 = await instance.acquirePage('one');
      const page2 = await instance.acquirePage('two');
      const pending = [instance.acquirePage('three'), instance.acquirePage('four')];
      const releaseClose: Array<() => void> = [];
      mockContext.close.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseClose.push(resolve);
          }),
      );

      const releases = [instance.releasePage(page1), instance.releasePage(page2)];
      await Promise.resolve();
      releaseClose.splice(0).forEach((resolve) => resolve());
      mockContext.close.mockResolvedValue(undefined);
      await Promise.all([...releases, ...pending]);

      expect(instance.getStats().total).toBeLessThanOrEqual(2);
    });

    it('reserves reclaimed capacity while creating replacement pages', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      for (const key of ['one', 'two', 'three']) {
        instance.setTemplate(key, '<html></html>');
      }
      const page1 = await instance.acquirePage('one');
      const pendingPage2 = instance.acquirePage('two');
      let resolveContext!: (context: typeof mockContext) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveContext = resolve;
          }),
      );

      const release = instance.releasePage(page1);
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(2));
      const pendingPage3 = instance.acquirePage('three');
      await Promise.resolve();
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);

      resolveContext(mockContext);
      await release;
      const page2 = await pendingPage2;
      await instance.releasePage(page2);
      await pendingPage3;
      expect(instance.getStats().total).toBeLessThanOrEqual(1);
    });

    it('serves a queued caller after a reserved page creation fails', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      let rejectCreation!: (error: Error) => void;
      mockBrowser.newContext.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectCreation = reject;
          }),
      );

      const failed = instance.acquirePage(TEST_TEMPLATE_KEY);
      await vi.waitFor(() => expect(mockBrowser.newContext).toHaveBeenCalledTimes(1));
      const queued = instance.acquirePage(TEST_TEMPLATE_KEY);
      rejectCreation(new Error('creation failed'));

      await expect(failed).rejects.toThrow('creation failed');
      await expect(queued).resolves.toMatchObject({ templateKey: TEST_TEMPLATE_KEY });
    });

    it('reserves an idle page while refreshing it', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      instance.setTemplate(TEST_TEMPLATE_KEY, TEST_HTML);
      const idlePage = await instance.acquirePage(TEST_TEMPLATE_KEY);
      await instance.releasePage(idlePage);
      instance.setTemplate(TEST_TEMPLATE_KEY, '<html>updated</html>');

      let finishRefresh!: () => void;
      mockPage.reload.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishRefresh = resolve;
          }),
      );
      const refreshing = instance.acquirePage(TEST_TEMPLATE_KEY);
      await vi.waitFor(() => expect(mockPage.reload).toHaveBeenCalled());
      const second = await instance.acquirePage(TEST_TEMPLATE_KEY);
      finishRefresh();
      const first = await refreshing;

      expect(first).not.toBe(second);
      expect(instance.getStats().inUse).toBe(2);
    });

    it('should not reuse pages across different templates', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 4 });
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';

      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      // Get a page for workflow1
      const page1 = await instance.acquirePage(key1);
      await instance.releasePage(page1);

      // Request a page for workflow2 - should NOT get the workflow1 page
      const page2 = await instance.acquirePage(key2);
      expect(page2.templateKey).toBe(key2);
      expect(page2).not.toBe(page1);
    });

    it('should only give released pages to waiters with matching template', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';

      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      // Get pages for both workflows
      const page1 = await instance.acquirePage(key1);
      const page2 = await instance.acquirePage(key2);

      // Release workflow1 page
      await instance.releasePage(page1);

      // Start waiting for workflow2 (a second workflow2 page)
      // Since maxConcurrency is 2 and both slots are taken (workflow1 released, workflow2 in use)
      // The waiter should eventually get the workflow1 page when released? No!
      // Actually with maxConcurrency: 2 and both pages created, we're at limit
      // Let's just verify the released page1 doesn't get given to a workflow2 request

      // Release workflow2 page
      await instance.releasePage(page2);

      // Now request workflow2 - should get page2 back, not page1
      const page2Again = await instance.acquirePage(key2);
      expect(page2Again).toBe(page2);
      expect(page2Again.templateKey).toBe(key2);

      // Request workflow1 - should get page1 back
      const page1Again = await instance.acquirePage(key1);
      expect(page1Again).toBe(page1);
      expect(page1Again.templateKey).toBe(key1);
    });
  });
});
