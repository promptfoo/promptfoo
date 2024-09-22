import { chromium, Browser, Page, ElementHandle } from 'playwright';
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

interface HeadlessAction {
  action: string;
  args?: Record<string, any>;
  name?: string;
}

interface HeadlessProviderConfig {
  steps: HeadlessAction[];
  responseParser?: string | Function;
  timeoutMs?: number;
}

function createResponseParser(parser: any): (data: any) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('data', `return ${parser}`) as (data: any) => ProviderResponse;
  }
  return (data) => ({ output: data });
}

export class HeadlessProvider implements ApiProvider {
  config: HeadlessProviderConfig;
  responseParser: (data: any) => ProviderResponse;
  private defaultTimeout: number;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config as HeadlessProviderConfig;
    this.responseParser = createResponseParser(this.config.responseParser);
    invariant(
      Array.isArray(this.config.steps),
      `Expected Headless provider to have a config containing {steps}, but got ${safeJsonStringify(
        this.config,
      )}`,
    );
    this.defaultTimeout = this.config.timeoutMs || 30000; // Default 30 seconds timeout
  }

  id(): string {
    return 'headless-provider';
  }

  toString(): string {
    return '[Headless Provider]';
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };

    const browser = await chromium.launch({
      headless: false,
    });
    const page = await browser.newPage();
    const results: Record<string, any> = {};

    try {
      for (const step of this.config.steps) {
        await this.executeAction(page, step, vars, results);
      }
    } catch (error) {
      await browser.close();
      return { error: `Headless execution error: ${error}` };
    }

    const finalHtml = await page.content();
    await browser.close();

    return this.responseParser({ results, finalHtml });
  }

  private async executeAction(
    page: Page,
    action: HeadlessAction,
    vars: Record<string, any>,
    results: Record<string, any>,
  ): Promise<void> {
    const { action: actionType, args = {}, name } = action;
    const renderedArgs = this.renderArgs(args, vars);

    logger.debug(`Executing headless action: ${actionType}`);

    switch (actionType) {
      case 'navigate':
        logger.debug(`Navigating to ${renderedArgs.url}`);
        await page.goto(renderedArgs.url);
        break;
      case 'click':
        logger.debug(`Waiting for and clicking on ${renderedArgs.selector}`);
        await this.waitForSelector(page, renderedArgs.selector);
        await page.click(renderedArgs.selector);
        break;
      case 'type':
        logger.debug(`Waiting for and typing into ${renderedArgs.selector}: ${renderedArgs.text}`);
        await this.waitForSelector(page, renderedArgs.selector);
        //await page.type(renderedArgs.selector, renderedArgs.text);
        await page.fill(renderedArgs.selector, renderedArgs.text);
        break;
      case 'screenshot':
        logger.debug(`Taking screenshot of ${renderedArgs.selector}`);
        const screenshotBuffer = await page.screenshot({ fullPage: renderedArgs.fullPage });
        if (name) {
          results[name] = screenshotBuffer.toString('base64');
        }
        break;
      case 'extract':
        logger.debug(`Waiting for and extracting content from ${renderedArgs.selector}`);
        await this.waitForSelector(page, renderedArgs.selector);
        const extractedContent = await page.$eval(
          renderedArgs.selector,
          (el: any) => el.textContent,
        );
        logger.debug(`Extracted content from ${renderedArgs.selector}: ${extractedContent}`);
        if (name) {
          results[name] = extractedContent;
        } else {
          throw new Error('Expected headless action to have a name when using `extract`');
        }
        break;
      case 'wait':
        logger.debug(`Waiting for ${renderedArgs.ms}ms`);
        await page.waitForTimeout(renderedArgs.ms);
        break;
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async waitForSelector(page: Page, selector: string): Promise<ElementHandle | null> {
    try {
      return await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    } catch (error) {
      logger.warn(`Timeout waiting for selector: ${selector}`);
      return null;
    }
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
