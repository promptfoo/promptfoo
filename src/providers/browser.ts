import { type Page, type ElementHandle, type BrowserContext } from 'playwright';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { maybeLoadFromExternalFile } from '../util';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

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
}

function createTransformResponse(
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
  return ({ extracted, finalHtml }) => ({ output: finalHtml });
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

    const browser = await chromium.launch({
      headless: this.headless,
      args: ['--ignore-certificate-errors'],
    });
    const browserContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

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
    } catch (error) {
      await browser.close();
      return { error: `Headless execution error: ${error}` };
    }

    const finalHtml = await page.content();
    await browser.close();

    logger.debug(`Browser results: ${safeJsonStringify(extracted)}`);
    const ret = this.transformResponse(extracted, finalHtml);
    logger.debug(`Browser response transform output: ${ret}`);
    return { output: ret };
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
      (elements) => elements.length,
    );

    await page.waitForFunction(
      ({ parentSelector, initialChildCount }) => {
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
