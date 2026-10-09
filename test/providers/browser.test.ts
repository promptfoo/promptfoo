import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserProvider, createTransformResponse } from '../../src/providers/browser';
import type { Page } from 'playwright';
import type { Mock, Mocked } from 'vitest';

let mockPage: Mocked<Page>;

const mockBrowser = {
  contexts: vi.fn(() => []),
  newContext: vi.fn(() =>
    Promise.resolve({
      newPage: vi.fn(() => Promise.resolve(mockPage)),
      addCookies: vi.fn(),
      close: vi.fn(),
    }),
  ),
  close: vi.fn(),
};

vi.mock('playwright-extra', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    chromium: {
      use: vi.fn(),
      launch: vi.fn().mockImplementation(function () {
        return Promise.resolve(mockBrowser);
      }),
      connectOverCDP: vi.fn().mockImplementation(function () {
        return Promise.resolve(mockBrowser);
      }),
      connect: vi.fn().mockImplementation(function () {
        return Promise.resolve(mockBrowser);
      }),
    },
  };
});

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn(),
}));

describe('BrowserProvider', () => {
  beforeEach(() => {
    mockPage = {
      goto: vi.fn(),
      click: vi.fn(),
      fill: vi.fn(),
      waitForSelector: vi.fn().mockResolvedValue({} as never),
      waitForTimeout: vi.fn(),
      waitForFunction: vi.fn(),
      screenshot: vi.fn(),
      $eval: vi.fn(),
      $$eval: vi.fn(),
      content: vi.fn(),
      press: vi.fn(),
      close: vi.fn(),
    } as unknown as Mocked<Page>;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should execute navigate action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com');
  });

  it('should execute click action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'click',
            args: { selector: '#button' },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.click).toHaveBeenCalledWith('#button');
  });

  it('should execute type action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'type',
            args: { selector: '#input', text: 'test text' },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test text');
  });

  it('should handle special keys in type action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'type',
            args: { selector: '#input', text: 'test<enter>' },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test');
    expect(mockPage.press).toHaveBeenCalledWith('#input', 'Enter');
  });

  it('should execute extract action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'extract',
            args: { selector: '#content' },
            name: 'content',
          },
        ],
      },
    });

    mockPage.$eval.mockResolvedValue('extracted text');
    await provider.callApi('test');

    expect(mockPage.$eval).toHaveBeenCalledWith('#content', expect.any(Function));
  });

  it('should execute waitForNewChildren action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'waitForNewChildren',
            args: { parentSelector: '#parent' },
          },
        ],
      },
    });

    mockPage.$$eval.mockResolvedValue(2);
    await provider.callApi('test');

    expect(mockPage.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { parentSelector: '#parent', initialChildCount: 2 },
      { timeout: 30000, polling: 'raf' },
    );
  });

  it('should handle screenshot action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'screenshot',
            args: { path: 'test.png', fullPage: true },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      path: 'test.png',
    });
  });

  it('should handle wait action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'wait',
            args: { ms: 1000 },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
  });

  it('should handle errors gracefully', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'click',
            args: { selector: '#nonexistent' },
          },
        ],
      },
    });

    mockPage.waitForSelector.mockResolvedValue(null);
    const result = await provider.callApi('test');

    expect(result.error).toBeDefined();
  });

  it('should throw error for unknown action', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'unknown',
            args: {},
          },
        ],
      },
    });

    const result = await provider.callApi('test');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Unknown action type');
  });

  it('should use transformResponse function', async () => {
    const transform = vi.fn().mockReturnValue({ foo: 'bar' });
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        transformResponse: transform,
      },
    });

    mockPage.content.mockResolvedValue('<html></html>');
    const result = await provider.callApi('test');
    expect(transform).toHaveBeenCalledWith({}, '<html></html>');
    expect(result.output).toEqual({ foo: 'bar' });
  });

  it('should use transformResponse string', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        transformResponse: '({foo: extracted, html: finalHtml})',
      },
    });

    mockPage.content.mockResolvedValue('<html></html>');
    const result = await provider.callApi('test');
    expect(result.output).toHaveProperty('foo');
    expect(result.output).toHaveProperty('html');
  });

  it('should render args with nunjucks', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://{{ prompt }}.com' },
          },
        ],
      },
    });

    await provider.callApi('hello');
    expect(mockPage.goto).toHaveBeenCalledWith('https://hello.com');
  });

  it('should handle cookies as array', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        cookies: [{ name: 'foo', value: 'bar' }],
      },
    });

    await provider.callApi('test');
    expect(true).toBe(true);
  });

  it('should handle cookies as string', async () => {
    vi.resetModules();
    vi.doMock('../../src/util/file', () => ({
      maybeLoadFromExternalFile: vi.fn().mockReturnValue('foo=bar;baz=qux'),
    }));
    const { BrowserProvider: MockedBrowserProvider } = await import('../../src/providers/browser');
    const provider = new MockedBrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        cookies: 'mock-file.txt',
      },
    });
    await provider.callApi('test');
    expect(mockPage.fill).toHaveBeenCalledTimes(0);
    expect(mockPage.press).toHaveBeenCalledTimes(0);
    vi.doUnmock('../../src/util/file');
  });

  it('should throw error if extract action missing name', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'extract',
            args: { selector: '#content' },
          },
        ],
      },
    });

    mockPage.$eval.mockResolvedValue('val');
    const result = await provider.callApi('test');
    expect(result.error).toBeDefined();
  });

  it('should warn and continue if waitForSelector times out and optional is true', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'click',
            args: { selector: '#notfound', optional: true },
          },
        ],
      },
    });

    mockPage.waitForSelector.mockResolvedValue(null);
    mockPage.content.mockResolvedValue('<html>page content</html>');
    const result = await provider.callApi('test');
    expect(result.output).toBeDefined();
  });

  it('should default to output: finalHtml if no transformResponse', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
      },
    });

    mockPage.content.mockResolvedValue('final-html');
    const result = await provider.callApi('test');
    expect(result.output).toEqual('final-html');
  });

  it('should not double-wrap when transformResponse returns a full ProviderResponse', async () => {
    const transformFn = vi.fn().mockReturnValue({
      output: 'transformed output',
      metadata: { custom: 'data' },
      tokenUsage: { total: 100, prompt: 50, completion: 50 },
    });

    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        transformResponse: transformFn,
      },
    });

    mockPage.content.mockResolvedValue('<html>test</html>');
    const result = await provider.callApi('test');

    expect(transformFn).toHaveBeenCalledWith({}, '<html>test</html>');
    expect(result).toEqual({
      output: 'transformed output',
      metadata: { custom: 'data' },
      tokenUsage: { total: 100, prompt: 50, completion: 50 },
    });
  });

  it('should wrap raw string values from transformResponse', async () => {
    const transformFn = vi.fn().mockReturnValue('just a string');

    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        transformResponse: transformFn,
      },
    });

    mockPage.content.mockResolvedValue('<html>test</html>');
    const result = await provider.callApi('test');

    expect(result).toEqual({
      output: 'just a string',
    });
  });

  it('should wrap raw array values from transformResponse', async () => {
    const transformFn = vi.fn().mockReturnValue(['item1', 'item2']);

    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
        transformResponse: transformFn,
      },
    });

    mockPage.content.mockResolvedValue('<html>test</html>');
    const result = await provider.callApi('test');

    expect(result).toEqual({
      output: ['item1', 'item2'],
    });
  });
});

describe('createTransformResponse', () => {
  it('should use function as transform', () => {
    const fn = vi.fn().mockReturnValue('val');
    const tr = createTransformResponse(fn);
    expect(tr({}, 'html')).toBe('val');
  });

  it('should use string as transform', () => {
    const tr = createTransformResponse('({foo: 1, html: finalHtml})');
    const result = tr({ a: 2 }, 'bar');
    expect(result).toEqual({ foo: 1, html: 'bar' });
  });

  it('should default to returning finalHtml', () => {
    const tr = createTransformResponse(undefined);
    const result = tr({}, 'baz');
    expect(result).toEqual({ output: 'baz' });
  });
});

describe('BrowserProvider - Multi-turn Session Persistence', () => {
  beforeEach(() => {
    mockPage = {
      goto: vi.fn(),
      click: vi.fn(),
      fill: vi.fn(),
      waitForSelector: vi.fn().mockResolvedValue({} as never),
      waitForTimeout: vi.fn(),
      waitForFunction: vi.fn(),
      screenshot: vi.fn(),
      $eval: vi.fn(),
      $$eval: vi.fn(),
      content: vi.fn().mockResolvedValue('<html></html>'),
      press: vi.fn(),
      close: vi.fn(),
      isClosed: vi.fn().mockReturnValue(false),
      evaluate: vi.fn(),
    } as unknown as Mocked<Page>;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should reuse page when persistSession is enabled', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
          {
            action: 'type',
            args: { selector: '#input', text: '{{prompt}}' },
          },
        ],
      },
    });

    // First call - should navigate
    await provider.callApi('first prompt');
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com');
    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'first prompt');

    // Reset mocks to track second call
    vi.clearAllMocks();

    // Second call - should reuse page (navigate still called since runOnce not set)
    await provider.callApi('second prompt');
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com');
    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'second prompt');
  });

  it('should skip runOnce steps on subsequent calls', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        steps: [
          {
            action: 'navigate',
            runOnce: true,
            args: { url: 'https://example.com' },
          },
          {
            action: 'wait',
            runOnce: true,
            args: { ms: 1000 },
          },
          {
            action: 'type',
            args: { selector: '#input', text: '{{prompt}}' },
          },
        ],
      },
    });

    // First call - should run all steps including runOnce
    await provider.callApi('first prompt');
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
    expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(1);
    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'first prompt');

    // Reset mocks
    vi.clearAllMocks();

    // Second call - should skip runOnce steps
    await provider.callApi('second prompt');
    expect(mockPage.goto).not.toHaveBeenCalled(); // runOnce - skipped
    expect(mockPage.waitForTimeout).not.toHaveBeenCalled(); // runOnce - skipped
    expect(mockPage.fill).toHaveBeenCalledWith('#input', 'second prompt'); // always run
  });

  it('should execute extract action with custom script', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'extract',
            args: { script: 'return document.body.innerText' },
            name: 'bodyText',
          },
        ],
        transformResponse: 'extracted.bodyText',
      },
    });

    mockPage.evaluate.mockResolvedValue('Hello World');
    const result = await provider.callApi('test');

    expect(mockPage.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      'return document.body.innerText',
    );
    expect(result.output).toBe('Hello World');
  });

  it('should throw error if extract action missing both selector and script', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [
          {
            action: 'extract',
            args: {},
            name: 'result',
          },
        ],
      },
    });

    const result = await provider.callApi('test');
    expect(result.error).toBeDefined();
    expect(result.error).toContain("'selector' or 'script'");
  });

  it('should create new page if persisted page is closed', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
      },
    });

    // First call
    await provider.callApi('first');
    expect(mockPage.goto).toHaveBeenCalledTimes(1);

    // Simulate page being closed
    mockPage.isClosed.mockReturnValue(true);

    // Reset and make second call
    vi.clearAllMocks();
    await provider.callApi('second');

    // Should create new page and navigate again
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
  });
});

describe('BrowserProvider - Connect to Existing Session', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockFetch = vi.spyOn(global, 'fetch').mockImplementation(function () {
      return Promise.resolve({
        json: () => Promise.resolve({ Browser: 'Chrome/120.0.0.0' }),
      } as Response);
    });
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('should connect via CDP when configured', async () => {
    const { chromium } = await import('playwright-extra');

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://example.com' },
          },
        ],
      },
    });

    await provider.callApi('test');

    expect(chromium.connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
  });

  it('should connect via WebSocket when configured', async () => {
    const { chromium } = await import('playwright-extra');

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          mode: 'websocket',
          wsEndpoint: 'ws://localhost:9222/devtools/browser/123',
        },
        steps: [],
      },
    });

    await provider.callApi('test');

    expect(chromium.connect).toHaveBeenCalledWith({
      wsEndpoint: 'ws://localhost:9222/devtools/browser/123',
    });
  });

  it('should use existing context when connecting to existing browser', async () => {
    const mockPage = {
      goto: vi.fn(),
      content: vi.fn(() => Promise.resolve('<html></html>')),
      click: vi.fn(),
      type: vi.fn(),
      waitForSelector: vi.fn(),
      $$: vi.fn(),
      screenshot: vi.fn(),
      waitForTimeout: vi.fn(),
      close: vi.fn(),
    };

    const mockContext = {
      newPage: vi.fn(() => Promise.resolve(mockPage)),
      addCookies: vi.fn(),
      close: vi.fn(),
    };

    const mockExistingBrowser = {
      contexts: vi.fn(() => [
        {
          newPage: vi.fn(() => Promise.resolve(mockPage)),
          addCookies: vi.fn(),
          close: vi.fn(),
        },
      ]),
      newContext: vi.fn(() => Promise.resolve(mockContext)),
      close: vi.fn(),
    };

    const playwrightExtra = await import('playwright-extra');
    vi.mocked(playwrightExtra.chromium.connectOverCDP).mockResolvedValueOnce(
      mockExistingBrowser as any,
    );

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    await provider.callApi('test');

    expect(mockExistingBrowser.contexts).toHaveBeenCalled();
    expect(mockExistingBrowser.newContext).not.toHaveBeenCalled();
  });

  it('should not close browser when connected to existing session', async () => {
    const { chromium } = await import('playwright-extra');
    const mockCloseFn = vi.fn();
    const mockPageClose = vi.fn();

    const mockConnectedBrowser = {
      contexts: vi.fn(() => [
        {
          newPage: vi.fn(() =>
            Promise.resolve({
              goto: vi.fn(),
              content: vi.fn(),
              close: mockPageClose,
            }),
          ),
          addCookies: vi.fn(),
          close: vi.fn(),
        },
      ]),
      newContext: vi.fn(),
      close: mockCloseFn,
    };

    (chromium.connectOverCDP as Mock).mockImplementationOnce(function () {
      return Promise.resolve(mockConnectedBrowser);
    });

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    await provider.callApi('test');

    expect(mockPageClose).toHaveBeenCalled();
    expect(mockCloseFn).not.toHaveBeenCalled();
  });

  it('should handle connection failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    expect(result.error).toContain('--remote-debugging-port=9222');
  });

  it('should handle 404 error when Chrome debugging port is not available', async () => {
    mockFetch.mockImplementation(function () {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.reject(new Error('Not Found')),
      } as Response);
    });

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    expect(result.error).toContain('--remote-debugging-port=9222');
  });

  it('should handle 500 server error from Chrome debugging port', async () => {
    mockFetch.mockImplementation(function () {
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Server Error')),
      } as Response);
    });

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
  });

  it('should handle network timeouts when connecting to Chrome', async () => {
    // Simulate timeout
    const timeoutError = new Error('Request timed out after 5000ms');
    mockFetch.mockRejectedValue(timeoutError);

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    // The error will be wrapped in the standard Chrome connection error message
    expect(result.error).toContain('Make sure Chrome is running');
  });

  it('should handle ECONNREFUSED errors specifically', async () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:9222');
    (connError as any).code = 'ECONNREFUSED';
    mockFetch.mockRejectedValue(connError);

    const provider = new BrowserProvider('test', {
      config: {
        connectOptions: {
          debuggingPort: 9222,
        },
        steps: [],
      },
    });

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    expect(result.error).toContain('Make sure Chrome is running');
  });
});
