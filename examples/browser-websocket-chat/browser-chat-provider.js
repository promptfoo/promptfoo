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

/**
 * Call API function that promptfoo invokes
 * @param {string} prompt - The message to send (from simulated user)
 * @param {object} options - Provider options
 * @param {object} context - Test context with vars
 */
async function callApi(prompt, options, context) {
  try {
    const serverUrl = context.vars?.serverUrl || 'http://localhost:3000';

    // Get or create session ID for this test
    let sessionId = context.vars?.sessionId;

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
    if (!browser) {
      browser = await chromium.connectOverCDP('http://localhost:9222');
      const contexts = browser.contexts();
      browserContext = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log('[BrowserChatProvider] Connected to Chrome');
    }

    // Create new page for this interaction
    const page = await browserContext.newPage();

    try {
      // Navigate to chat with session ID
      await page.goto(`${serverUrl}/?session=${sessionId}`);

      // Wait for page to load
      await page.waitForSelector('#message-input');

      // Type the message
      await page.fill('#message-input', prompt);

      // Click send
      await page.click('#send-button');

      // Wait for response (3 seconds for streaming to complete)
      await page.waitForTimeout(3000);

      // Extract the last assistant response
      const response = await page.$eval(
        '.message.assistant:last-child .message-content',
        el => el.textContent
      );

      console.log(`[BrowserChatProvider] User: ${prompt}`);
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
    return {
      error: `Browser chat provider error: ${error.message}`,
    };
  }
}

module.exports = callApi;
