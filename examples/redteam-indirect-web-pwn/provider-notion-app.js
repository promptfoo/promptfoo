import { chromium } from 'playwright';

/**
 * Playwright-based provider that tests the local Notion clone app.
 *
 * This provider:
 * 1. Launches a Chromium browser
 * 2. Navigates to the Notion clone app (notion-app/)
 * 3. Opens a document and the AI chat panel
 * 4. Sends the attack prompt and waits for the AI response
 * 5. Returns the response for evaluation by promptfoo
 *
 * Prerequisites:
 * - notion-app/ running (npm run notion-app)
 * - OPENAI_API_KEY set (used by the app's AI agent)
 *
 * Config options:
 * - baseUrl: URL of the Notion clone app (default: http://localhost:5001)
 * - documentId: Document to open (default: team-meeting-notes)
 * - headless: Whether to run in headless mode (default: true)
 * - timeout: Max time to wait for AI response in ms (default: 60000)
 */
class NotionAppProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.headless = this.config.headless ?? true;
    this.documentId = this.config.documentId || 'team-meeting-notes';
    this.baseUrl = this.config.baseUrl || 'http://localhost:5001';
    this.timeout = this.config.timeout || 60000;
  }

  id() {
    return 'notion-app';
  }

  async callApi(prompt) {
    const browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    try {
      console.log(`[notion-app] Navigating to ${this.baseUrl}/doc/${this.documentId}`);

      await page.goto(`${this.baseUrl}/doc/${this.documentId}`, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout,
      });

      // Wait for React hydration
      await page.waitForTimeout(3000);

      // Wait for AI assistant button
      await page.waitForSelector('[data-testid="ai-assistant-button"]', {
        timeout: 30000,
        state: 'visible',
      });

      // Open AI chat panel
      console.log('[notion-app] Opening AI chat panel');
      await page.click('[data-testid="ai-assistant-button"]');
      await page.waitForSelector('[data-testid="chat-input"]', {
        timeout: 5000,
      });

      // Type the attack prompt
      console.log(`[notion-app] Typing prompt: ${prompt.substring(0, 100)}...`);
      await page.fill('[data-testid="chat-input"]', prompt);

      // Send message
      console.log('[notion-app] Sending message');
      await page.click('[data-testid="chat-send-button"]');

      // Wait for AI response
      try {
        await page.waitForSelector('text=Thinking...', { timeout: 5000 });
      } catch {
        // Loading indicator might have already passed
      }

      console.log('[notion-app] Waiting for AI response...');
      await page.waitForSelector('[data-testid="chat-message-assistant"]', {
        timeout: this.timeout,
      });

      // Wait for rendering to complete
      await page.waitForTimeout(3000);

      // Extract the AI response
      const response = await page.evaluate(() => {
        const messages = document.querySelectorAll('[data-testid="chat-message-assistant"]');
        const lastMessage = messages[messages.length - 1];
        return lastMessage ? lastMessage.textContent : 'no response';
      });

      console.log(`[notion-app] Got response: ${response.substring(0, 200)}...`);

      return {
        output: response,
        metadata: {
          provider: 'notion-app',
          documentId: this.documentId,
        },
      };
    } catch (err) {
      console.error(`[notion-app] Error: ${err.message}`);
      return {
        output: `Error: ${err.message}`,
        error: err.message,
      };
    } finally {
      await browser.close();
    }
  }
}

export default NotionAppProvider;
