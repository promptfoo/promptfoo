/**
 * Custom provider that bridges promptfoo simulated-user with the WebSocket chat
 *
 * This provider:
 * 1. Creates a new session for each conversation
 * 2. Navigates browser to the chat with the session ID
 * 3. Sends messages and receives responses via browser automation
 * 4. Each test gets an isolated conversation context
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

// Track browser instance across tests
let browser = null;
let browserContext = null;

class BrowserChatProvider {
  constructor(options) {
    this.providerId = options?.id || 'browser-chat-provider';
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  /**
   * Call API function that promptfoo invokes
   * @param {string} prompt - The message to send (from simulated user)
   * @param {object} options - Provider options
   * @param {object} context - Test context with vars
   */
  async callApi(prompt, options, context) {
    try {
      // Handle undefined context (simulated-user doesn't pass it)
      const ctx = context || options || {};
      const vars = ctx.vars || {};
      const serverUrl = vars.serverUrl || 'http://localhost:3000';

      // Extract the actual message text from prompt
      // Simulated-user passes messages as a JSON string, parse it first
      let messageText;
      let messages = prompt;

      // Try to parse if it's a JSON string
      if (typeof prompt === 'string') {
        try {
          messages = JSON.parse(prompt);
        } catch (e) {
          // Not JSON, use as-is
          messageText = prompt;
        }
      }

      // Extract from message array
      if (Array.isArray(messages)) {
        // Find the last user message in the conversation
        const userMessages = messages.filter(msg => msg.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1];
        messageText = lastUserMessage?.content || '';
        console.log('[BrowserChatProvider] Extracted from messages:', messageText);
      } else if (!messageText) {
        messageText = String(messages);
        console.log('[BrowserChatProvider] Using as string:', messageText);
      }

      // Get or create session ID for this test
      let sessionId = vars.sessionId;

      if (!sessionId) {
        // Create new session via API
        const response = await fetch(`${serverUrl}/api/session/new`, {
          method: 'POST',
        });
        const data = await response.json();
        sessionId = data.sessionId;

        console.log(`[BrowserChatProvider] Created new session: ${sessionId}`);
      }

      // Connect to browser if not already connected
      const headless = vars.headless !== false; // Default to headless

      if (!browser) {
        if (process.env.USE_CDP === 'true') {
          // Connect to existing Chrome via CDP
          browser = await chromium.connectOverCDP('http://localhost:9222');
          const contexts = browser.contexts();
          browserContext = contexts.length > 0 ? contexts[0] : await browser.newContext();
          console.log('[BrowserChatProvider] Connected to Chrome via CDP');
        } else {
          // Launch new browser in headless mode
          browser = await chromium.launch({ headless });
          browserContext = await browser.newContext();
          console.log(`[BrowserChatProvider] Launched browser (headless: ${headless})`);
        }
      }

      // Create new page for this interaction
      const page = await browserContext.newPage();

      try {
        // Navigate to chat with session ID
        await page.goto(`${serverUrl}/?session=${sessionId}`);

        // Wait for page to load
        await page.waitForSelector('#message-input');

        // Type the message
        await page.fill('#message-input', messageText);

        // Click send
        await page.click('#send-button');

        // Wait for response (3 seconds for streaming to complete)
        await page.waitForTimeout(3000);

        // Extract the last assistant response
        const response = await page.$eval(
          '.message.assistant:last-child .message-content',
          el => el.textContent
        );

        console.log(`[BrowserChatProvider] User: ${messageText}`);
        console.log(`[BrowserChatProvider] Assistant: ${response}`);

        return {
          output: response,
          sessionId, // Include session ID in response for potential reuse
        };
      } finally {
        // Close the page but keep browser/context alive
        await page.close();
      }
    } catch (error) {
      console.error('[BrowserChatProvider] Error:', error);
      console.error('[BrowserChatProvider] Stack:', error.stack);
      return {
        error: `Browser chat provider error: ${error.message}`,
      };
    }
  }
}

module.exports = BrowserChatProvider;
