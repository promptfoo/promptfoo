/**
 * OpenAI ChatKit Provider
 *
 * Evaluates ChatKit workflows deployed via Agent Builder using Playwright
 * to interact with the ChatKit web component.
 *
 * ChatKit workflows created in OpenAI's Agent Builder don't expose a direct
 * REST API for sending messages. Instead, they require interaction through
 * the ChatKit web component, which this provider automates using Playwright.
 *
 * Prerequisites:
 *   - Playwright installed: npm install playwright && npx playwright install chromium
 *   - OPENAI_API_KEY environment variable set
 *
 * Usage:
 *   providers:
 *     - id: openai:chatkit:wf_68ffb83dbfc88190a38103c2bb9f421003f913035dbdb131
 *       config:
 *         version: '3'           # Optional: workflow version
 *         timeout: 120000        # Optional: response timeout in ms (default: 120000)
 *         headless: true         # Optional: run browser headless (default: true)
 *
 * Performance Notes:
 *   - Each evaluation spawns a browser instance, so it's slower than REST APIs
 *   - For reliable results, use --max-concurrency 1 to avoid resource contention
 *   - First test may be slower due to browser launch and ChatKit initialization
 *
 * Troubleshooting:
 *   - "Playwright not found": Run `npx playwright install chromium`
 *   - Timeout errors: Increase timeout config or use --max-concurrency 1
 *   - Empty responses: The workflow may not generate text for some inputs
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as http from 'http';
import logger from '../../logger';
import { OpenAiGenericProvider } from './index';
import { ChatKitBrowserPool } from './chatkit-pool';
import type { OpenAiChatKitOptions } from './chatkit-types';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';

// Configuration constants
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_APPROVALS = 5;
const DEFAULT_POOL_SIZE = 4;
const CHATKIT_READY_TIMEOUT_MS = 60000;
const DOM_SETTLE_DELAY_MS = 2000;
const APPROVAL_PROCESS_DELAY_MS = 500;
const APPROVAL_CLICK_DELAY_MS = 1000;
const RESPONSE_EXTRACT_RETRY_DELAY_MS = 500;
// Note: MIN_RESPONSE_LENGTH (20), MIN_MESSAGE_LENGTH (30), MAX_INIT_ATTEMPTS (100),
// and INIT_POLL_INTERVAL_MS (100) are hardcoded in the HTML template string
// and in DOM evaluation functions where constants cannot be easily passed.

/**
 * Check if a URL is from OpenAI's CDN by parsing the hostname.
 * This is more secure than substring matching which could be bypassed.
 */
function isOpenAICdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'cdn.platform.openai.com';
  } catch {
    return false;
  }
}

/**
 * Validate workflowId format to prevent script injection
 */
function validateWorkflowId(workflowId: string): void {
  if (!workflowId || !/^wf_[a-zA-Z0-9]+$/.test(workflowId)) {
    throw new Error(`Invalid workflowId format: ${workflowId}. Expected format: wf_<alphanumeric>`);
  }
}

/**
 * Validate version format to prevent script injection
 */
function validateVersion(version: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(version)) {
    throw new Error(
      `Invalid version format: ${version}. Only alphanumeric, dot, dash, and underscore allowed.`,
    );
  }
}

/**
 * Generate the HTML page that hosts the ChatKit component
 */
function generateChatKitHTML(apiKey: string, workflowId: string, version?: string): string {
  // Validate inputs to prevent script injection
  validateWorkflowId(workflowId);
  if (version) {
    validateVersion(version);
  }

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
    window.__state = { ready: false, responses: [], threadId: null, error: null };

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
                'OpenAI-Beta': 'chatkit_beta=v1'
              },
              body: JSON.stringify({
                workflow: { id: '${workflowId}'${versionClause} },
                user: 'promptfoo-eval-' + Date.now()
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

      chatkit.addEventListener('chatkit.response.end', () => {
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

/**
 * Extract assistant response text from the ChatKit iframe
 * Uses retry logic since DOM may still be updating after response.end event
 */
async function extractResponseFromFrame(page: Page, maxRetries: number = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const frames = page.frames();

    for (const frame of frames) {
      const url = frame.url();
      if (isOpenAICdnUrl(url)) {
        try {
          const result = await frame.evaluate(() => {
            // Helper to check if element is likely a user message
            const isUserMessage = (el: Element): boolean => {
              const className = el.className?.toString().toLowerCase() || '';
              const role = el.getAttribute('data-role') || '';
              const testId = el.getAttribute('data-testid') || '';
              return className.includes('user') || role === 'user' || testId.includes('user');
            };

            // Try assistant-specific selectors first
            const assistantSelectors = [
              '[data-testid="assistant-message"]',
              '[data-role="assistant"]',
              '[class*="assistant"]:not([class*="user"])',
            ];

            for (const sel of assistantSelectors) {
              const els = document.querySelectorAll(sel);
              if (els.length > 0) {
                const lastEl = els[els.length - 1];
                const text = lastEl.textContent || '';
                if (text.length > 30) {
                  return { text, source: sel };
                }
              }
            }

            // Look for message containers and find the last non-user message
            const allMessages = document.querySelectorAll('[class*="message"]');
            const nonUserMessages: string[] = [];

            allMessages.forEach((msg) => {
              if (!isUserMessage(msg)) {
                const text = msg.textContent || '';
                // Skip short texts (likely labels) and avoid duplicates
                if (text.length > 30 && !nonUserMessages.includes(text)) {
                  nonUserMessages.push(text);
                }
              }
            });

            if (nonUserMessages.length > 0) {
              // Get the last (most recent) assistant message
              return { text: nonUserMessages[nonUserMessages.length - 1], source: 'last-non-user' };
            }

            // Try markdown content (often contains the formatted response)
            const markdown = document.querySelectorAll('.markdown, [class*="markdown"]');
            if (markdown.length > 0) {
              const text = markdown[markdown.length - 1].textContent || '';
              if (text.length > 30) {
                return { text, source: 'markdown' };
              }
            }

            // Try response-specific containers
            const responseContainers = document.querySelectorAll(
              '[class*="response"], [class*="reply"], [class*="answer"]',
            );
            for (const container of responseContainers) {
              const text = container.textContent || '';
              if (text.length > 30 && !isUserMessage(container)) {
                return { text, source: 'response-container' };
              }
            }

            // Fallback: look for the longest div that's not in a user message area
            const divs = document.querySelectorAll('div');
            let longestText = '';

            divs.forEach((div) => {
              const text = div.textContent || '';
              if (
                text.length > longestText.length &&
                text.length > 50 &&
                text.length < 5000 &&
                !isUserMessage(div)
              ) {
                // Check parent chain for user indicators
                let parent = div.parentElement;
                let inUserArea = false;
                while (parent && parent !== document.body) {
                  if (isUserMessage(parent)) {
                    inUserArea = true;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (!inUserArea) {
                  longestText = text;
                }
              }
            });

            if (longestText.length > 50) {
              return { text: longestText, source: 'longest-div' };
            }

            // Last resort: full body text
            return { text: document.body?.textContent || '', source: 'body' };
          });

          if (result.text && result.text.trim().length > 20) {
            // Clean up the response - remove Cloudflare scripts and other noise
            let cleaned = result.text
              .replace(/\(function\(\)\{.*?\}\)\(\);?/gs, '')
              .replace(/You said:.*?(?=\n|$)/g, '')
              .trim();

            // If there's a JSON classification prefix, strip it and use the rest
            const jsonMatch = cleaned.match(/^(\{[^}]+\})\s*/);
            if (jsonMatch) {
              const rest = cleaned.slice(jsonMatch[0].length).trim();
              cleaned = rest.length > 20 ? rest : cleaned;
            }

            if (cleaned.length > 20) {
              logger.debug('[ChatKitProvider] Extracted response', {
                source: result.source,
                length: cleaned.length,
              });
              return cleaned;
            }

            // Return original if cleaning removed too much
            if (result.text.trim().length > 20) {
              return result.text.trim();
            }
          }
        } catch (e) {
          logger.debug('[ChatKitProvider] Could not access frame', { url, error: e, attempt });
        }
      }
    }

    // Wait before retry
    if (attempt < maxRetries - 1) {
      await page.waitForTimeout(RESPONSE_EXTRACT_RETRY_DELAY_MS);
    }
  }

  return '';
}

/**
 * Handle workflow approval steps by clicking approve/reject buttons.
 * Returns true if an approval was handled, false if no approval found.
 */
async function handleApproval(
  page: Page,
  action: 'auto-approve' | 'auto-reject',
): Promise<boolean> {
  const frames = page.frames();

  for (const frame of frames) {
    const url = frame.url();
    if (isOpenAICdnUrl(url)) {
      try {
        // Look for approval buttons in the ChatKit iframe
        const buttonText = action === 'auto-approve' ? 'Approve' : 'Reject';
        const buttonSelectors = [
          `button:has-text("${buttonText}")`,
          `[role="button"]:has-text("${buttonText}")`,
          `[data-testid="${buttonText.toLowerCase()}-button"]`,
        ];

        for (const selector of buttonSelectors) {
          const button = await frame.$(selector);
          if (button) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              logger.debug('[ChatKitProvider] Found approval button, clicking', {
                action,
                selector,
              });
              await button.click();
              // Wait for the approval to be processed
              await page.waitForTimeout(APPROVAL_CLICK_DELAY_MS);
              return true;
            }
          }
        }

        // Alternative: Look for approval UI patterns in the DOM
        const hasApproval = await frame.evaluate((btnText) => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          const approveBtn = buttons.find((b) =>
            b.textContent?.toLowerCase().includes(btnText.toLowerCase()),
          );
          if (approveBtn && approveBtn instanceof HTMLElement) {
            approveBtn.click();
            return true;
          }
          return false;
        }, buttonText);

        if (hasApproval) {
          logger.debug('[ChatKitProvider] Clicked approval button via evaluate', { action });
          await page.waitForTimeout(APPROVAL_CLICK_DELAY_MS);
          return true;
        }
      } catch (e) {
        logger.debug('[ChatKitProvider] Error checking for approval buttons', { error: e });
      }
    }
  }

  return false;
}

/**
 * Process approvals until none remain or max reached.
 * Returns the number of approvals processed.
 */
async function processApprovals(
  page: Page,
  approvalHandling: 'auto-approve' | 'auto-reject' | 'skip',
  maxApprovals: number,
  timeout: number,
): Promise<number> {
  if (approvalHandling === 'skip') {
    return 0;
  }

  let approvalCount = 0;

  while (approvalCount < maxApprovals) {
    // Small delay to let UI settle
    await page.waitForTimeout(APPROVAL_PROCESS_DELAY_MS);

    const handled = await handleApproval(page, approvalHandling);
    if (!handled) {
      break;
    }

    approvalCount++;
    logger.debug('[ChatKitProvider] Processed approval', {
      count: approvalCount,
      max: maxApprovals,
    });

    // Wait for next response after approval
    try {
      await page.waitForFunction(
        (prevCount) => (window as any).__state?.responses?.length > prevCount,
        approvalCount,
        { timeout: timeout / 2 },
      );

      // Let DOM settle after new response
      await page.waitForTimeout(DOM_SETTLE_DELAY_MS);
    } catch {
      // Timeout waiting for response after approval - might be final response
      break;
    }
  }

  return approvalCount;
}

export class OpenAiChatKitProvider extends OpenAiGenericProvider {
  private chatKitConfig: OpenAiChatKitOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private server: http.Server | null = null;
  private serverPort: number = 0;
  private initialized: boolean = false;

  constructor(
    workflowId: string,
    options: { config?: OpenAiChatKitOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(workflowId, options);
    // Default poolSize to PROMPTFOO_MAX_CONCURRENCY env var if set, otherwise DEFAULT_POOL_SIZE
    const envPoolSize = process.env.PROMPTFOO_MAX_CONCURRENCY
      ? parseInt(process.env.PROMPTFOO_MAX_CONCURRENCY, 10)
      : NaN;
    const defaultPoolSize = Number.isNaN(envPoolSize) ? DEFAULT_POOL_SIZE : envPoolSize;

    this.chatKitConfig = {
      workflowId: options.config?.workflowId || workflowId,
      version: options.config?.version,
      userId: options.config?.userId || 'promptfoo-eval',
      timeout: options.config?.timeout || DEFAULT_TIMEOUT_MS,
      headless: options.config?.headless ?? true,
      serverPort: options.config?.serverPort || 0,
      usePool: options.config?.usePool ?? false,
      poolSize: options.config?.poolSize ?? defaultPoolSize,
      approvalHandling: options.config?.approvalHandling ?? 'auto-approve',
      maxApprovals: options.config?.maxApprovals ?? DEFAULT_MAX_APPROVALS,
    };
  }

  id(): string {
    const version = this.chatKitConfig.version ? `:${this.chatKitConfig.version}` : '';
    return `openai:chatkit:${this.chatKitConfig.workflowId}${version}`;
  }

  toString(): string {
    return `[OpenAI ChatKit Provider ${this.chatKitConfig.workflowId}]`;
  }

  /**
   * Initialize the browser and ChatKit page
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key is required for ChatKit provider');
    }

    const workflowId = this.chatKitConfig.workflowId;
    if (!workflowId) {
      throw new Error('ChatKit workflowId is required');
    }

    logger.debug('[ChatKitProvider] Initializing', {
      workflowId,
      version: this.chatKitConfig.version,
    });

    // Create HTTP server to serve the ChatKit HTML
    const html = generateChatKitHTML(apiKey, workflowId, this.chatKitConfig.version);

    this.server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Failed to start ChatKit server: ${err.message}`));
      });
      this.server!.listen(this.chatKitConfig.serverPort, () => {
        const address = this.server!.address();
        this.serverPort = typeof address === 'object' ? address?.port || 0 : 0;
        logger.debug('[ChatKitProvider] Server started', { port: this.serverPort });
        resolve();
      });
    });

    // Launch browser with helpful error for missing Playwright
    try {
      this.browser = await chromium.launch({
        headless: this.chatKitConfig.headless,
      });
    } catch (launchError) {
      const errorMessage = launchError instanceof Error ? launchError.message : String(launchError);
      if (
        errorMessage.includes("Executable doesn't exist") ||
        errorMessage.includes('browserType.launch')
      ) {
        throw new Error(
          'Playwright browser not installed. Run: npx playwright install chromium\n' +
            `Original error: ${errorMessage}`,
        );
      }
      throw launchError;
    }

    this.context = await this.browser.newContext({
      viewport: { width: 800, height: 600 },
    });

    this.page = await this.context.newPage();

    // Navigate to our HTML page
    await this.page.goto(`http://localhost:${this.serverPort}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for ChatKit to be ready
    logger.debug('[ChatKitProvider] Waiting for ChatKit ready');
    await this.page.waitForFunction(() => (window as any).__state?.ready === true, {
      timeout: CHATKIT_READY_TIMEOUT_MS,
    });

    this.initialized = true;
    logger.debug('[ChatKitProvider] Initialized successfully');
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.initialized = false;
  }

  /**
   * Call the ChatKit workflow with the given prompt
   */
  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug('[ChatKitProvider] Starting call', {
      prompt: prompt.substring(0, 100),
      workflowId: this.chatKitConfig.workflowId,
      usePool: this.chatKitConfig.usePool,
    });

    // Use pool-based execution for better concurrency
    if (this.chatKitConfig.usePool) {
      return this.callApiWithPool(prompt);
    }

    try {
      await this.initialize();

      if (!this.page) {
        throw new Error('Browser page not initialized');
      }

      // Refresh the page to get clean state for each evaluation
      // This ensures each test case is completely independent
      await this.page.reload({ waitUntil: 'domcontentloaded' });

      // Wait for ChatKit to be ready again after reload
      await this.page.waitForFunction(() => (window as any).__state?.ready === true, {
        timeout: CHATKIT_READY_TIMEOUT_MS,
      });

      // Send the message
      await this.page.evaluate((text) => {
        return (window as any).__chatkit.sendUserMessage({
          text,
          newThread: true,
        });
      }, prompt);

      // Wait for response
      logger.debug('[ChatKitProvider] Waiting for response');
      await this.page.waitForFunction(() => (window as any).__state?.responses?.length > 0, {
        timeout: this.chatKitConfig.timeout,
      });

      // Allow DOM to settle - ChatKit iframe needs time to render the response
      await this.page.waitForTimeout(DOM_SETTLE_DELAY_MS);

      // Handle any approval steps in the workflow
      const approvalsHandled = await processApprovals(
        this.page,
        this.chatKitConfig.approvalHandling ?? 'auto-approve',
        this.chatKitConfig.maxApprovals ?? DEFAULT_MAX_APPROVALS,
        this.chatKitConfig.timeout ?? DEFAULT_TIMEOUT_MS,
      );

      if (approvalsHandled > 0) {
        logger.debug('[ChatKitProvider] Processed approvals', { count: approvalsHandled });
      }

      // Extract response from iframe
      const responseText = await extractResponseFromFrame(this.page);

      // Get thread ID
      const threadId = await this.page.evaluate(() => (window as any).__state.threadId);

      logger.debug('[ChatKitProvider] Response received', {
        threadId,
        textLength: responseText.length,
      });

      return {
        output: responseText,
        metadata: {
          threadId,
          workflowId: this.chatKitConfig.workflowId,
          version: this.chatKitConfig.version,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ChatKitProvider] Call failed', { error: errorMessage });

      // Check for ChatKit-specific errors in page state
      if (this.page) {
        try {
          const stateError = await this.page.evaluate(() => (window as any).__state?.error);
          if (stateError) {
            return {
              error: `ChatKit workflow error: ${stateError}`,
            };
          }
        } catch {
          // Page may be in bad state, continue with general error
        }
      }

      // Provide helpful error messages for common issues
      if (errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
        return {
          error:
            `ChatKit response timeout after ${this.chatKitConfig.timeout}ms. ` +
            'Try increasing timeout in config or use --max-concurrency 1 for more reliable results.',
        };
      }

      if (errorMessage.includes('API key')) {
        return {
          error: 'OpenAI API key is required. Set OPENAI_API_KEY environment variable.',
        };
      }

      if (errorMessage.includes('Playwright') || errorMessage.includes('browser')) {
        return {
          error: `Browser error: ${errorMessage}. Ensure Playwright is installed: npx playwright install chromium`,
        };
      }

      return {
        error: `ChatKit provider error: ${errorMessage}`,
      };
    }
  }

  /**
   * Pool-based callApi for better concurrency support.
   * Uses a shared browser with multiple contexts instead of separate browsers.
   */
  private async callApiWithPool(prompt: string): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error: 'OpenAI API key is required. Set OPENAI_API_KEY environment variable.',
      };
    }

    const workflowId = this.chatKitConfig.workflowId;
    if (!workflowId) {
      return {
        error: 'ChatKit workflowId is required',
      };
    }

    // Get or create the pool
    const pool = ChatKitBrowserPool.getInstance({
      maxConcurrency: this.chatKitConfig.poolSize,
      headless: this.chatKitConfig.headless,
    });

    // Set the HTML template (needed for the pool's server)
    const html = generateChatKitHTML(apiKey, workflowId, this.chatKitConfig.version);
    pool.setHtmlTemplate(html);

    let pooledPage: Awaited<ReturnType<typeof pool.acquirePage>> | null = null;

    try {
      // Acquire a page from the pool
      pooledPage = await pool.acquirePage();
      const page = pooledPage.page;

      logger.debug('[ChatKitProvider] Acquired page from pool', {
        stats: pool.getStats(),
      });

      // Send the message
      await page.evaluate((text) => {
        return (window as any).__chatkit.sendUserMessage({
          text,
          newThread: true,
        });
      }, prompt);

      // Wait for response
      await page.waitForFunction(() => (window as any).__state?.responses?.length > 0, {
        timeout: this.chatKitConfig.timeout,
      });

      // Allow DOM to settle
      await page.waitForTimeout(DOM_SETTLE_DELAY_MS);

      // Handle any approval steps in the workflow
      const approvalsHandled = await processApprovals(
        page,
        this.chatKitConfig.approvalHandling ?? 'auto-approve',
        this.chatKitConfig.maxApprovals ?? DEFAULT_MAX_APPROVALS,
        this.chatKitConfig.timeout ?? DEFAULT_TIMEOUT_MS,
      );

      if (approvalsHandled > 0) {
        logger.debug('[ChatKitProvider] Pool processed approvals', { count: approvalsHandled });
      }

      // Extract response from iframe
      const responseText = await extractResponseFromFrame(page);

      // Get thread ID
      const threadId = await page.evaluate(() => (window as any).__state.threadId);

      logger.debug('[ChatKitProvider] Pool response received', {
        threadId,
        textLength: responseText.length,
      });

      return {
        output: responseText,
        metadata: {
          threadId,
          workflowId: this.chatKitConfig.workflowId,
          version: this.chatKitConfig.version,
          poolMode: true,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ChatKitProvider] Pool call failed', { error: errorMessage });

      if (errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
        return {
          error:
            `ChatKit response timeout after ${this.chatKitConfig.timeout}ms. ` +
            'Try increasing timeout or reducing concurrency.',
        };
      }

      return {
        error: `ChatKit provider error: ${errorMessage}`,
      };
    } finally {
      // Release the page back to the pool
      if (pooledPage) {
        await pool.releasePage(pooledPage);
      }
    }
  }
}
