#!/usr/bin/env node
/**
 * Capture screenshots for device authorization documentation
 *
 * Usage: node capture-device-auth-screenshots.mjs
 *
 * Requires:
 * - Server running on localhost:3201
 * - App running on localhost:3200
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../static/img/enterprise-docs');

const API_BASE = 'http://localhost:3201/api/v1';
const APP_BASE = 'http://localhost:3200';

async function createDeviceCode() {
  const response = await fetch(`${API_BASE}/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

// Hide chat widgets and other distracting elements
async function hideUIClutter(page) {
  await page.addStyleTag({
    content: `
      /* Hide Pylon chat widget */
      [class*="pylon"], iframe[src*="pylon"], #pylon-chat-container { display: none !important; }
      /* Hide any other chat widgets */
      [class*="intercom"], [class*="crisp"], [class*="drift"] { display: none !important; }
      /* Hide by common chat widget selectors */
      button[aria-label*="support"], button[aria-label*="chat"] { display: none !important; }
      /* Hide anything fixed to bottom right */
      [style*="position: fixed"][style*="bottom"][style*="right"] { display: none !important; }
    `
  });
  // Also try to remove elements directly
  await page.evaluate(() => {
    document.querySelectorAll('[class*="pylon"], [aria-label*="support"], [aria-label*="chat"]').forEach(el => el.remove());
  });
}

async function main() {
  console.log('Starting screenshot capture...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 600, height: 900 },
    deviceScaleFactor: 2, // Retina quality
  });

  try {
    // Screenshot 1: Code verified state (unauthenticated user with email form)
    console.log('Capturing: device-auth-code-verified.png');
    const deviceCode1 = await createDeviceCode();
    console.log(`  Device code: ${deviceCode1.user_code}`);

    const page1 = await context.newPage();
    await page1.goto(`${APP_BASE}/device?code=${deviceCode1.user_code}`);
    await page1.waitForSelector('text=Code verified', { timeout: 10000 });
    await hideUIClutter(page1);
    await page1.waitForTimeout(300);

    await page1.screenshot({
      path: join(OUTPUT_DIR, 'device-auth-code-verified.png'),
      clip: { x: 0, y: 0, width: 600, height: 800 },
    });
    console.log('  Saved: device-auth-code-verified.png');

    // Login using this page to establish session
    console.log('  Logging in...');
    const emailInput = page1.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('demo@example.com');
      await page1.locator('button:has-text("Sign in & Authorize")').click();
      await page1.waitForSelector('text=Device Authorized', { timeout: 10000 });
      await page1.waitForTimeout(500);
    }
    await page1.close();

    // Screenshot 2: Success state (Device Authorized)
    // Need to create a new code and authorize it to get the success state
    console.log('Capturing: device-auth-success.png');
    const deviceCode2 = await createDeviceCode();
    console.log(`  Device code: ${deviceCode2.user_code}`);

    const page2 = await context.newPage();
    await page2.goto(`${APP_BASE}/device?code=${deviceCode2.user_code}`);
    await page2.waitForSelector('text=Code verified', { timeout: 10000 });
    await hideUIClutter(page2);
    await page2.waitForTimeout(300);

    // Click authorize (should be logged in from previous page)
    const authorizeBtn = page2.locator('button:has-text("Authorize Device")');
    if (await authorizeBtn.isVisible()) {
      await authorizeBtn.click();
      await page2.waitForSelector('text=Device Authorized', { timeout: 10000 });
      await page2.waitForTimeout(500);

      // Dismiss the toast by clicking the X or waiting
      try {
        await page2.locator('[aria-label="close"], .MuiAlert-action button').first().click({ timeout: 1000 });
      } catch {
        // Toast may auto-dismiss
      }
      await hideUIClutter(page2);
      await page2.waitForTimeout(300);

      // Take screenshot with clip to exclude bottom-right chat widget
      await page2.screenshot({
        path: join(OUTPUT_DIR, 'device-auth-success.png'),
        clip: { x: 0, y: 0, width: 600, height: 750 },
      });
      console.log('  Saved: device-auth-success.png');
    } else {
      console.log('  Warning: Authorize Device button not found, user may not be logged in');
    }
    await page2.close();

    // Screenshot 3: Already authenticated user with Authorize button
    console.log('Capturing: device-auth-already-logged-in.png');
    const deviceCode3 = await createDeviceCode();
    console.log(`  Device code: ${deviceCode3.user_code}`);

    const page3 = await context.newPage();
    await page3.goto(`${APP_BASE}/device?code=${deviceCode3.user_code}`);
    await page3.waitForSelector('text=Code verified', { timeout: 10000 });
    await hideUIClutter(page3);
    await page3.waitForTimeout(300);

    // Verify we see the "Authorize Device" button
    const authorizeButton = page3.locator('button:has-text("Authorize Device")');
    if (await authorizeButton.isVisible()) {
      await page3.screenshot({
        path: join(OUTPUT_DIR, 'device-auth-already-logged-in.png'),
        clip: { x: 0, y: 0, width: 600, height: 800 },
      });
      console.log('  Saved: device-auth-already-logged-in.png');
    } else {
      console.log('  Warning: User not logged in, showing email form instead');
    }
    await page3.close();

    console.log('\nAll screenshots captured successfully!');
    console.log(`Output directory: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('Error capturing screenshots:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
