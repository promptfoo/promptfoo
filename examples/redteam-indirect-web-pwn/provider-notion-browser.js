import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Notion AI Provider that interacts with Notion AI via browser automation.
 *
 * This provider opens a Chromium browser, navigates to Notion AI,
 * and interacts with the chat interface using Playwright.
 *
 * Prerequisites:
 * - notion-state.json (captured via scripts/capture-notion-state.js)
 * - Playwright installed: npx playwright install chromium
 *
 * Config options:
 * - statePath: Path to saved browser state (cookies/localStorage). Defaults to notion-state.json in same dir.
 * - headless: Whether to run in headless mode (default: true)
 * - timeout: Max time to wait for AI response in ms (default: 60000)
 */
class NotionAIBrowserProvider {
  constructor(options = {}) {
    this.statePath = options.config?.statePath || path.join(__dirname, 'notion-state.json');
    this.headless = options.config?.headless ?? true;
    this.timeout = options.config?.timeout || 60000;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  id() {
    return 'notion-ai-browser';
  }

  async initialize() {
    if (this.page) return;

    // Clean up any partial state from a previous failed init
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    console.log('[notion-ai-browser] Launching browser...');
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      storageState: this.statePath,
    });
    this.page = await this.context.newPage();

    console.log('[notion-ai-browser] Navigating to Notion AI...');
    await this.page.goto('https://www.notion.so/ai', {
      waitUntil: 'load',
      timeout: 60000,
    });

    console.log('[notion-ai-browser] Waiting for chat input...');
    await this.page.waitForSelector('[role="textbox"]', { timeout: 60000 });
    await this.page.waitForTimeout(2000);
    console.log('[notion-ai-browser] Chat ready');
  }

  async sendMessage(prompt) {
    // Start a new chat to avoid context from previous messages
    try {
      const newChatButton = this.page.getByRole('button', {
        name: 'New AI chat',
      });
      if (await newChatButton.isVisible({ timeout: 2000 })) {
        await newChatButton.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (_e) {
      // New chat button might not be visible
    }

    const copyButtonsBefore = await this.page
      .getByRole('button', { name: 'Copy response' })
      .count();

    const input = this.page.getByPlaceholder('Ask, search, or make anything');
    await input.fill(prompt);
    await this.page.keyboard.press('Enter');
    console.log('[notion-ai-browser] Message sent, waiting for response...');

    const maxWait = this.timeout;
    const startTime = Date.now();

    // Wait for a new "Copy response" button to appear
    while (Date.now() - startTime < maxWait) {
      const copyButtonsNow = await this.page.getByRole('button', { name: 'Copy response' }).count();
      if (copyButtonsNow > copyButtonsBefore) {
        console.log('[notion-ai-browser] Response detected, stabilizing...');
        break;
      }
      await this.page.waitForTimeout(500);
    }

    // Wait for the response text to stabilize (stop changing)
    let lastText = '';
    let stableCount = 0;
    const stabilityThreshold = 3;

    while (Date.now() - startTime < maxWait && stableCount < stabilityThreshold) {
      const currentText = await this.page.evaluate(() => {
        const textboxes = document.querySelectorAll('[role="textbox"]');
        for (const textbox of textboxes) {
          const placeholder = textbox.getAttribute('placeholder');
          if (placeholder && placeholder.includes('Ask')) continue;
          if (!textbox.hasAttribute('disabled')) {
            const text = textbox.textContent?.trim();
            if (text) return text;
          }
        }
        return '';
      });

      if (currentText === lastText && currentText.length > 0) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastText = currentText;
      await this.page.waitForTimeout(500);
    }

    console.log('[notion-ai-browser] Response complete');
  }

  async getLatestResponse() {
    // Expand any "Thought" sections
    try {
      const thoughtButtons = this.page.getByRole('button', { name: 'Thought' });
      const count = await thoughtButtons.count();
      if (count > 0) {
        await thoughtButtons.last().click();
        await this.page.waitForTimeout(500);
      }
    } catch (_e) {
      // Thought section might not exist
    }

    const result = await this.page.evaluate(() => {
      const textboxes = document.querySelectorAll('[role="textbox"]');
      const responses = [];
      let thinking = null;

      for (const textbox of textboxes) {
        const text = textbox.textContent?.trim();
        if (!text) continue;

        const placeholder = textbox.getAttribute('placeholder');
        if (placeholder && placeholder.includes('Ask')) continue;

        if (textbox.hasAttribute('disabled')) {
          thinking = text;
        } else {
          responses.push({ text, thinking });
        }
      }

      if (responses.length > 0) {
        const last = responses[responses.length - 1];
        if (last.thinking) {
          return `**Thinking:**\n${last.thinking}\n\n**Response:**\n${last.text}`;
        }
        return last.text;
      }

      return null;
    });

    return result || 'No response captured';
  }

  async callApi(prompt) {
    try {
      console.log(`[notion-ai-browser] Received prompt: ${prompt.substring(0, 100)}...`);

      await this.initialize();
      await this.sendMessage(prompt);

      const response = await this.getLatestResponse();
      console.log(`[notion-ai-browser] Response: ${response.substring(0, 100)}...`);

      return {
        output: response,
        metadata: { provider: 'notion-ai-browser' },
      };
    } catch (error) {
      console.error(`[notion-ai-browser] Error: ${error.message}`);
      return { error: error.message || 'Unknown error' };
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

export default NotionAIBrowserProvider;
