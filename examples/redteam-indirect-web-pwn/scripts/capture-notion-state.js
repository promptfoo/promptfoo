/**
 * Captures Notion authentication state (cookies + localStorage) for use
 * with the Notion AI providers.
 *
 * Usage:
 *   npx playwright install chromium
 *   node scripts/capture-notion-state.js
 *
 * This opens a browser window. Log into Notion manually, then press Enter
 * in the terminal to save the state to notion-state.json.
 */

import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, '..', 'notion-state.json');

async function capture() {
  console.log('Launching browser...');
  console.log('Log into Notion in the browser window that opens.');
  console.log('Once logged in, come back here and press Enter to save state.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.notion.so/login', {
    waitUntil: 'load',
    timeout: 60000,
  });

  // Wait for user to log in
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('Press Enter after logging into Notion...', resolve));
  rl.close();

  // Save storage state
  await context.storageState({ path: outputPath });
  console.log(`\nState saved to ${outputPath}`);

  await browser.close();
}

capture().catch(console.error);
