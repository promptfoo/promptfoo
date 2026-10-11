import os from 'os';
import path from 'path';

import logger from '../logger';
import { fetchWithTimeout } from '../util/fetch/index';
import { maybeLoadFromExternalFile } from '../util/file';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { CHROMIUM_INSTALL_HINT, loadBrowserProviderDependencies } from './browserDependencies';
import { providerRegistry } from './providerRegistry';
import { waitForPromiseWithAbort } from './shared';
import { normalizeResponseTransformResult } from './transformResult';
import type { Browser, BrowserContext, ElementHandle, Page } from 'playwright';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const nunjucks = getNunjucksEngine();

// Constants for connection configuration
const DEFAULT_DEBUGGING_PORT = 9222;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

interface BrowserAction {
  action: string;
  args?: Record<string, any>;
  name?: string;
  runOnce?: boolean;
}

interface BrowserProviderConfig {
  cookies?:
    | Array<{
        url?: string;
        domain?: string;
        name: string;
        path?: string;
        value: string;
      }>
    | string;
  headless?: boolean;
  steps: BrowserAction[];
  timeoutMs?: number;
  transformResponse?: string | Function;
  /**
   * @deprecated
   */
  responseParser?: string | Function;

  // Connection options for existing browser
  connectOptions?: {
    mode?: 'cdp' | 'websocket';
    debuggingPort?: number;
    wsEndpoint?: string;
  };

  // Session persistence for multi-turn conversations
  persistSession?: boolean;
}

export function createTransformResponse(
  parser: any,
): (extracted: Record<string, any>, finalHtml: string) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('extracted', 'finalHtml', `return ${parser}`) as (
      extracted: Record<string, any>,
      finalHtml: string,
    ) => ProviderResponse;
  }
  return (_extracted, finalHtml) => ({ output: finalHtml });
}

interface BrowserSession {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  ownsBrowser: boolean;
  ownsContext: boolean;
  closed: boolean;
  initialization?: Promise<void>;
  cleanup?: Promise<void>;
}

export class BrowserProvider implements ApiProvider {
  static clearSessionCache(): void {
    // Sessions are stored on provider instances; there is no global cache to clear.
  }

  config: BrowserProviderConfig;
  transformResponse: (extracted: Record<string, any>, finalHtml: string) => ProviderResponse;
  private defaultTimeout: number;
  private headless: boolean;

  private persistedSession?: BrowserSession;
  private sessions = new Set<BrowserSession>();
  private cleanupPromise?: Promise<void>;
  private cleanupGeneration = 0;
  readonly retainOutsideEvaluation = true;

  constructor(_: string, options: ProviderOptions) {
    this.config = options.config as BrowserProviderConfig;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    invariant(
      Array.isArray(this.config.steps),
      `Expected Headless provider to have a config containing {steps}, but got ${safeJsonStringify(
        this.config,
      )}`,
    );
    this.defaultTimeout = this.config.timeoutMs || 30000; // Default 30 seconds timeout
    this.headless = this.config.headless ?? true;
  }

  id(): string {
    return 'browser-provider';
  }

  toString(): string {
    return '[Browser Provider]';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return providerRegistry.withProvider(
      this,
      () => this.runBrowser(prompt, context, options?.abortSignal),
      options?.abortSignal,
    );
  }

  private async runBrowser(
    prompt: string,
    context?: CallApiContextParams,
    signal?: AbortSignal,
  ): Promise<ProviderResponse> {
    if (this.cleanupPromise) {
      await waitForPromiseWithAbort(this.cleanupPromise, signal);
    }
    providerRegistry.throwIfResourceUseAborted(signal);
    const generation = this.cleanupGeneration;
    const vars = { ...(context?.vars || {}), prompt };
    let session = this.persistedSession;

    try {
      if (session?.page?.isClosed()) {
        await this.closeSession(session);
        session = undefined;
        providerRegistry.throwIfResourceUseAborted(signal);
        if (generation !== this.cleanupGeneration) {
          throw new Error('Browser session was closed during cleanup');
        }
      }
      const isNewSession = !session;
      if (!session) {
        session = { ownsBrowser: !this.config.connectOptions, ownsContext: false, closed: false };
        this.sessions.add(session);
        // Register before async launch so process shutdown also owns pending initialization.
        providerRegistry.register(this);
        session.initialization = this.initializeSession(session, vars);
        await session.initialization;
        if (session.closed) {
          throw new Error('Browser session was closed during initialization');
        }
        providerRegistry.throwIfResourceUseAborted(signal);
        if (this.config.persistSession) {
          this.persistedSession = session;
        }
      }

      const result = await this.executeSteps(session.page!, vars, isNewSession);
      if (!this.config.persistSession || result.error) {
        await this.closeSession(session);
      }
      return result;
    } catch (error) {
      if (session) {
        try {
          await this.closeSession(session);
        } catch (cleanupError) {
          logger.warn('[Browser] Failed to close browser session', { error: cleanupError });
        }
      }
      const hint =
        error instanceof Error && error.message.includes("Executable doesn't exist")
          ? ` ${CHROMIUM_INSTALL_HINT}`
          : '';
      return { error: `Browser execution error: ${error}${hint}` };
    }
  }

  private async initializeSession(
    session: BrowserSession,
    vars: Record<string, any>,
  ): Promise<void> {
    const { chromium, stealth } = await loadBrowserProviderDependencies();
    if (session.closed) {
      return;
    }
    chromium.use(stealth());
    session.browser = this.config.connectOptions
      ? (await this.connectToExistingBrowser(chromium)).browser
      : await chromium.launch({
          headless: this.headless,
          args: ['--ignore-certificate-errors'],
        });
    if (session.closed) {
      return;
    }

    const existingContext = this.config.connectOptions && session.browser!.contexts()[0];
    session.ownsContext = !existingContext;
    session.context =
      existingContext || (await session.browser!.newContext({ ignoreHTTPSErrors: true }));
    if (session.closed) {
      return;
    }
    if (this.config.cookies) {
      await this.setCookies(session.context, vars);
    }
    if (!session.closed) {
      session.page = await session.context.newPage();
    }
  }

  private closeSession(session: BrowserSession): Promise<void> {
    if (session.cleanup) {
      return session.cleanup;
    }
    session.closed = true;
    if (this.persistedSession === session) {
      this.persistedSession = undefined;
    }
    session.cleanup = (async () => {
      await session.initialization?.catch(() => {});
      try {
        if (!session.ownsBrowser) {
          if (session.ownsContext) {
            await session.context?.close();
          } else {
            await session.page?.close();
          }
        }
      } finally {
        // For connected browsers, close() disconnects this client transport without
        // terminating the external browser or its existing contexts.
        await session.browser?.close();
      }
      this.sessions.delete(session);
      if (this.sessions.size === 0) {
        providerRegistry.unregister(this);
      }
    })().catch((error) => {
      session.cleanup = undefined;
      providerRegistry.retainForProcessShutdown(this);
      throw error;
    });
    return session.cleanup;
  }

  cleanup(): Promise<void> {
    if (!this.cleanupPromise) {
      this.cleanupGeneration++;
      this.cleanupPromise = Promise.all(
        [...this.sessions].map((session) => this.closeSession(session)),
      )
        .then(() => undefined)
        .finally(() => {
          this.cleanupPromise = undefined;
        });
    }
    return this.cleanupPromise;
  }

  shutdown(): Promise<void> {
    return this.cleanup();
  }

  private async executeSteps(
    page: Page,
    vars: Record<string, any>,
    isNewSession: boolean,
  ): Promise<ProviderResponse> {
    const extracted: Record<string, any> = {};

    for (const step of this.config.steps) {
      if (step.runOnce && !isNewSession) {
        logger.debug(`[Browser] Skipping runOnce step: ${step.action}`);
        continue;
      }
      await this.executeAction(page, step, vars, extracted);
    }

    const finalHtml = await page.content();
    logger.debug(`Browser results: ${safeJsonStringify(extracted)}`);

    const ret = this.transformResponse(extracted, finalHtml);
    logger.debug(`Browser response transform output: ${safeJsonStringify(ret)}`);

    return normalizeResponseTransformResult(ret);
  }

  private async setCookies(
    browserContext: BrowserContext,
    vars: Record<string, any>,
  ): Promise<void> {
    if (typeof this.config.cookies === 'string') {
      const cookieString = maybeLoadFromExternalFile(this.config.cookies);
      invariant(
        typeof cookieString === 'string',
        'Browser cookie file must contain a cookie string',
      );
      const cookiePairs = cookieString
        .split(';')
        .map((pair) => pair.trim())
        .filter(Boolean);
      if (cookiePairs.length === 0) {
        return;
      }

      const navigation = this.config.steps.find((step) => step.action === 'navigate');
      const target = this.renderArgs(navigation?.args || {}, vars).url;
      let url: URL;
      try {
        url = new URL(target);
        invariant(url.protocol === 'http:' || url.protocol === 'https:', 'Unsupported cookie URL');
      } catch {
        throw new Error(
          'String browser cookies require a first navigate step with an absolute HTTP(S) URL. ' +
            'Otherwise, use cookie objects with an explicit url or domain/path scope.',
        );
      }
      // Cookie scope needs only the target host and directory, never URL credentials or query data.
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      const cookies = cookiePairs.map((pair) => {
        const separator = pair.indexOf('=');
        invariant(
          separator > 0 && pair.slice(0, separator).trim(),
          'Invalid browser cookie: expected name=value',
        );
        return {
          name: pair.slice(0, separator).trim(),
          value: pair.slice(separator + 1),
          url: url.href,
        };
      });
      await browserContext.addCookies(cookies);
    } else if (Array.isArray(this.config.cookies)) {
      await browserContext.addCookies(this.config.cookies);
    }
  }

  private async connectToExistingBrowser(
    chromium: any,
  ): Promise<{ browser: any; shouldClose: boolean }> {
    const connectOptions = this.config.connectOptions!;

    try {
      let browser;

      if (connectOptions.mode === 'websocket' && connectOptions.wsEndpoint) {
        logger.debug(`Connecting via WebSocket: ${connectOptions.wsEndpoint}`);
        browser = await chromium.connect({
          wsEndpoint: connectOptions.wsEndpoint,
        });
      } else {
        // Default to CDP connection
        const port = connectOptions.debuggingPort || DEFAULT_DEBUGGING_PORT;
        const cdpUrl = `http://localhost:${port}`;

        logger.debug(`Connecting via Chrome DevTools Protocol at ${cdpUrl}`);

        // Check if Chrome is accessible
        try {
          const response = await fetchWithTimeout(
            `${cdpUrl}/json/version`,
            {},
            DEFAULT_FETCH_TIMEOUT_MS,
          );
          const version = await response.json();
          logger.debug(`Connected to browser: ${version.Browser}`);
        } catch {
          throw new Error(
            `Cannot connect to Chrome at ${cdpUrl}. ` +
              `Make sure Chrome is running with debugging enabled:\n` +
              `  chrome --remote-debugging-port=${port}\n` +
              `  or\n` +
              `  chrome --remote-debugging-port=${port} --user-data-dir=${path.join(os.tmpdir(), 'chrome-debug')}`,
          );
        }

        browser = await chromium.connectOverCDP(cdpUrl);
      }

      return { browser, shouldClose: false };
    } catch (error) {
      logger.error(`Failed to connect to existing browser: ${error}`);
      throw error;
    }
  }

  private async executeAction(
    page: Page,
    action: BrowserAction,
    vars: Record<string, any>,
    extracted: Record<string, any>,
  ): Promise<void> {
    const { action: actionType, args = {}, name } = action;
    const renderedArgs = this.renderArgs(args, vars);

    logger.debug(`Executing headless action: ${actionType}`);

    switch (actionType) {
      case 'navigate':
        invariant(
          renderedArgs.url,
          `Browser action 'navigate' requires a 'url' parameter. ` +
            `Please provide the URL to navigate to.\n\n` +
            `Example:\n` +
            `- action: navigate\n` +
            `  args:\n` +
            `    url: 'https://example.com'\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        logger.debug(`Navigating to ${renderedArgs.url}`);
        await page.goto(renderedArgs.url);
        break;
      case 'click':
        invariant(
          renderedArgs.selector,
          `Browser action 'click' requires a 'selector' parameter. ` +
            `Please provide a CSS selector to identify the element to click.\n\n` +
            `Example:\n` +
            `- action: click\n` +
            `  args:\n` +
            `    selector: '#submit-button'\n` +
            `    optional: true  # optional: won't fail if element doesn't exist\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        logger.debug(`Waiting for and clicking on ${renderedArgs.selector}`);
        const element = await this.waitForSelector(page, renderedArgs.selector);
        if (element) {
          await page.click(renderedArgs.selector);
        } else if (renderedArgs.optional) {
          logger.debug(`Optional element ${renderedArgs.selector} not found, continuing`);
        } else {
          throw new Error(`Element not found: ${renderedArgs.selector}`);
        }
        break;
      case 'type':
        invariant(
          renderedArgs.text,
          `Browser action 'type' requires a 'text' parameter. ` +
            `Please provide the text to type into the selected element.\n\n` +
            `Example:\n` +
            `- action: type\n` +
            `  args:\n` +
            `    selector: '#input-field'\n` +
            `    text: 'Hello world'\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        invariant(
          renderedArgs.selector,
          `Browser action 'type' requires a 'selector' parameter. ` +
            `Please provide a CSS selector to identify the input element.\n\n` +
            `Example:\n` +
            `- action: type\n` +
            `  args:\n` +
            `    selector: '#input-field'\n` +
            `    text: 'Hello world'\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        logger.debug(`Waiting for and typing into ${renderedArgs.selector}: ${renderedArgs.text}`);
        await this.waitForSelector(page, renderedArgs.selector);

        if (typeof renderedArgs.text === 'string') {
          // Handle special characters
          const specialKeys = {
            '<enter>': 'Enter',
            '<tab>': 'Tab',
            '<escape>': 'Escape',
          };

          for (const [placeholder, key] of Object.entries(specialKeys)) {
            const lowerText = renderedArgs.text.toLowerCase();
            if (lowerText.includes(placeholder)) {
              // Use case-insensitive regex to split while preserving original case
              const regex = new RegExp(placeholder.replace(/[<>]/g, '\\$&'), 'gi');
              const parts = renderedArgs.text.split(regex);
              for (let i = 0; i < parts.length; i++) {
                if (parts[i]) {
                  await page.fill(renderedArgs.selector, parts[i]);
                }
                if (i < parts.length - 1) {
                  await page.press(renderedArgs.selector, key);
                }
              }
              return;
            }
          }
        }

        // If no special characters, use the original fill method
        await page.fill(renderedArgs.selector, renderedArgs.text);
        break;
      case 'screenshot':
        invariant(
          renderedArgs.path,
          `Browser action 'screenshot' requires a 'path' parameter. ` +
            `Please provide the file path where the screenshot should be saved.\n\n` +
            `Example:\n` +
            `- action: screenshot\n` +
            `  args:\n` +
            `    path: 'screenshots/page.png'\n` +
            `    fullPage: true  # optional: capture entire page\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        logger.debug(
          `Taking screenshot of ${renderedArgs.selector} and saving to ${renderedArgs.path}`,
        );
        await page.screenshot({
          fullPage: renderedArgs.fullPage,
          path: renderedArgs.path,
        });
        break;
      case 'extract':
        invariant(
          renderedArgs.selector || renderedArgs.script,
          `Browser action 'extract' requires either a 'selector' or 'script' parameter.\n\n` +
            `Example with selector:\n` +
            `- action: extract\n` +
            `  args:\n` +
            `    selector: '.result-title'\n` +
            `  name: title\n\n` +
            `Example with script:\n` +
            `- action: extract\n` +
            `  args:\n` +
            `    script: |\n` +
            `      return document.body.innerText.split('Response:')[1]\n` +
            `  name: response\n\n` +
            `Current action args: ${safeJsonStringify(args)}`,
        );
        invariant(
          name,
          `Browser action 'extract' requires a 'name' parameter. ` +
            `Please provide a name to store the extracted content.\n\n` +
            `Example:\n` +
            `- action: extract\n` +
            `  args:\n` +
            `    selector: '.result-title'\n` +
            `  name: title\n\n` +
            `The extracted content will be available as extracted.title in transformResponse.\n\n` +
            `Current action: ${safeJsonStringify(action)}`,
        );
        // eslint-disable-next-line no-case-declarations
        let extractedContent: any;
        if (renderedArgs.script) {
          // Script-based extraction: run custom JavaScript in browser context
          logger.debug(`Extracting content using custom script`);
          extractedContent = await page.evaluate((scriptBody: string) => {
            const fn = new Function(scriptBody);
            return fn();
          }, renderedArgs.script);
          logger.debug(`Extracted content via script: ${safeJsonStringify(extractedContent)}`);
        } else {
          // Selector-based extraction: get textContent from element
          logger.debug(`Waiting for and extracting content from ${renderedArgs.selector}`);
          await this.waitForSelector(page, renderedArgs.selector);
          extractedContent = await page.$eval(renderedArgs.selector, (el: any) => el.textContent);
          logger.debug(`Extracted content from ${renderedArgs.selector}: ${extractedContent}`);
        }
        extracted[name] = extractedContent;
        break;
      case 'wait':
        logger.debug(`Waiting for ${renderedArgs.ms}ms`);
        await page.waitForTimeout(renderedArgs.ms);
        break;
      case 'waitForNewChildren':
        logger.debug(`Waiting for new element in ${renderedArgs.parentSelector}`);
        await this.waitForNewChildren(
          page,
          renderedArgs.parentSelector,
          renderedArgs.delay,
          renderedArgs.timeout,
        );
        break;
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async waitForSelector(page: Page, selector: string): Promise<ElementHandle | null> {
    try {
      return await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    } catch {
      logger.warn(`Timeout waiting for selector: ${selector}`);
      return null;
    }
  }

  private async waitForNewChildren(
    page: Page,
    parentSelector: string,
    delay: number = 1000,
    timeout: number = this.defaultTimeout,
  ): Promise<void> {
    await page.waitForTimeout(delay);

    const initialChildCount = await page.$$eval(
      `${parentSelector} > *`,
      (elements: any[]) => elements.length,
    );

    await page.waitForFunction(
      ({
        parentSelector,
        initialChildCount,
      }: {
        parentSelector: string;
        initialChildCount: number;
      }) => {
        const currentCount = document.querySelectorAll(`${parentSelector} > *`).length;
        return currentCount > initialChildCount;
      },
      { parentSelector, initialChildCount },
      { timeout, polling: 'raf' },
    );
  }

  private renderArgs(args: Record<string, any>, vars: Record<string, any>): Record<string, any> {
    const renderedArgs: Record<string, any> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        renderedArgs[key] = nunjucks.renderString(value, vars);
      } else {
        renderedArgs[key] = value;
      }
    }
    return renderedArgs;
  }
}
