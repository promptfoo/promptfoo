import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserProvider, createTransformResponse } from '../../src/providers/browser';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';
import type { Page } from 'playwright';
import type { Mock, Mocked } from 'vitest';

const createDebugBrowserOptions = () => ({
  config: {
    connectOptions: {
      debuggingPort: 9222,
    },
    steps: [],
  },
});

const createNavigateStep = () => ({
  action: 'navigate',
  args: { url: 'https://example.com' },
});

const createPromptTypingStep = () => ({
  action: 'type',
  args: { selector: '#input', text: '{{prompt}}' },
});

let mockPage: Mocked<Page>;

const openPages = new Set<Mocked<Page>>();
const mockBrowser = {
  contexts: vi.fn(() => []),
  newContext: vi.fn(async () => {
    const pages: Mocked<Page>[] = [];
    return {
      newPage: vi.fn(async () => {
        const page = mockPage;
        page.isClosed ||= vi.fn();
        page.isClosed.mockReturnValue(false);
        page.close.mockImplementation(async () => {
          page.isClosed.mockReturnValue(true);
          openPages.delete(page);
        });
        pages.push(page);
        openPages.add(page);
        return page;
      }),
      addCookies: vi.fn(
        async (
          cookies: { name: string; value: string; url?: string; domain?: string; path?: string }[],
        ) => {
          for (const cookie of cookies) {
            if (!(cookie.url || (cookie.domain && cookie.path))) {
              throw new Error('Cookie should have a url or a domain/path pair');
            }
            if (cookie.url && (cookie.domain || cookie.path)) {
              throw new Error('Cookie should have either url or domain/path');
            }
          }
        },
      ),
      close: vi.fn(async () => {
        await Promise.all(pages.map((page) => page.close()));
      }),
    };
  }),
  close: vi.fn(async () => {
    await Promise.all([...openPages].map((page) => page.close()));
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await providerRegistry.shutdownAll();
  openPages.clear();
  vi.clearAllMocks();
});

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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep()],
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
    const cookies = [{ name: 'foo', value: 'bar', url: 'https://example.com' }];
    const provider = new BrowserProvider('test', {
      config: { steps: [createNavigateStep()], cookies },
    });

    const result = await provider.callApi('test');
    const context = await mockBrowser.newContext.mock.results[0].value;
    expect(context.addCookies).toHaveBeenCalledExactlyOnceWith(cookies);
    expect(result.error).toBeUndefined();
  });

  it('should handle cookies as string', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        steps: [createNavigateStep()],
        cookies: 'foo=bar==; baz=qux;',
      },
    });

    const result = await provider.callApi('test');
    const context = await mockBrowser.newContext.mock.results[0].value;
    expect(context.addCookies).toHaveBeenCalledExactlyOnceWith([
      { name: 'foo', value: 'bar==', url: 'https://example.com/' },
      { name: 'baz', value: 'qux', url: 'https://example.com/' },
    ]);
    expect(result.error).toBeUndefined();
  });

  it('scopes string cookies to the rendered first navigation URL', async () => {
    const provider = new BrowserProvider('test', {
      config: {
        cookies: 'session=abc==',
        steps: [
          {
            action: 'navigate',
            args: { url: 'https://{{host}}/chat/start?secret=unused#fragment' },
          },
        ],
      },
    });
    const result = await provider.callApi('test', {
      prompt: { raw: '', label: '' },
      vars: { host: 'tenant.example.com' },
    });
    const context = await mockBrowser.newContext.mock.results[0].value;
    expect(result.error).toBeUndefined();
    expect(context.addCookies).toHaveBeenCalledExactlyOnceWith([
      { name: 'session', value: 'abc==', url: 'https://tenant.example.com/chat/start' },
    ]);
  });

  it.each([undefined, '/relative', 'ftp://example.com', 'data:text/html,hello'])(
    'rejects unscoped string cookies for navigation %s',
    async (url) => {
      const provider = new BrowserProvider('test', {
        config: {
          cookies: 'secret=value',
          steps: url ? [{ action: 'navigate', args: { url } }] : [],
        },
      });
      const result = await provider.callApi('test');
      const context = await mockBrowser.newContext.mock.results[0].value;
      expect(result.error).toContain(
        'String browser cookies require a first navigate step with an absolute HTTP(S) URL',
      );
      expect(result.error).not.toContain('secret=value');
      expect(context.addCookies).not.toHaveBeenCalled();
      expect(context.newPage).not.toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    },
  );

  it.each(['missing-value', '=secret'])(
    'rejects malformed cookie pairs without exposing their contents',
    async (cookies) => {
      const provider = new BrowserProvider('test', {
        config: { cookies, steps: [createNavigateStep()] },
      });
      const result = await provider.callApi('test');
      expect(result.error).toContain('Invalid browser cookie: expected name=value');
      expect(result.error).not.toContain(cookies);
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    },
  );

  it('reports Playwright rejection of cookie objects without an explicit scope', async () => {
    const provider = new BrowserProvider('test', {
      config: { cookies: [{ name: 'session', value: 'abc' }], steps: [createNavigateStep()] },
    });
    expect((await provider.callApi('test')).error).toContain(
      'Cookie should have a url or a domain/path pair',
    );
    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });

  it('preserves explicit domain and path cookie scopes', async () => {
    const cookies = [{ name: 'session', value: 'abc=', domain: 'example.com', path: '/chat' }];
    const provider = new BrowserProvider('test', {
      config: { cookies, steps: [createNavigateStep()] },
    });
    const result = await provider.callApi('test');
    const context = await mockBrowser.newContext.mock.results[0].value;
    expect(result.error).toBeUndefined();
    expect(context.addCookies).toHaveBeenCalledExactlyOnceWith(cookies);
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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep()],
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
        steps: [createNavigateStep(), createPromptTypingStep()],
      },
    });

    const first = await provider.callApi('first prompt');
    const second = await provider.callApi('second prompt');
    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
    const context = await mockBrowser.newContext.mock.results[0].value;
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(mockPage.fill).toHaveBeenNthCalledWith(1, '#input', 'first prompt');
    expect(mockPage.fill).toHaveBeenNthCalledWith(2, '#input', 'second prompt');
    expect(mockPage.close).not.toHaveBeenCalled();
    expect(mockBrowser.close).not.toHaveBeenCalled();
    await provider.cleanup();
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(mockPage.isClosed()).toBe(true);
    expect(providerRegistry.has(provider)).toBe(false);
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
          createPromptTypingStep(),
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
        steps: [{ ...createNavigateStep(), runOnce: true }],
      },
    });

    const originalPage = mockPage;
    const first = await provider.callApi('first');
    originalPage.isClosed.mockReturnValue(true);
    mockPage = {
      ...originalPage,
      goto: vi.fn(),
      content: vi.fn().mockResolvedValue('<html>replacement</html>'),
      close: vi.fn(),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const second = await provider.callApi('second');
    expect(first.error).toBeUndefined();
    expect(second).toEqual({ output: '<html>replacement</html>' });
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
    for (const call of mockBrowser.newContext.mock.results) {
      expect((await call.value).newPage).toHaveBeenCalledTimes(1);
    }
    expect(originalPage.goto).toHaveBeenCalledExactlyOnceWith('https://example.com');
    expect(mockPage.goto).toHaveBeenCalledExactlyOnceWith('https://example.com');
  });
});

describe('BrowserProvider lifecycle', () => {
  const makePage = () =>
    ({
      goto: vi.fn(),
      fill: vi.fn(),
      waitForSelector: vi.fn().mockResolvedValue({}),
      content: vi.fn().mockResolvedValue('<html>session</html>'),
      close: vi.fn(),
      isClosed: vi.fn().mockReturnValue(false),
    }) as unknown as Mocked<Page>;

  beforeEach(() => {
    mockPage = makePage();
  });

  it('cleans up after an evaluation and reruns initialization on reuse', async () => {
    const provider = new BrowserProvider('test', {
      config: { persistSession: true, steps: [{ ...createNavigateStep(), runOnce: true }] },
    });
    await providerRegistry.withEvaluation(async () => {
      expect((await provider.callApi('one')).error).toBeUndefined();
      expect((await provider.callApi('two')).error).toBeUndefined();
      expect(mockBrowser.close).not.toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledOnce();
    });
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(mockPage.isClosed()).toBe(true);
    expect(providerRegistry.has(provider)).toBe(false);

    mockPage = makePage();
    await providerRegistry.withEvaluation(async () => {
      expect((await provider.callApi('new eval')).error).toBeUndefined();
      expect(mockPage.goto).toHaveBeenCalledOnce();
    });
    expect(mockBrowser.close).toHaveBeenCalledTimes(2);
  });

  it('retains a reused session between turns in overlapping evaluation scopes', async () => {
    const provider = new BrowserProvider('test', {
      config: { persistSession: true, steps: [{ ...createNavigateStep(), runOnce: true }] },
    });
    const firstReady = createDeferred<void>();
    const secondReady = createDeferred<void>();
    const finishFirst = createDeferred<void>();
    const resumeSecond = createDeferred<void>();
    const first = providerRegistry.withEvaluation(async () => {
      expect((await provider.callApi('first')).error).toBeUndefined();
      firstReady.resolve();
      await finishFirst.promise;
    });
    let second: Promise<void> | undefined;
    try {
      await firstReady.promise;
      second = providerRegistry.withEvaluation(async () => {
        expect((await provider.callApi('second')).error).toBeUndefined();
        secondReady.resolve();
        await resumeSecond.promise;
        expect(mockPage.isClosed()).toBe(false);
        expect((await provider.callApi('second again')).error).toBeUndefined();
      });
      await secondReady.promise;
      finishFirst.resolve();
      await first;
      expect(mockBrowser.close).not.toHaveBeenCalled();
      resumeSecond.resolve();
      await second;
      expect(mockBrowser.newContext).toHaveBeenCalledOnce();
      expect(mockPage.goto).toHaveBeenCalledOnce();
      expect(mockBrowser.close).toHaveBeenCalledOnce();
    } finally {
      finishFirst.resolve();
      resumeSecond.resolve();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
      await provider.cleanup();
    }
  });

  it('keeps an active direct call alive when a concurrent evaluation ends', async () => {
    const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
    const ready = createDeferred<void>();
    const finishEvaluation = createDeferred<void>();
    const directStarted = createDeferred<void>();
    const finishDirect = createDeferred<void>();
    const evaluation = providerRegistry.withEvaluation(async () => {
      expect((await provider.callApi('evaluation')).error).toBeUndefined();
      ready.resolve();
      await finishEvaluation.promise;
    });
    let direct: ReturnType<typeof provider.callApi> | undefined;
    try {
      await ready.promise;
      const page = mockPage;
      page.content.mockImplementationOnce(async () => {
        directStarted.resolve();
        await finishDirect.promise;
        if (page.isClosed()) {
          throw new Error('Page closed during direct call');
        }
        return '<html>direct result</html>';
      });
      direct = provider.callApi('direct');
      await directStarted.promise;
      finishEvaluation.resolve();
      await evaluation;
      expect(page.isClosed()).toBe(false);
      expect(mockBrowser.close).not.toHaveBeenCalled();
      finishDirect.resolve();
      expect(await direct).toEqual({ output: '<html>direct result</html>' });
      await vi.waitFor(() => expect(mockBrowser.close).toHaveBeenCalledOnce());
    } finally {
      finishEvaluation.resolve();
      finishDirect.resolve();
      await Promise.allSettled([evaluation, ...(direct ? [direct] : [])]);
      await provider.cleanup();
    }
  });

  it('does not create a replacement session after concurrent cleanup', async () => {
    const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
    expect((await provider.callApi('seed')).error).toBeUndefined();
    mockPage.isClosed.mockReturnValue(true);
    const replacement = provider.callApi('replacement');
    const cleanup = provider.cleanup();
    expect((await replacement).error).toContain('Browser session was closed during cleanup');
    await cleanup;
    expect(mockBrowser.newContext).toHaveBeenCalledOnce();
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it('waits for every session teardown before reporting a cleanup failure', async () => {
    const { chromium } = await import('playwright-extra');
    const { default: stealth } = await import('puppeteer-extra-plugin-stealth');
    const dependencies = await import('../../src/providers/browserDependencies');
    // Both concurrent launches must use the same mocked Playwright boundary.
    const loadDependencies = vi
      .spyOn(dependencies, 'loadBrowserProviderDependencies')
      .mockResolvedValue({ chromium, stealth });
    const sessions = [makePage(), makePage()].map((page) => ({
      page,
      browser: {
        newContext: vi.fn(async () => ({ newPage: vi.fn(async () => page) })),
        close: vi.fn(async () => {
          page.isClosed.mockReturnValue(true);
        }),
      },
    }));
    const finishLaunch = createDeferred<void>();
    for (const { browser } of sessions) {
      vi.mocked(chromium.launch).mockImplementationOnce(async () => {
        await finishLaunch.promise;
        return browser as never;
      });
    }
    const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
    const calls = Promise.all([provider.callApi('first'), provider.callApi('second')]);
    let responses;
    try {
      await vi.waitFor(() => expect(chromium.launch).toHaveBeenCalledTimes(2));
    } finally {
      finishLaunch.resolve();
      loadDependencies.mockRestore();
      responses = await calls;
    }
    expect(responses.every((response) => !response.error)).toBe(true);

    const failure = new Error('First browser could not close');
    sessions[0].browser.close.mockRejectedValueOnce(failure);
    const finishSecond = createDeferred<void>();
    sessions[1].browser.close.mockImplementationOnce(async () => {
      await finishSecond.promise;
      sessions[1].page.isClosed.mockReturnValue(true);
    });
    let settled = false;
    let reportedError: unknown;
    const cleanup = provider.cleanup();
    const observed = cleanup.then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        reportedError = error;
      },
    );
    try {
      await vi.waitFor(() => expect(sessions[1].browser.close).toHaveBeenCalledOnce());
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(sessions[1].page.isClosed()).toBe(false);

      finishSecond.resolve();
      await observed;
      expect(reportedError).toBe(failure);
      expect(sessions[1].page.isClosed()).toBe(true);
    } finally {
      finishSecond.resolve();
      await Promise.allSettled([cleanup, observed]);
      await provider.cleanup();
    }
    expect(sessions[0].page.isClosed()).toBe(true);
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it.each(['direct', 'evaluation', 'owned evaluation'] as const)(
    'rejects cancelled %s calls before manual cleanup finishes',
    async (mode) => {
      const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
      expect((await provider.callApi('seed')).error).toBeUndefined();
      const closing = createDeferred<void>();
      const originalClose = mockBrowser.close.getMockImplementation()!;
      mockBrowser.close.mockImplementationOnce(async () => {
        await closing.promise;
        await originalClose();
      });
      let cleanupFinished = false;
      const cleanup = provider.cleanup().then(() => {
        cleanupFinished = true;
      });
      const controller = new AbortController();
      const reason = new DOMException('Cancelled while cleanup was pending', 'AbortError');
      const run = () =>
        provider.callApi('cancelled', undefined, { abortSignal: controller.signal });
      const pending =
        mode === 'direct'
          ? run()
          : providerRegistry.withEvaluation(async () => {
              if (mode === 'owned evaluation') {
                await providerRegistry.cleanupWhenIdle([provider]);
                await providerRegistry.useProvider(provider, controller.signal);
              }
              return run();
            });
      const rejected = vi.fn();
      void pending.catch(rejected);
      try {
        controller.abort(reason);
        await vi.waitFor(() => expect(rejected).toHaveBeenCalledWith(reason));
        expect(cleanupFinished).toBe(false);
        expect(mockPage.isClosed()).toBe(false);
        expect(mockBrowser.newContext).toHaveBeenCalledOnce();
      } finally {
        closing.resolve();
        await Promise.allSettled([cleanup, pending]);
        await provider.cleanup();
      }
      expect(cleanupFinished).toBe(true);
      expect(mockBrowser.newContext).toHaveBeenCalledOnce();
      expect(providerRegistry.has(provider)).toBe(false);
    },
  );

  it.each(['first turn', 'reused turn'])(
    'resets the session after a %s action error',
    async (turn) => {
      const provider = new BrowserProvider('test', {
        config: {
          persistSession: true,
          steps: [{ ...createNavigateStep(), runOnce: true }, createPromptTypingStep()],
        },
      });
      if (turn === 'reused turn') {
        expect((await provider.callApi('one')).error).toBeUndefined();
      }
      mockPage.fill.mockRejectedValueOnce(new Error('Page action failed'));
      const failed = await provider.callApi('broken');
      expect(failed.error).toContain('Page action failed');
      expect(mockBrowser.close).toHaveBeenCalledOnce();
      expect(mockPage.isClosed()).toBe(true);

      mockPage = makePage();
      expect((await provider.callApi('retry')).error).toBeUndefined();
      expect(mockPage.goto).toHaveBeenCalledOnce();
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'retry');
    },
  );

  it('resets the session when the response transform returns an error', async () => {
    const transformResponse = vi
      .fn()
      .mockReturnValueOnce({ error: 'Response was rejected' })
      .mockReturnValueOnce({ output: 'recovered' });
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        steps: [{ ...createNavigateStep(), runOnce: true }],
        transformResponse,
      },
    });
    expect(await provider.callApi('one')).toEqual({ error: 'Response was rejected' });
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    mockPage = makePage();
    expect(await provider.callApi('two')).toEqual({ output: 'recovered' });
    expect(mockPage.goto).toHaveBeenCalledOnce();
  });

  it('preserves a transformed error response when connected context cleanup fails', async () => {
    const { chromium } = await import('playwright-extra');
    const context = await mockBrowser.newContext();
    context.close.mockRejectedValueOnce(new Error('Browser closed during context cleanup'));
    const connected = {
      contexts: vi.fn(() => []),
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connect).mockResolvedValueOnce(connected as never);
    const response = { error: 'Original target error', metadata: { target: 'evidence' } };
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        connectOptions: { mode: 'websocket', wsEndpoint: 'ws://localhost:9222' },
        steps: [],
        transformResponse: () => response,
      },
    });
    try {
      expect(await provider.callApi('test')).toEqual(response);
      expect(context.close).toHaveBeenCalled();
      expect(connected.close).toHaveBeenCalled();
    } finally {
      await provider.cleanup();
    }
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it('includes a just-started call in immediate cleanup', async () => {
    const { chromium } = await import('playwright-extra');
    const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
    const pending = provider.callApi('test');
    await provider.cleanup();
    expect((await pending).error).toContain('Browser session was closed during initialization');
    expect(chromium.launch).not.toHaveBeenCalled();
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it('closes a browser that finishes launching during cleanup', async () => {
    const { chromium } = await import('playwright-extra');
    const launch = createDeferred<Awaited<ReturnType<typeof chromium.launch>>>();
    vi.mocked(chromium.launch).mockReturnValueOnce(launch.promise);
    const provider = new BrowserProvider('test', { config: { persistSession: true, steps: [] } });
    const pending = provider.callApi('test');
    await vi.waitFor(() => expect(chromium.launch).toHaveBeenCalled());
    expect(providerRegistry.has(provider)).toBe(true);
    const cleanup = provider.cleanup();
    launch.resolve(mockBrowser as unknown as Awaited<ReturnType<typeof chromium.launch>>);
    await cleanup;
    expect((await pending).error).toContain('Browser session was closed during initialization');
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(mockBrowser.newContext).not.toHaveBeenCalled();
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it('closes an owned context when page creation fails in a connected browser', async () => {
    const context = await mockBrowser.newContext();
    context.newPage.mockRejectedValueOnce(new Error('Cannot create page'));
    const { chromium } = await import('playwright-extra');
    const connected = {
      contexts: vi.fn(() => []),
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn(),
    };
    vi.mocked(chromium.connect).mockResolvedValueOnce(connected as never);
    const provider = new BrowserProvider('test', {
      config: {
        persistSession: true,
        steps: [],
        connectOptions: { mode: 'websocket', wsEndpoint: 'ws://localhost:9222' },
      },
    });
    expect((await provider.callApi('test')).error).toContain('Cannot create page');
    expect(context.close).toHaveBeenCalledOnce();
    expect(connected.close).toHaveBeenCalledOnce();
    expect(providerRegistry.has(provider)).toBe(false);
  });

  it.each([true, false])(
    'cleans up only owned resources in a connected browser (existing context: %s)',
    async (existing) => {
      const context = await mockBrowser.newContext();
      mockBrowser.newContext.mockClear();
      const { chromium } = await import('playwright-extra');
      const connected = {
        contexts: vi.fn(() => (existing ? [context] : [])),
        newContext: vi.fn().mockResolvedValue(context),
        close: vi.fn(),
      };
      vi.mocked(chromium.connect).mockResolvedValueOnce(connected as never);
      const provider = new BrowserProvider('test', {
        config: {
          persistSession: true,
          steps: [],
          connectOptions: { mode: 'websocket', wsEndpoint: 'ws://localhost:9222' },
        },
      });
      expect((await provider.callApi('one')).error).toBeUndefined();
      await provider.cleanup();
      expect(connected.close).toHaveBeenCalledOnce();
      expect(context.close).toHaveBeenCalledTimes(existing ? 0 : 1);
      expect(mockPage.close).toHaveBeenCalledOnce();
      expect(mockPage.isClosed()).toBe(true);
    },
  );
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
        steps: [createNavigateStep()],
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

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

    await provider.callApi('test');

    expect(mockExistingBrowser.contexts).toHaveBeenCalled();
    expect(mockExistingBrowser.newContext).not.toHaveBeenCalled();
  });

  it('disconnects a connected client without closing the existing context', async () => {
    const { chromium } = await import('playwright-extra');
    const mockCloseFn = vi.fn();
    const mockPageClose = vi.fn();
    const sharedContextClose = vi.fn();

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
          close: sharedContextClose,
        },
      ]),
      newContext: vi.fn(),
      close: mockCloseFn,
    };

    (chromium.connectOverCDP as Mock).mockImplementationOnce(function () {
      return Promise.resolve(mockConnectedBrowser);
    });

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

    await provider.callApi('test');

    expect(mockPageClose).toHaveBeenCalled();
    expect(mockCloseFn).toHaveBeenCalledOnce();
    expect(sharedContextClose).not.toHaveBeenCalled();
  });

  it('should handle connection failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

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

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

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

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
  });

  it('should handle network timeouts when connecting to Chrome', async () => {
    // Simulate timeout
    const timeoutError = new Error('Request timed out after 5000ms');
    mockFetch.mockRejectedValue(timeoutError);

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    // The error will be wrapped in the standard Chrome connection error message
    expect(result.error).toContain('Make sure Chrome is running');
  });

  it('should handle ECONNREFUSED errors specifically', async () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:9222');
    (connError as any).code = 'ECONNREFUSED';
    mockFetch.mockRejectedValue(connError);

    const provider = new BrowserProvider('test', createDebugBrowserOptions());

    const result = await provider.callApi('test');

    expect(result.error).toContain('Cannot connect to Chrome');
    expect(result.error).toContain('Make sure Chrome is running');
  });
});
