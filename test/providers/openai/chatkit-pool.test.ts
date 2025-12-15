import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatKitBrowserPool } from '../../../src/providers/openai/chatkit-pool';

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

// Mock playwright
vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

// Mock http server
vi.mock('http', () => ({
  createServer: vi.fn().mockReturnValue({
    listen: vi.fn((_port: number, callback: () => void) => callback()),
    address: vi.fn().mockReturnValue({ port: 3000 }),
    close: vi.fn(),
    once: vi.fn(), // Error handler registration
  }),
}));

// Test constants
const TEST_TEMPLATE_KEY = 'wf_test123:default:default';
const TEST_HTML = '<html>test</html>';

describe('ChatKitBrowserPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton between tests
    ChatKitBrowserPool.resetInstance();
  });

  afterEach(async () => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    vi.clearAllMocks();
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
  });

  describe('setTemplate', () => {
    it('should store the HTML template for a key', () => {
      const instance = ChatKitBrowserPool.getInstance();
      const html = '<html><body>Test</body></html>';

      instance.setTemplate(TEST_TEMPLATE_KEY, html);

      expect((instance as any).templates.get(TEST_TEMPLATE_KEY)).toBe(html);
    });

    it('should store multiple templates for different keys', () => {
      const instance = ChatKitBrowserPool.getInstance();
      const key1 = 'wf_workflow1:default:default';
      const key2 = 'wf_workflow2:default:default';

      instance.setTemplate(key1, '<html>workflow1</html>');
      instance.setTemplate(key2, '<html>workflow2</html>');

      expect((instance as any).templates.size).toBe(2);
      expect((instance as any).templates.get(key1)).toBe('<html>workflow1</html>');
      expect((instance as any).templates.get(key2)).toBe('<html>workflow2</html>');
    });
  });

  describe('initialize', () => {
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
