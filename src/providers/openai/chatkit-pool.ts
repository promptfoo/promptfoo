/**
 * ChatKit Browser Pool
 *
 * Manages a pool of browser contexts for concurrent ChatKit evaluations.
 * This significantly reduces resource usage compared to spawning separate
 * browsers for each test.
 *
 * Architecture:
 *   - Single browser process (shared across all tests)
 *   - Multiple browser contexts (isolated like incognito windows)
 *   - Shared HTTP server (single port for all contexts)
 *   - Pre-warmed pages (ChatKit ready before test starts)
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as http from 'http';
import logger from '../../logger';

interface PooledPage {
  context: BrowserContext;
  page: Page;
  ready: boolean;
  inUse: boolean;
  templateVersion: number;
}

interface ChatKitPoolConfig {
  maxConcurrency: number;
  headless: boolean;
  serverPort?: number;
}

/**
 * Singleton browser pool for ChatKit evaluations.
 * Supports high concurrency by reusing browser contexts.
 */
export class ChatKitBrowserPool {
  private static instance: ChatKitBrowserPool | null = null;

  private browser: Browser | null = null;
  private server: http.Server | null = null;
  private serverPort: number = 0;
  private pages: PooledPage[] = [];
  private waitQueue: Array<(page: PooledPage) => void> = [];
  private config: ChatKitPoolConfig;
  private htmlTemplate: string = '';
  private templateVersion: number = 0;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor(config: ChatKitPoolConfig) {
    this.config = config;
  }

  /**
   * Get the singleton pool instance
   */
  static getInstance(config?: Partial<ChatKitPoolConfig>): ChatKitBrowserPool {
    if (!ChatKitBrowserPool.instance) {
      ChatKitBrowserPool.instance = new ChatKitBrowserPool({
        maxConcurrency: config?.maxConcurrency ?? 4,
        headless: config?.headless ?? true,
        serverPort: config?.serverPort ?? 0,
      });
    }
    return ChatKitBrowserPool.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (ChatKitBrowserPool.instance) {
      ChatKitBrowserPool.instance.shutdown().catch((err) => {
        logger.debug('[ChatKitPool] Error during shutdown:', { error: String(err) });
      });
      ChatKitBrowserPool.instance = null;
    }
  }

  /**
   * Set the HTML template for ChatKit pages
   */
  setHtmlTemplate(html: string): void {
    if (html !== this.htmlTemplate) {
      this.htmlTemplate = html;
      this.templateVersion += 1;
      // Mark pages as needing refresh to ensure new template is loaded
      for (const page of this.pages) {
        page.ready = false;
      }
    }
  }

  /**
   * Initialize the pool - launches browser and creates server
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Prevent multiple concurrent initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initPromise = null;
  }

  private async doInitialize(): Promise<void> {
    logger.debug('[ChatKitPool] Initializing browser pool', {
      maxConcurrency: this.config.maxConcurrency,
    });

    // Create shared HTTP server
    this.server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.htmlTemplate);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.serverPort, () => {
        const address = this.server!.address();
        this.serverPort = typeof address === 'object' ? address?.port || 0 : 0;
        logger.debug('[ChatKitPool] Server started', { port: this.serverPort });
        resolve();
      });
    });

    // Launch single browser
    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Executable doesn't exist")) {
        throw new Error('Playwright browser not installed. Run: npx playwright install chromium');
      }
      throw error;
    }

    this.initialized = true;
    logger.debug('[ChatKitPool] Browser pool initialized');
  }

  /**
   * Acquire a page from the pool. Blocks if all pages are in use.
   */
  async acquirePage(): Promise<PooledPage> {
    await this.initialize();

    // Try to find an available page
    const available = this.pages.find((p) => !p.inUse && p.ready);
    if (available) {
      // Ensure the page matches the current template/configuration
      if (available.templateVersion !== this.templateVersion) {
        await this.refreshPooledPage(available);
      }

      available.inUse = true;
      logger.debug('[ChatKitPool] Acquired existing page', {
        poolSize: this.pages.length,
      });
      return available;
    }

    // Create new page if under limit
    if (this.pages.length < this.config.maxConcurrency) {
      const pooledPage = await this.createPooledPage();
      pooledPage.inUse = true;
      this.pages.push(pooledPage);
      logger.debug('[ChatKitPool] Created new page', {
        poolSize: this.pages.length,
      });
      return pooledPage;
    }

    // Wait for a page to become available
    logger.debug('[ChatKitPool] Waiting for available page', {
      poolSize: this.pages.length,
      waiting: this.waitQueue.length + 1,
    });

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a page back to the pool
   */
  async releasePage(pooledPage: PooledPage): Promise<void> {
    pooledPage.inUse = false;

    // Reset the page for next use by reloading
    try {
      await this.refreshPooledPage(pooledPage);
    } catch (error) {
      logger.warn('[ChatKitPool] Failed to reset page, recreating', { error });
      // Page is broken, remove and recreate
      const index = this.pages.indexOf(pooledPage);
      if (index >= 0) {
        this.pages.splice(index, 1);
      }
      try {
        await pooledPage.context.close();
      } catch {
        // Ignore close errors
      }

      // Create replacement
      const newPage = await this.createPooledPage();
      this.pages.push(newPage);
      pooledPage = newPage;
    }

    // If someone is waiting, give them the page
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      pooledPage.inUse = true;
      waiter(pooledPage);
    }
  }

  /**
   * Create a new pooled page with ChatKit initialized
   */
  private async createPooledPage(): Promise<PooledPage> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: 800, height: 600 },
    });

    const page = await context.newPage();

    // Navigate and wait for ChatKit ready
    await page.goto(`http://localhost:${this.serverPort}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(() => (window as any).__state?.ready === true, {
      timeout: 60000,
    });

    return {
      context,
      page,
      ready: true,
      inUse: false,
      templateVersion: this.templateVersion,
    };
  }

  private async refreshPooledPage(pooledPage: PooledPage): Promise<void> {
    await pooledPage.page.reload({ waitUntil: 'domcontentloaded' });
    await pooledPage.page.waitForFunction(() => (window as any).__state?.ready === true, {
      timeout: 30000,
    });
    pooledPage.templateVersion = this.templateVersion;
    pooledPage.ready = true;
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; inUse: number; waiting: number } {
    return {
      total: this.pages.length,
      inUse: this.pages.filter((p) => p.inUse).length,
      waiting: this.waitQueue.length,
    };
  }

  /**
   * Shutdown the pool and release all resources
   */
  async shutdown(): Promise<void> {
    logger.debug('[ChatKitPool] Shutting down');

    // Close all contexts
    for (const pooledPage of this.pages) {
      try {
        await pooledPage.context.close();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.pages = [];

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore errors
      }
      this.browser = null;
    }

    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.initialized = false;
    logger.debug('[ChatKitPool] Shutdown complete');
  }
}
