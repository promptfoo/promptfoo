import { ChatKitBrowserPool } from '../../../src/providers/openai/chatkit-pool';

// Create mocks inside the factory to avoid hoisting issues
jest.mock('playwright', () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForFunction: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser),
    },
    __mockPage: mockPage,
    __mockContext: mockContext,
    __mockBrowser: mockBrowser,
  };
});

// Mock http server
jest.mock('http', () => ({
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn((_port: number, callback: () => void) => callback()),
    address: jest.fn().mockReturnValue({ port: 3000 }),
    close: jest.fn(),
    once: jest.fn(), // Error handler registration
  }),
}));

// Get the mocked objects for assertions
const getMocks = () => {
  const playwright = require('playwright');
  return {
    mockPage: playwright.__mockPage,
    mockContext: playwright.__mockContext,
    mockBrowser: playwright.__mockBrowser,
    chromium: playwright.chromium,
  };
};

describe('ChatKitBrowserPool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton between tests
    ChatKitBrowserPool.resetInstance();
  });

  afterEach(async () => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    jest.clearAllMocks();
    // Ensure clean state after each test
    ChatKitBrowserPool.resetInstance();
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

  describe('setHtmlTemplate', () => {
    it('should store the HTML template', () => {
      const instance = ChatKitBrowserPool.getInstance();
      const html = '<html><body>Test</body></html>';

      instance.setHtmlTemplate(html);

      expect((instance as any).htmlTemplate).toBe(html);
    });
  });

  describe('initialize', () => {
    it('should start HTTP server and launch browser', async () => {
      const { mockBrowser } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      await instance.initialize();

      expect((instance as any).initialized).toBe(true);
      expect((instance as any).browser).toBe(mockBrowser);
      expect((instance as any).server).not.toBeNull();
    });

    it('should not reinitialize if already initialized', async () => {
      const { chromium } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      await instance.initialize();
      await instance.initialize();

      // Should only launch browser once
      expect(chromium.launch).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization calls', async () => {
      const { chromium } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      // Multiple concurrent initialize calls
      await Promise.all([instance.initialize(), instance.initialize(), instance.initialize()]);

      // Should still only launch browser once
      expect(chromium.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('acquirePage', () => {
    it('should create a new page when pool is empty', async () => {
      const { mockPage, mockContext } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      const pooledPage = await instance.acquirePage();

      expect(pooledPage).toBeDefined();
      expect(pooledPage.page).toBe(mockPage);
      expect(pooledPage.context).toBe(mockContext);
      expect(pooledPage.inUse).toBe(true);
      expect(pooledPage.ready).toBe(true);
    });

    it('should reuse existing page when available', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 2 });
      instance.setHtmlTemplate('<html>test</html>');

      const page1 = await instance.acquirePage();
      await instance.releasePage(page1);

      const page2 = await instance.acquirePage();

      // Should reuse the same page
      expect(page2).toBe(page1);
    });

    it('should create multiple pages up to maxConcurrency', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setHtmlTemplate('<html>test</html>');

      const pages = await Promise.all([
        instance.acquirePage(),
        instance.acquirePage(),
        instance.acquirePage(),
      ]);

      expect(pages.length).toBe(3);
      expect(instance.getStats().total).toBe(3);
      expect(instance.getStats().inUse).toBe(3);
    });
  });

  describe('releasePage', () => {
    it('should mark page as not in use', async () => {
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      const pooledPage = await instance.acquirePage();
      expect(pooledPage.inUse).toBe(true);

      await instance.releasePage(pooledPage);
      expect(pooledPage.inUse).toBe(false);
    });

    it('should reload page for fresh state', async () => {
      const { mockPage } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      const pooledPage = await instance.acquirePage();
      await instance.releasePage(pooledPage);

      expect(mockPage.reload).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
    });

    it('should handle multiple acquire/release cycles', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 1 });
      instance.setHtmlTemplate('<html>test</html>');

      // First acquire
      const page1 = await instance.acquirePage();
      expect(page1.inUse).toBe(true);
      expect(instance.getStats().inUse).toBe(1);

      // Release
      await instance.releasePage(page1);
      expect(page1.inUse).toBe(false);

      // Acquire again - should get the same page
      const page2 = await instance.acquirePage();
      expect(page2).toBe(page1);
      expect(page2.inUse).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return accurate pool statistics', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setHtmlTemplate('<html>test</html>');

      expect(instance.getStats()).toEqual({ total: 0, inUse: 0, waiting: 0 });

      const page1 = await instance.acquirePage();
      expect(instance.getStats()).toEqual({ total: 1, inUse: 1, waiting: 0 });

      const _page2 = await instance.acquirePage();
      expect(instance.getStats()).toEqual({ total: 2, inUse: 2, waiting: 0 });

      await instance.releasePage(page1);
      expect(instance.getStats()).toEqual({ total: 2, inUse: 1, waiting: 0 });
    });
  });

  describe('shutdown', () => {
    it('should close all contexts and browser', async () => {
      const { mockContext, mockBrowser } = getMocks();
      const instance = ChatKitBrowserPool.getInstance();
      instance.setHtmlTemplate('<html>test</html>');

      await instance.acquirePage();
      await instance.shutdown();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect((instance as any).initialized).toBe(false);
      expect((instance as any).browser).toBeNull();
    });

    it('should clear all pages from pool', async () => {
      const instance = ChatKitBrowserPool.getInstance({ maxConcurrency: 3 });
      instance.setHtmlTemplate('<html>test</html>');

      await Promise.all([instance.acquirePage(), instance.acquirePage(), instance.acquirePage()]);

      expect(instance.getStats().total).toBe(3);

      await instance.shutdown();

      expect(instance.getStats().total).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw helpful error when Playwright not installed', async () => {
      const { chromium } = getMocks();
      chromium.launch.mockRejectedValueOnce(
        new Error("Executable doesn't exist at /path/to/browser"),
      );

      ChatKitBrowserPool.resetInstance();

      const newInstance = ChatKitBrowserPool.getInstance();
      newInstance.setHtmlTemplate('<html>test</html>');

      await expect(newInstance.initialize()).rejects.toThrow('Playwright browser not installed');
    });
  });
});
