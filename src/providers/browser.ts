import { type BrowserContext, type ElementHandle, type Page } from 'playwright';
import logger from '../logger';
import { fetchWithTimeout } from '../util/fetch';
import { maybeLoadFromExternalFile } from '../util/file';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';

const nunjucks = getNunjucksEngine();

// Constants for connection configuration
const DEFAULT_DEBUGGING_PORT = 9222;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

interface BrowserAction {
  action: string;
  args?: Record<string, any>;
  name?: string;
}

interface BrowserProviderConfig {
  cookies?:
    | Array<{
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
  return (extracted, finalHtml) => ({ output: finalHtml });
}

export class BrowserProvider implements ApiProvider {
  config: BrowserProviderConfig;
  transformResponse: (extracted: Record<string, any>, finalHtml: string) => ProviderResponse;
  private defaultTimeout: number;
  private headless: boolean;

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

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };

    let chromium, stealth;
    try {
      ({ chromium } = await import('playwright-extra'));
      ({ default: stealth } = await import('puppeteer-extra-plugin-stealth'));
    } catch (error) {
      return {
        error: `Failed to import required modules. Please ensure the following packages are installed:\n\tplaywright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    chromium.use(stealth());

    let browser;
    let shouldCloseBrowser = true;
    let browserContext: BrowserContext;

    try {
      // Connect to existing browser or launch new one
      if (this.config.connectOptions) {
        const connectionResult = await this.connectToExistingBrowser(chromium);
        browser = connectionResult.browser;
        shouldCloseBrowser = connectionResult.shouldClose;
      } else {
        browser = await chromium.launch({
          headless: this.headless,
          args: ['--ignore-certificate-errors'],
        });
      }

      // Get or create browser context
      const contexts = browser.contexts();
      if (contexts.length > 0 && this.config.connectOptions) {
        // Use existing context when connecting to existing browser
        browserContext = contexts[0];
        logger.debug('Using existing browser context');
      } else {
        // Create new context
        browserContext = await browser.newContext({
          ignoreHTTPSErrors: true,
        });
      }

      if (this.config.cookies) {
        await this.setCookies(browserContext);
      }

      const page = await browserContext.newPage();
      const extracted: Record<string, any> = {};

      try {
        // Execute all actions
        for (const step of this.config.steps) {
          await this.executeAction(page, step, vars, extracted);
        }

        const finalHtml = await page.content();

        // Clean up
        if (this.config.connectOptions && !shouldCloseBrowser) {
          // Only close the page when connected to existing browser
          await page.close();
        }

        logger.debug(`Browser results: ${safeJsonStringify(extracted)}`);
        const ret = this.transformResponse(extracted, finalHtml);
        logger.debug(`Browser response transform output: ${safeJsonStringify(ret)}`);

        // Check if ret is already a ProviderResponse object (has error or output property)
        // or if it's a raw value that needs to be wrapped
        if (typeof ret === 'object' && ret !== null && ('output' in ret || 'error' in ret)) {
          // Already a ProviderResponse, return as-is
          return ret;
        } else {
          // Raw value, wrap it
          return { output: ret };
        }
      } catch (error) {
        // Clean up on error
        if (this.config.connectOptions && !shouldCloseBrowser) {
          await page.close();
        }
        throw error;
      }
    } catch (error) {
      return { error: `Browser execution error: ${error}` };
    } finally {
      if (shouldCloseBrowser && browser) {
        await browser.close();
      }
    }
  }

  private async setCookies(browserContext: BrowserContext): Promise<void> {
    if (typeof this.config.cookies === 'string') {
      // Handle big blob string of cookies
      const cookieString = maybeLoadFromExternalFile(this.config.cookies) as string;
      const cookiePairs = cookieString.split(';').map((pair) => pair.trim());
      const cookies = cookiePairs.map((pair) => {
        const [name, value] = pair.split('=');
        return { name, value };
      });
      await browserContext.addCookies(cookies);
    } else if (Array.isArray(this.config.cookies)) {
      // Handle array of cookie objects
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
              `  chrome --remote-debugging-port=${port} --user-data-dir=/tmp/chrome-debug`,
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
        invariant(renderedArgs.url, `Expected headless action to have a url when using 'navigate'`);
        logger.debug(`Navigating to ${renderedArgs.url}`);
        await page.goto(renderedArgs.url);
        break;
      case 'click':
        invariant(
          renderedArgs.selector,
          `Expected headless action to have a selector when using 'click'`,
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
        invariant(renderedArgs.text, `Expected headless action to have a text when using 'type'`);
        invariant(
          renderedArgs.selector,
          `Expected headless action to have a selector when using 'type'`,
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
              const parts = lowerText.split(placeholder);
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
          `Expected headless action to have a path when using 'screenshot'`,
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
          renderedArgs.selector,
          `Expected headless action to have a selector when using 'extract'`,
        );
        invariant(name, `Expected headless action to have a name when using 'extract'`);
        logger.debug(`Waiting for and extracting content from ${renderedArgs.selector}`);
        await this.waitForSelector(page, renderedArgs.selector);
        const extractedContent = await page.$eval(
          renderedArgs.selector,
          (el: any) => el.textContent,
        );
        logger.debug(`Extracted content from ${renderedArgs.selector}: ${extractedContent}`);
        if (name) {
          extracted[name] = extractedContent;
        } else {
          throw new Error('Expected headless action to have a name when using `extract`');
        }
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
