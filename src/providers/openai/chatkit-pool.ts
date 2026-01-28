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
 *   - Shared HTTP server with per-workflow template routing
 *   - Pages are workflow-specific (different workflows get different pages)
 */

import * as http from 'http';

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import logger from '../../logger';
import { providerRegistry } from '../providerRegistry';

// Pool configuration constants
const CHATKIT_READY_TIMEOUT_MS = 60000;
const PAGE_REFRESH_TIMEOUT_MS = 60000;
const PAGE_ACQUIRE_TIMEOUT_MS = 120000;
const IDLE_SHUTDOWN_DELAY_MS = 5000; // Shutdown pool if idle for this long

interface PooledPage {
  context: BrowserContext;
  page: Page;
  ready: boolean;
  inUse: boolean;
  templateKey: string; // Which workflow template this page is configured for
}

interface ChatKitPoolConfig {
  maxConcurrency: number;
  headless: boolean;
  serverPort?: number;
}

/**
 * Singleton browser pool for ChatKit evaluations.
 * Supports high concurrency by reusing browser contexts.
 * Each workflow gets its own isolated pages via template routing.
 */
export class ChatKitBrowserPool {
  private static instance: ChatKitBrowserPool | null = null;
  private static cleanupRegistered: boolean = false;

  private browser: Browser | null = null;
  private server: http.Server | null = null;
  private serverPort: number = 0;
  private pages: PooledPage[] = [];
  private waitQueue: Array<{ templateKey: string; resolve: (page: PooledPage) => void }> = [];
  private config: ChatKitPoolConfig;
  private templates: Map<string, string> = new Map(); // templateKey -> HTML
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
    // Note: SIGINT/SIGTERM handlers intentionally omitted.
    // Cleanup happens via 'exit' handler above. Direct process.exit() calls
    // bypass shutdownGracefully() in main.ts, causing WAL corruption issues.
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

      // Register with providerRegistry for cleanup at end of evaluation
      // This is cleaner than relying only on process exit handlers
      const instance = ChatKitBrowserPool.instance;
      providerRegistry.register({
        async shutdown() {
          if (instance) {
            await instance.shutdown();
            ChatKitBrowserPool.instance = null;
          }
        },
      });
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
   * Generate a template key from workflow configuration.
   * This ensures different workflows get isolated pages.
   */
  static generateTemplateKey(workflowId: string, version?: string, userId?: string): string {
    // Use a simple concatenation - workflowId is the primary differentiator
    // version and userId are included for completeness but workflowId is key
    return `${workflowId}:${version || 'default'}:${userId || 'default'}`;
  }

  /**
   * Register a template for a workflow configuration
   */
  setTemplate(templateKey: string, html: string): void {
    const existing = this.templates.get(templateKey);
    if (existing !== html) {
      this.templates.set(templateKey, html);
      logger.debug('[ChatKitPool] Registered template', { templateKey });
      // Mark pages with this template as needing refresh if template changed
      for (const page of this.pages) {
        if (page.templateKey === templateKey) {
          page.ready = false;
        }
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
    if (this.initPromise != null) {
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

    // Create shared HTTP server with per-template routing
    this.server = http.createServer((req, res) => {
      // Extract template key from URL path: /template/<key>
      const url = new URL(req.url || '/', `http://localhost`);
      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts[0] === 'template' && pathParts[1]) {
        const templateKey = decodeURIComponent(pathParts[1]);
        const template = this.templates.get(templateKey);

        if (template) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(template);
          return;
        }
      }

      // Fallback: 404 for unknown templates
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Template not found');
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
   * Acquire a page from the pool for a specific template.
   * Only returns pages configured for the requested template.
   * Blocks if all pages are in use.
   */
  async acquirePage(templateKey: string): Promise<PooledPage> {
    // Cancel any pending idle shutdown since we're being used
    this.cancelIdleTimer();

    await this.initialize();

    // Ensure template is registered
    if (!this.templates.has(templateKey)) {
      throw new Error(`Template not registered: ${templateKey}. Call setTemplate first.`);
    }

    // Try to find an available ready page with matching template
    const available = this.pages.find((p) => !p.inUse && p.ready && p.templateKey === templateKey);
    if (available) {
      available.inUse = true;
      logger.debug('[ChatKitPool] Acquired existing page', {
        templateKey,
        poolSize: this.pages.length,
      });
      return available;
    }

    // Try to find an idle page with matching template that needs refresh
    const needsRefresh = this.pages.find(
      (p) => !p.inUse && !p.ready && p.templateKey === templateKey,
    );
    if (needsRefresh) {
      await this.refreshPooledPage(needsRefresh);
      needsRefresh.inUse = true;
      logger.debug('[ChatKitPool] Acquired and refreshed page', {
        templateKey,
        poolSize: this.pages.length,
      });
      return needsRefresh;
    }

    // Create new page if under limit
    if (this.pages.length < this.config.maxConcurrency) {
      const pooledPage = await this.createPooledPage(templateKey);
      pooledPage.inUse = true;
      this.pages.push(pooledPage);
      logger.debug('[ChatKitPool] Created new page', {
        templateKey,
        poolSize: this.pages.length,
      });
      return pooledPage;
    }

    // Wait for a page with matching template to become available
    logger.debug('[ChatKitPool] Waiting for available page', {
      templateKey,
      poolSize: this.pages.length,
      waiting: this.waitQueue.length + 1,
    });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex((w) => w.resolve === wrappedResolve);
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

      this.waitQueue.push({ templateKey, resolve: wrappedResolve });
    });
  }

  /**
   * Release a page back to the pool
   */
  async releasePage(pooledPage: PooledPage): Promise<void> {
    const originalTemplateKey = pooledPage.templateKey;

    // Keep inUse=true during refresh to prevent race conditions
    // Reset the page for next use by reloading
    try {
      await this.refreshPooledPage(pooledPage);
    } catch (error) {
      logger.warn('[ChatKitPool] Failed to reset page, recreating', { error });
      // Page is broken, remove it from the pool
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
        const newPage = await this.createPooledPage(originalTemplateKey);
        this.pages.push(newPage);
        pooledPage = newPage;
      } catch (createError) {
        logger.warn('[ChatKitPool] Failed to create replacement page', { error: createError });
        // Pool size is now reduced - try to serve any waiting requests by creating pages for them
        // This prevents deadlock when all pages fail
        await this.tryServeWaiters();
        this.scheduleIdleShutdown();
        return;
      }
    }

    // If someone is waiting for this template, give them the page directly
    const waiterIndex = this.waitQueue.findIndex((w) => w.templateKey === pooledPage.templateKey);
    if (waiterIndex >= 0) {
      const waiter = this.waitQueue.splice(waiterIndex, 1)[0];
      pooledPage.inUse = true;
      waiter.resolve(pooledPage);
      this.cancelIdleTimer();
    } else {
      // No one waiting for this template, mark as available
      pooledPage.inUse = false;
      // Check if we can serve waiters for other templates now that we have capacity
      await this.tryServeWaiters();
      this.scheduleIdleShutdown();
    }
  }

  /**
   * Try to serve waiting requests by creating new pages if we have capacity
   */
  private async tryServeWaiters(): Promise<void> {
    // Process waiters while we have capacity and waiters exist
    while (this.waitQueue.length > 0 && this.pages.length < this.config.maxConcurrency) {
      const waiter = this.waitQueue.shift();
      if (!waiter) {
        break;
      }

      try {
        const newPage = await this.createPooledPage(waiter.templateKey);
        newPage.inUse = true;
        this.pages.push(newPage);
        waiter.resolve(newPage);
        logger.debug('[ChatKitPool] Created page for waiting request', {
          templateKey: waiter.templateKey,
          poolSize: this.pages.length,
          remainingWaiters: this.waitQueue.length,
        });
      } catch (error) {
        logger.warn('[ChatKitPool] Failed to create page for waiter', {
          templateKey: waiter.templateKey,
          error,
        });
        // Put waiter back at the front of the queue to retry later
        this.waitQueue.unshift(waiter);
        break;
      }
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
   * Create a new pooled page with ChatKit initialized for a specific template
   */
  private async createPooledPage(templateKey: string): Promise<PooledPage> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: 800, height: 600 },
    });
    // Set longer default timeout to prevent Playwright's 30s default from interfering
    context.setDefaultTimeout(120000);

    try {
      const page = await context.newPage();

      // Navigate to the template-specific URL
      const templateUrl = `http://localhost:${this.serverPort}/template/${encodeURIComponent(templateKey)}`;
      await page.goto(templateUrl, {
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
        templateKey,
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
    logger.debug('[ChatKitPool] Refreshing page', { timeout: PAGE_REFRESH_TIMEOUT_MS });
    await pooledPage.page.reload({ waitUntil: 'domcontentloaded' });
    await pooledPage.page.waitForFunction(() => (window as any).__state?.ready === true, {
      timeout: PAGE_REFRESH_TIMEOUT_MS,
    });
    pooledPage.ready = true;
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; inUse: number; waiting: number; templates: number } {
    return {
      total: this.pages.length,
      inUse: this.pages.filter((p) => p.inUse).length,
      waiting: this.waitQueue.length,
      templates: this.templates.size,
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
    this.templates.clear();
    logger.debug('[ChatKitPool] Shutdown complete');
  }
}
