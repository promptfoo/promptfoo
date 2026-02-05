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

import * as http from 'http';

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import logger from '../../logger';
import { providerRegistry } from '../providerRegistry';
import { ChatKitBrowserPool } from './chatkit-pool';
import { OpenAiGenericProvider } from './index';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiChatKitOptions } from './chatkit-types';

// Configuration constants
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_APPROVALS = 5;
const DEFAULT_POOL_SIZE = 4;
const CHATKIT_READY_TIMEOUT_MS = 60000;
const DOM_SETTLE_DELAY_MS = 2000;
const APPROVAL_PROCESS_DELAY_MS = 500;
const APPROVAL_CLICK_DELAY_MS = 1000;
const RESPONSE_EXTRACT_RETRY_DELAY_MS = 500;
// Time to wait after last content change to ensure workflow is fully complete
// Multi-step workflows may have agents that run sequentially, each updating the DOM
// MCP tool calls (like Dropbox searches) can take 30+ seconds
const CONTENT_STABILIZATION_MS = 10000; // Wait 10 seconds after last content change
const CONTENT_POLL_MS = 500; // Poll for content changes every 500ms
const MIN_WORKFLOW_WAIT_MS = 60000; // Minimum 60 seconds for multi-step workflows with MCP tools
const SHORT_RESPONSE_THRESHOLD = 100; // Responses under this length might be intermediate (e.g., JSON classification)
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
 * Validate userId format to prevent script injection
 */
function validateUserId(userId: string): void {
  if (!/^[a-zA-Z0-9._@-]+$/.test(userId)) {
    throw new Error(
      `Invalid userId format: ${userId}. Only alphanumeric, dot, dash, underscore, and @ allowed.`,
    );
  }
}

/**
 * Clean up assistant response text by removing noise and artifacts.
 * This includes Cloudflare scripts, approval UI text, user echo, and JSON classification prefixes.
 */
function cleanAssistantResponse(text: string): string {
  if (!text) {
    return '';
  }

  // Remove Cloudflare scripts and other noise
  let cleaned = text.replace(/\(function\(\)\{.*?\}\)\(\);?/gs, '').trim();

  // Remove approval UI text from the response
  // The approval UI typically appears as: "Approval required\nDoes this work for you?\nApprove\nReject"
  cleaned = cleaned
    .replace(/\n?Approval required\n?Does this work for you\?\n?Approve\n?Reject$/gi, '')
    .replace(
      /\n?Approval required[\s\n]+Does this work for you\?[\s\n]+Approve[\s\n]+Reject$/gi,
      '',
    )
    .trim();

  // Remove "You said:" prefix and everything after it if it looks like user echo
  if (/^You said:/i.test(cleaned)) {
    cleaned = '';
  } else {
    // Also check for "You said:" appearing anywhere in the text and remove it
    cleaned = cleaned.replace(/You said:[\s\S]*/gi, '').trim();
  }

  // Don't strip JSON if it's the only response - it might be intentional
  // Only strip if there's substantial text after the JSON
  const jsonMatch = cleaned.match(/^(\{[^}]+\})\s+(.+)/s);
  if (jsonMatch && jsonMatch[2].trim().length > 50) {
    cleaned = jsonMatch[2].trim();
  }

  return cleaned;
}

/**
 * Generate the HTML page that hosts the ChatKit component
 */
function generateChatKitHTML(
  apiKey: string,
  workflowId: string,
  version?: string,
  userId?: string,
): string {
  // Validate inputs to prevent script injection
  validateWorkflowId(workflowId);
  if (version) {
    validateVersion(version);
  }
  // userId is required - caller must provide it (constructor ensures this)
  if (!userId) {
    throw new Error('userId is required for ChatKit HTML generation');
  }
  validateUserId(userId);

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
    window.__state = { ready: false, responses: [], threadId: null, error: null, responding: false };

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
                user: '${userId}'
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

      chatkit.addEventListener('chatkit.response.start', () => {
        window.__state.responding = true;
      });

      chatkit.addEventListener('chatkit.response.end', () => {
        window.__state.responding = false;
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

            // Helper to check if element is an assistant message
            const isAssistantMessage = (el: Element): boolean => {
              const className = el.className?.toString().toLowerCase() || '';
              const role = el.getAttribute('data-role') || '';
              const testId = el.getAttribute('data-testid') || '';
              return (
                className.includes('assistant') ||
                role === 'assistant' ||
                testId.includes('assistant')
              );
            };

            // Try assistant-specific selectors first - these are most reliable
            const assistantSelectors = [
              '[data-thread-item="assistant-message"]', // ChatKit specific
              '[data-testid="assistant-message"]',
              '[data-role="assistant"]',
              '[class*="assistant"]:not([class*="user"])',
            ];

            for (const sel of assistantSelectors) {
              const els = document.querySelectorAll(sel);
              if (els.length > 0) {
                const lastEl = els[els.length - 1];
                const text = lastEl.textContent?.trim() || '';
                // Accept any non-empty assistant message (removed length requirement)
                if (text.length > 0) {
                  return { text, source: sel, isAssistant: true };
                }
              }
            }

            // Look for message containers and find messages
            // Collect both user and assistant messages to identify the last assistant one
            const allMessages = document.querySelectorAll('[class*="message"]');
            const messages: Array<{ text: string; isUser: boolean; isAssistant: boolean }> = [];

            allMessages.forEach((msg) => {
              const text = msg.textContent?.trim() || '';
              if (text.length > 0) {
                messages.push({
                  text,
                  isUser: isUserMessage(msg),
                  isAssistant: isAssistantMessage(msg),
                });
              }
            });

            // Find the last non-user message (assistant messages)
            for (let i = messages.length - 1; i >= 0; i--) {
              if (!messages[i].isUser && messages[i].text.length > 0) {
                return { text: messages[i].text, source: 'last-non-user', isAssistant: true };
              }
            }

            // Try markdown content (often contains the formatted response)
            const markdown = document.querySelectorAll('.markdown, [class*="markdown"]');
            if (markdown.length > 0) {
              // Find markdown that's not inside a user message
              for (let i = markdown.length - 1; i >= 0; i--) {
                const el = markdown[i];
                let parent = el.parentElement;
                let inUserArea = false;
                while (parent && parent !== document.body) {
                  if (isUserMessage(parent)) {
                    inUserArea = true;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (!inUserArea) {
                  const text = el.textContent?.trim() || '';
                  if (text.length > 0) {
                    return { text, source: 'markdown', isAssistant: true };
                  }
                }
              }
            }

            // Try response-specific containers
            const responseContainers = document.querySelectorAll(
              '[class*="response"], [class*="reply"], [class*="answer"]',
            );
            for (let i = responseContainers.length - 1; i >= 0; i--) {
              const container = responseContainers[i];
              if (!isUserMessage(container)) {
                const text = container.textContent?.trim() || '';
                if (text.length > 0) {
                  return { text, source: 'response-container', isAssistant: true };
                }
              }
            }

            // Fallback: look for the last div that's not in a user message area
            // Prefer shorter texts to avoid grabbing the entire page
            const divs = Array.from(document.querySelectorAll('div'));
            const candidateDivs: Array<{ text: string; el: Element }> = [];

            for (const div of divs) {
              const text = div.textContent?.trim() || '';
              if (text.length > 0 && text.length < 5000 && !isUserMessage(div)) {
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
                  candidateDivs.push({ text, el: div });
                }
              }
            }

            // Sort by length and prefer medium-length texts (likely actual responses)
            // Avoid very short (labels) and very long (containers with multiple messages)
            if (candidateDivs.length > 0) {
              // Find divs that don't contain other message-like elements
              const leafDivs = candidateDivs.filter(
                (d) => d.el.querySelectorAll('[class*="message"]').length === 0,
              );
              if (leafDivs.length > 0) {
                // Return the last leaf div (most recent)
                return { text: leafDivs[leafDivs.length - 1].text, source: 'leaf-div' };
              }
              // Otherwise return the last candidate
              return { text: candidateDivs[candidateDivs.length - 1].text, source: 'fallback-div' };
            }

            // Last resort: full body text
            return { text: document.body?.textContent?.trim() || '', source: 'body' };
          });

          if (result.text && result.text.length > 0) {
            // Skip if this looks like just approval button text
            const trimmed = result.text.trim();
            if (trimmed === 'ApproveReject' || trimmed === 'Approve' || trimmed === 'Reject') {
              logger.debug('[ChatKitProvider] Skipping approval button text', { text: trimmed });
              continue;
            }

            // Apply shared cleanup logic
            const cleaned = cleanAssistantResponse(result.text);

            if (cleaned.length > 0) {
              logger.debug('[ChatKitProvider] Extracted response', {
                source: result.source,
                length: cleaned.length,
                preview: cleaned.substring(0, 100),
              });
              return cleaned;
            }

            // If we got here with no cleaned text but had original text,
            // the extraction found only user content - return empty to retry
            logger.debug('[ChatKitProvider] No assistant content found after cleaning', {
              originalLength: result.text.length,
              source: result.source,
            });
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
 * Get the current visible text content from the ChatKit iframe.
 * Returns the text content or null if iframe not accessible.
 */
async function getIframeContent(page: Page): Promise<string | null> {
  const frames = page.frames();
  logger.debug('[ChatKitProvider] Checking frames', {
    frameCount: frames.length,
    frameUrls: frames.map((f) => f.url()),
  });
  for (const frame of frames) {
    const url = frame.url();
    if (isOpenAICdnUrl(url)) {
      try {
        const content = await frame.evaluate(() => {
          return document.body?.innerText || '';
        });
        return content;
      } catch {
        // Frame not accessible
      }
    }
  }
  return null;
}

/**
 * Wait for iframe content to stabilize by polling for changes.
 * Multi-step workflows may have agents that run sequentially, each updating the DOM.
 * This function waits until:
 * 1. Content hasn't changed for CONTENT_STABILIZATION_MS
 * 2. At least MIN_WORKFLOW_WAIT_MS has elapsed since first response
 * 3. Not currently in 'responding' state
 */
/**
 * Result from content stabilization including the captured assistant response
 */
interface StabilizationResult {
  assistantResponse: string;
  fullContent: string;
}

async function waitForContentStabilization(
  page: Page,
  timeout: number,
  startTime: number,
): Promise<StabilizationResult> {
  let lastContent = '';
  let lastChangeTime = Date.now();
  const pollStartTime = Date.now();
  let capturedAssistantResponse = '';

  logger.debug('[ChatKitProvider] Starting content stabilization polling');

  while (Date.now() - pollStartTime < timeout) {
    // Check if we're still responding
    const state = await page.evaluate(() => (window as any).__state);

    // Log state periodically for debugging
    const pollElapsed = Date.now() - pollStartTime;
    if (pollElapsed % 5000 < CONTENT_POLL_MS) {
      // Log every ~5 seconds
      logger.debug('[ChatKitProvider] Polling state', {
        pollElapsedMs: pollElapsed,
        responding: state.responding,
        responseCount: state.responses?.length,
        error: state.error,
        threadId: state.threadId,
      });
    }

    // Get current iframe content
    const currentContent = (await getIframeContent(page)) || '';

    // Check if content has changed
    if (currentContent !== lastContent) {
      logger.debug('[ChatKitProvider] Content changed', {
        previousLength: lastContent.length,
        newLength: currentContent.length,
        preview: currentContent.substring(Math.max(0, currentContent.length - 200)),
      });
      lastContent = currentContent;
      lastChangeTime = Date.now();
    }

    const timeSinceStart = Date.now() - startTime;
    const timeSinceLastChange = Date.now() - lastChangeTime;

    // Extract just the assistant response part for length checking
    // The full content includes "You said: ... The assistant said: ..."
    const assistantMatch = currentContent.match(/The assistant said:\s*\n*([\s\S]*)/i);
    const assistantResponse = assistantMatch ? assistantMatch[1].trim() : currentContent;
    if (!assistantMatch && currentContent.length > 0) {
      logger.debug(
        '[ChatKitProvider] Assistant pattern not found, using full content for length check',
        {
          contentLength: currentContent.length,
        },
      );
    }
    // Always capture the latest assistant response for potential fallback use
    capturedAssistantResponse = assistantResponse;

    const isShortResponse = assistantResponse.length < SHORT_RESPONSE_THRESHOLD;

    // For short responses (possibly intermediate like JSON classification),
    // wait longer to see if more content appears
    const effectiveStabilizationMs = isShortResponse
      ? CONTENT_STABILIZATION_MS * 2
      : CONTENT_STABILIZATION_MS;
    const effectiveMinWaitMs = isShortResponse ? MIN_WORKFLOW_WAIT_MS * 2 : MIN_WORKFLOW_WAIT_MS;

    // Check stabilization conditions:
    // 1. Not currently responding
    // 2. Content hasn't changed for stabilization period
    // 3. At least minimum wait time since workflow started
    if (
      !state.responding &&
      timeSinceLastChange >= effectiveStabilizationMs &&
      timeSinceStart >= effectiveMinWaitMs
    ) {
      logger.debug('[ChatKitProvider] Content stabilized', {
        timeSinceStart,
        timeSinceLastChange,
        contentLength: currentContent.length,
        assistantResponseLength: assistantResponse.length,
        isShortResponse,
        responseCount: state.responses?.length,
      });
      return { assistantResponse: capturedAssistantResponse, fullContent: currentContent };
    }

    // Wait before next poll
    await page.waitForTimeout(CONTENT_POLL_MS);
  }

  logger.debug('[ChatKitProvider] Content stabilization timeout reached');
  return { assistantResponse: capturedAssistantResponse, fullContent: lastContent };
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

  // Static userId for consistent template keys across concurrent evaluations
  private static defaultUserId: string | null = null;

  private static getDefaultUserId(): string {
    if (!OpenAiChatKitProvider.defaultUserId) {
      // Generate once per process to ensure template consistency
      OpenAiChatKitProvider.defaultUserId = `promptfoo-eval-${Date.now()}`;
    }
    return OpenAiChatKitProvider.defaultUserId;
  }

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
      // Use consistent default userId to ensure template stability during concurrent execution
      userId: options.config?.userId || OpenAiChatKitProvider.getDefaultUserId(),
      timeout: options.config?.timeout || DEFAULT_TIMEOUT_MS,
      headless: options.config?.headless ?? true,
      serverPort: options.config?.serverPort || 0,
      usePool: options.config?.usePool ?? true, // Pool mode by default for better performance
      poolSize: options.config?.poolSize ?? defaultPoolSize,
      approvalHandling: options.config?.approvalHandling ?? 'auto-approve',
      maxApprovals: options.config?.maxApprovals ?? DEFAULT_MAX_APPROVALS,
      stateful: options.config?.stateful ?? false,
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
    const html = generateChatKitHTML(
      apiKey,
      workflowId,
      this.chatKitConfig.version,
      this.chatKitConfig.userId,
    );

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

    // Capture console logs for debugging
    this.page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        logger.debug('[ChatKitProvider] Browser console', {
          type,
          text: msg.text(),
        });
      }
    });

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

    // Register for cleanup on process exit (non-pool mode only)
    // Pool mode has its own cleanup mechanism
    if (!this.chatKitConfig.usePool) {
      providerRegistry.register(this);
    }

    logger.debug('[ChatKitProvider] Initialized successfully');
  }

  /**
   * Shutdown method for providerRegistry cleanup
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
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
    // Stateful mode requires sequential processing, so disable pool mode
    const usePool = this.chatKitConfig.usePool && !this.chatKitConfig.stateful;

    logger.debug('[ChatKitProvider] Starting call', {
      prompt: prompt.substring(0, 100),
      workflowId: this.chatKitConfig.workflowId,
      usePool,
      stateful: this.chatKitConfig.stateful,
    });

    // Use pool-based execution for better concurrency (not available in stateful mode)
    if (usePool) {
      return this.callApiWithPool(prompt);
    }

    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.page) {
        throw new Error('Browser page not initialized');
      }

      // For stateful mode, don't reload the page to maintain conversation state
      // For non-stateful mode, refresh to get clean state for each evaluation
      if (!this.chatKitConfig.stateful) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });

        // Wait for ChatKit to be ready again after reload
        await this.page.waitForFunction(() => (window as any).__state?.ready === true, {
          timeout: CHATKIT_READY_TIMEOUT_MS,
        });
      }

      // For stateful mode, check if this is a follow-up message (responses already exist)
      // Use newThread: false for follow-ups to continue the conversation
      const responseCount = await this.page.evaluate(
        () => (window as any).__state?.responses?.length || 0,
      );
      const isFollowUp = this.chatKitConfig.stateful && responseCount > 0;

      logger.debug('[ChatKitProvider] Sending message', {
        stateful: this.chatKitConfig.stateful,
        isFollowUp,
        responseCount,
      });

      // Send the message
      await this.page.evaluate(
        ({ text, newThread }) => {
          return (window as any).__chatkit.sendUserMessage({
            text,
            newThread,
          });
        },
        { text: prompt, newThread: !isFollowUp },
      );

      // Wait for response - in stateful mode, wait for a NEW response
      // Multi-step workflows may update DOM content multiple times as different
      // agents run (classification -> domain agent -> summarizer)
      logger.debug('[ChatKitProvider] Waiting for response');
      const expectedResponseCount = responseCount + 1;

      // First, wait for at least one response to start
      await this.page.waitForFunction(
        (expected) => (window as any).__state?.responses?.length >= expected,
        expectedResponseCount,
        { timeout: this.chatKitConfig.timeout },
      );

      // Wait for workflow to stabilize by polling actual DOM content
      // Multi-step workflows (classification -> domain agent) may continue
      // updating DOM content after the first response.end event
      // Capture the content during stabilization as a fallback for extraction
      const stabilizationResult = await waitForContentStabilization(
        this.page,
        this.chatKitConfig.timeout ?? DEFAULT_TIMEOUT_MS,
        startTime,
      );

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

      // Extract response from iframe DOM
      // Try DOM extraction first, fall back to captured content from stabilization
      let responseText = await extractResponseFromFrame(this.page);
      if (!responseText && stabilizationResult.assistantResponse) {
        logger.debug('[ChatKitProvider] Using fallback content from stabilization', {
          fallbackLength: stabilizationResult.assistantResponse.length,
        });
        // Apply the same cleanup logic used for DOM extraction
        responseText = cleanAssistantResponse(stabilizationResult.assistantResponse);
      }

      // Get thread ID
      const threadId = await this.page.evaluate(() => (window as any).__state.threadId);

      // Get final response count for turn tracking
      const finalResponseCount = await this.page.evaluate(
        () => (window as any).__state?.responses?.length || 0,
      );

      const latencyMs = Date.now() - startTime;

      logger.debug('[ChatKitProvider] Response received', {
        threadId,
        textLength: responseText.length,
        turnNumber: finalResponseCount,
        latencyMs,
      });

      return {
        output: responseText,
        cached: false, // ChatKit responses are never cached (browser-based)
        latencyMs,
        // Use sessionId for consistency with HTTP provider's stateful handling
        sessionId: threadId,
        // Token usage not available from ChatKit, but track request count
        tokenUsage: { numRequests: 1 },
        metadata: {
          workflowId: this.chatKitConfig.workflowId,
          version: this.chatKitConfig.version,
          stateful: this.chatKitConfig.stateful,
          turnNumber: finalResponseCount,
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

    // Generate a unique template key for this workflow configuration
    // This ensures different workflows get isolated pages in the pool
    const templateKey = ChatKitBrowserPool.generateTemplateKey(
      workflowId,
      this.chatKitConfig.version,
      this.chatKitConfig.userId,
    );

    // Register the HTML template for this workflow
    const html = generateChatKitHTML(
      apiKey,
      workflowId,
      this.chatKitConfig.version,
      this.chatKitConfig.userId,
    );
    pool.setTemplate(templateKey, html);

    let pooledPage: Awaited<ReturnType<typeof pool.acquirePage>> | null = null;
    const startTime = Date.now();

    try {
      // Acquire a page from the pool for this specific template
      pooledPage = await pool.acquirePage(templateKey);
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

      // Wait for at least one response to start
      await page.waitForFunction(() => (window as any).__state?.responses?.length > 0, {
        timeout: this.chatKitConfig.timeout,
      });

      // Wait for workflow to stabilize by polling actual DOM content
      // Multi-step workflows (classification -> domain agent) may continue
      // updating DOM content after the first response.end event
      // Capture the content during stabilization as a fallback for extraction
      const stabilizationResult = await waitForContentStabilization(
        page,
        this.chatKitConfig.timeout ?? DEFAULT_TIMEOUT_MS,
        startTime,
      );

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

      // Extract response from iframe DOM
      // Try DOM extraction first, fall back to captured content from stabilization
      let responseText = await extractResponseFromFrame(page);
      if (!responseText && stabilizationResult.assistantResponse) {
        logger.debug('[ChatKitProvider] Pool using fallback content from stabilization', {
          fallbackLength: stabilizationResult.assistantResponse.length,
        });
        // Apply the same cleanup logic used for DOM extraction
        responseText = cleanAssistantResponse(stabilizationResult.assistantResponse);
      }

      // Get thread ID
      const threadId = await page.evaluate(() => (window as any).__state.threadId);

      const latencyMs = Date.now() - startTime;

      logger.debug('[ChatKitProvider] Pool response received', {
        threadId,
        textLength: responseText.length,
        latencyMs,
      });

      return {
        output: responseText,
        cached: false, // ChatKit responses are never cached (browser-based)
        latencyMs,
        // Use sessionId for consistency with HTTP provider's stateful handling
        sessionId: threadId,
        // Token usage not available from ChatKit, but track request count
        tokenUsage: { numRequests: 1 },
        metadata: {
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

// Export for testing
export { cleanAssistantResponse };
