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

// Pool configuration constants
const CHATKIT_READY_TIMEOUT_MS = 60000;
const PAGE_REFRESH_TIMEOUT_MS = 30000;
const PAGE_ACQUIRE_TIMEOUT_MS = 120000;
const IDLE_SHUTDOWN_DELAY_MS = 5000; // Shutdown pool if idle for this long

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
  private static cleanupRegistered: boolean = false;

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
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(config: ChatKitPoolConfig) {
    this.config = config;
  }

  /**
   * Register process exit handlers to clean up browser resources
   */
  private static registerCleanupHandlers(): void {
    if (ChatKitBrowserPool.cleanupRegistered) {
      return;
    }
    ChatKitBrowserPool.cleanupRegistered = true;

    const cleanup = () => {
      if (ChatKitBrowserPool.instance) {
        // Synchronous cleanup - close browser immediately
        ChatKitBrowserPool.instance.shutdown().catch(() => {});
        ChatKitBrowserPool.instance = null;
      }
    };

    // beforeExit fires when event loop is empty - allows cleanup of browser
    // which otherwise keeps the event loop alive
    process.on('beforeExit', () => {
      if (ChatKitBrowserPool.instance) {
        ChatKitBrowserPool.instance.shutdown().catch(() => {});
        ChatKitBrowserPool.instance = null;
      }
    });

    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(143);
    });
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
      ChatKitBrowserPool.registerCleanupHandlers();
    } else if (config) {
      // Warn if different config is requested for existing instance
      const existing = ChatKitBrowserPool.instance.config;
      if (
        (config.maxConcurrency !== undefined &&
          config.maxConcurrency !== existing.maxConcurrency) ||
        (config.headless !== undefined && config.headless !== existing.headless)
      ) {
        logger.warn(
          '[ChatKitPool] Pool already exists with different config, ignoring new config',
          {
            existing: { maxConcurrency: existing.maxConcurrency, headless: existing.headless },
            requested: { maxConcurrency: config.maxConcurrency, headless: config.headless },
          },
        );
      }
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
    // Don't reset cleanupRegistered - process handlers should only be registered once
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

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Failed to start ChatKit pool server: ${err.message}`));
      });
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
    // Cancel any pending idle shutdown since we're being used
    this.cancelIdleTimer();

    await this.initialize();

    // Try to find an available ready page
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

    // Try to find an idle page that needs refresh (handles template change while pool is full)
    const needsRefresh = this.pages.find((p) => !p.inUse && !p.ready);
    if (needsRefresh) {
      await this.refreshPooledPage(needsRefresh);
      needsRefresh.inUse = true;
      logger.debug('[ChatKitPool] Acquired and refreshed page', {
        poolSize: this.pages.length,
      });
      return needsRefresh;
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

    // Wait for a page to become available with timeout
    logger.debug('[ChatKitPool] Waiting for available page', {
      poolSize: this.pages.length,
      waiting: this.waitQueue.length + 1,
    });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.indexOf(wrappedResolve);
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
        reject(
          new Error(
            `Timeout waiting for available page after ${PAGE_ACQUIRE_TIMEOUT_MS}ms. ` +
              `Pool has ${this.pages.length} pages, ${this.pages.filter((p) => p.inUse).length} in use.`,
          ),
        );
      }, PAGE_ACQUIRE_TIMEOUT_MS);

      const wrappedResolve = (page: PooledPage) => {
        clearTimeout(timeoutId);
        resolve(page);
      };

      this.waitQueue.push(wrappedResolve);
    });
  }

  /**
   * Release a page back to the pool
   */
  async releasePage(pooledPage: PooledPage): Promise<void> {
    // Keep inUse=true during refresh to prevent race conditions
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

      // Create replacement - if this fails, we just reduce pool size
      // The pool will recover by creating new pages on demand
      try {
        const newPage = await this.createPooledPage();
        this.pages.push(newPage);
        pooledPage = newPage;
      } catch (createError) {
        logger.warn('[ChatKitPool] Failed to create replacement page', { error: createError });
        // Pool size is now reduced, but will recover on next acquirePage
        // If someone is waiting, they'll timeout via PAGE_ACQUIRE_TIMEOUT_MS
        this.scheduleIdleShutdown();
        return;
      }
    }

    // If someone is waiting, give them the page directly (keep inUse=true)
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      pooledPage.inUse = true;
      waiter(pooledPage);
      this.cancelIdleTimer();
    } else {
      // No one waiting, mark as available
      pooledPage.inUse = false;
      this.scheduleIdleShutdown();
    }
  }

  /**
   * Schedule automatic shutdown if pool remains idle
   */
  private scheduleIdleShutdown(): void {
    // Cancel any existing timer
    this.cancelIdleTimer();

    // Check if pool is completely idle (no pages in use, no waiters)
    const inUseCount = this.pages.filter((p) => p.inUse).length;
    if (inUseCount === 0 && this.waitQueue.length === 0 && this.pages.length > 0) {
      logger.debug('[ChatKitPool] Pool idle, scheduling shutdown', {
        delay: IDLE_SHUTDOWN_DELAY_MS,
      });

      this.idleTimer = setTimeout(() => {
        // Double-check still idle
        const stillInUse = this.pages.filter((p) => p.inUse).length;
        if (stillInUse === 0 && this.waitQueue.length === 0) {
          logger.debug('[ChatKitPool] Auto-shutting down idle pool');
          this.shutdown().catch((err) => {
            logger.debug('[ChatKitPool] Error during idle shutdown', { error: String(err) });
          });
          ChatKitBrowserPool.instance = null;
        }
      }, IDLE_SHUTDOWN_DELAY_MS);

      // Don't let the timer prevent process exit
      if (this.idleTimer.unref) {
        this.idleTimer.unref();
      }
    }
  }

  /**
   * Cancel scheduled idle shutdown
   */
  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
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

    try {
      const page = await context.newPage();

      // Navigate and wait for ChatKit ready
      await page.goto(`http://localhost:${this.serverPort}`, {
        waitUntil: 'domcontentloaded',
      });

      await page.waitForFunction(() => (window as any).__state?.ready === true, {
        timeout: CHATKIT_READY_TIMEOUT_MS,
      });

      return {
        context,
        page,
        ready: true,
        inUse: false,
        templateVersion: this.templateVersion,
      };
    } catch (error) {
      // Clean up context if page creation/initialization fails
      try {
        await context.close();
      } catch {
        // Ignore close errors
      }
      throw error;
    }
  }

  private async refreshPooledPage(pooledPage: PooledPage): Promise<void> {
    await pooledPage.page.reload({ waitUntil: 'domcontentloaded' });
    await pooledPage.page.waitForFunction(() => (window as any).__state?.ready === true, {
      timeout: PAGE_REFRESH_TIMEOUT_MS,
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

    // Cancel any pending idle timer
    this.cancelIdleTimer();

    // Clear pending waiters - they will timeout via PAGE_ACQUIRE_TIMEOUT_MS
    if (this.waitQueue.length > 0) {
      logger.debug('[ChatKitPool] Clearing pending waiters', { count: this.waitQueue.length });
      this.waitQueue = [];
    }

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
    this.templateVersion = 0;
    logger.debug('[ChatKitPool] Shutdown complete');
  }
}
