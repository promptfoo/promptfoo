import { chromium, type Page, type ElementHandle } from 'playwright';
import invariant from 'tiny-invariant';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

interface BrowserAction {
  action: string;
  args?: Record<string, any>;
  name?: string;
}

interface BrowserProviderConfig {
  steps: BrowserAction[];
  responseParser?: string | Function;
  timeoutMs?: number;
  headless?: boolean;
}

function createResponseParser(
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
  responseParser: (extracted: Record<string, any>, finalHtml: string) => ProviderResponse;
  private defaultTimeout: number;
  private headless: boolean;

  constructor(_: string, options: ProviderOptions) {
    this.config = options.config as BrowserProviderConfig;
    this.responseParser = createResponseParser(this.config.responseParser);
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

    const browser = await chromium.launch({
      headless: this.headless,
    });
    const page = await browser.newPage();
    const extracted: Record<string, any> = {};

    try {
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
    const ret = this.responseParser(extracted, finalHtml);
    logger.debug(`Browser response parser output: ${ret}`);
    return { output: ret };
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
        await this.waitForSelector(page, renderedArgs.selector);
        await page.click(renderedArgs.selector);
        break;
      case 'type':
        invariant(renderedArgs.text, `Expected headless action to have a text when using 'type'`);
        invariant(
          renderedArgs.selector,
          `Expected headless action to have a selector when using 'type'`,
        );
        logger.debug(`Waiting for and typing into ${renderedArgs.selector}: ${renderedArgs.text}`);
        await this.waitForSelector(page, renderedArgs.selector);
        //await page.type(renderedArgs.selector, renderedArgs.text);
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
