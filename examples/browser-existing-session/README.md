# browser-existing-session

Test OAuth-authenticated applications by connecting to existing Chrome browser sessions.

You can run this example with:

```bash
npx promptfoo@latest init --example browser-existing-session
```

## Overview

This example demonstrates two browser provider modes:

1. **Connecting to existing Chrome sessions** - For OAuth/SSO authenticated testing
2. **Launching new browsers** - Normal browser automation

## Quick Start

### 1. Start the test server

```bash
cd examples/browser-existing-session
node server.js
```

### 2. For OAuth testing (existing session)

```bash
# Start Chrome with debugging
chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test

# Manually log into your application in that Chrome instance

# Run tests using the existing session
npx promptfoo eval --filter-providers existing-session
```

### 3. For normal browser testing

```bash
# Just run the tests (launches new browser)
npx promptfoo eval --filter-providers new-browser
```

## Configuration

The `promptfooconfig.yaml` includes both modes:

```yaml
providers:
  # Connect to existing session
  - id: browser
    label: existing-session
    config:
      connectOptions:
        debuggingPort: 9222
      # ... test steps

  # Launch new browser
  - id: browser
    label: new-browser
    config:
      headless: true
      # ... test steps
```

## Prerequisites

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

## Files

- `promptfooconfig.yaml` - Example configuration showing both modes
- `server.js` - Test web server
- `test-page.html` - Mock authenticated chat interface
