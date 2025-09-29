const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function takeScreenshot(url, outputPath, description) {
  console.log(`Taking screenshot: ${description}`);

  const browser = await puppeteer.launch({
    headless: false, // Set to false to see what's happening
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for React to load
    await page.waitForFunction(() => window.React !== undefined, { timeout: 10000 }).catch(() => {
      console.log('React not detected, continuing anyway...');
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try direct navigation to redteam setup if it exists
    console.log('Attempting to navigate to redteam setup...');
    try {
      await page.goto(`${url}/redteam/setup`, { waitUntil: 'networkidle0', timeout: 15000 });
      console.log('Successfully navigated to redteam setup page');
    } catch (e) {
      console.log('Direct navigation failed, looking for navigation elements...');

      // Look for navigation elements
      await page.evaluate(() => {
        // Look for any links or buttons that might lead to red team setup
        const elements = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        const redteamElement = elements.find(el =>
          el.textContent.toLowerCase().includes('red team') ||
          el.textContent.toLowerCase().includes('redteam') ||
          el.href && el.href.includes('redteam')
        );

        if (redteamElement) {
          redteamElement.click();
          return true;
        }
        return false;
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Look for plugin selection area
    console.log('Looking for plugin checkboxes...');
    await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 }).catch(() => {
      console.log('No checkboxes found immediately, continuing...');
    });

    // Select many plugins to trigger the warning
    const checkboxes = await page.$$('input[type="checkbox"]');
    console.log(`Found ${checkboxes.length} checkboxes`);

    if (checkboxes.length > 0) {
      // Click "Select all" link if it exists
      const selectAllLink = await page.$('span:contains("Select all"), a:contains("Select all")');
      if (selectAllLink) {
        await selectAllLink.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Manually select many checkboxes
        const numToSelect = Math.max(15, Math.floor(checkboxes.length * 0.9));
        console.log(`Selecting ${numToSelect} plugins...`);
        for (let i = 0; i < Math.min(numToSelect, checkboxes.length); i++) {
          try {
            await checkboxes[i].click();
            if (i % 5 === 0) { // Log progress every 5 clicks
              console.log(`Selected ${i + 1} plugins...`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (e) {
            console.log(`Could not click checkbox ${i}: ${e.message}`);
          }
        }
      }

      // Wait for warning/suggestion to appear
      console.log('Waiting for warning/suggestion to appear...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Take full page screenshot first
    console.log('Taking screenshot...');
    await page.screenshot({
      path: outputPath,
      fullPage: true
    });

    console.log(`Screenshot saved: ${outputPath}`);

  } catch (error) {
    console.error(`Error taking screenshot: ${error.message}`);
    // Take a screenshot anyway to see what the page looks like
    try {
      await page.screenshot({ path: outputPath.replace('.png', '-error.png'), fullPage: true });
      console.log(`Error screenshot saved: ${outputPath.replace('.png', '-error.png')}`);
    } catch (e) {
      console.error('Could not take error screenshot');
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const url = 'http://localhost:3000';

  try {
    // Take screenshot of current state (feature branch)
    await takeScreenshot(url, 'screenshot-after.png', 'After - Feature Branch');

    console.log('Screenshots completed!');
    console.log('Files created:');
    console.log('- screenshot-after.png (current feature branch)');

  } catch (error) {
    console.error('Failed to take screenshots:', error);
  }
}

main().catch(console.error);