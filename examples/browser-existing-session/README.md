# browser-existing-session

Connect to an existing Chrome browser session to test OAuth-authenticated applications.

You can run this example with:

```bash
npx promptfoo@latest init --example browser-existing-session
```

## Overview

This example demonstrates how to:

- Connect to an existing Chrome browser session with active authentication
- Test applications that require OAuth/SSO login
- Maintain session state across test runs
- Handle multi-turn conversations with authenticated context

## ⚠️ Security Warning

Connecting to existing browser sessions exposes ALL tabs and data in that browser instance. Only use this feature:

- In isolated testing environments
- With dedicated test accounts
- Never with your personal browser profile

## Prerequisites

1. **Install browser automation dependencies**:

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

2. **Start Chrome with debugging enabled**:

**Option 1: New profile (recommended)**

```bash
# macOS/Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-testing

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-testing
```

**Option 2: Existing profile (use with caution)**

```bash
# Close all Chrome instances first!
google-chrome --remote-debugging-port=9222
```

3. **Manually authenticate**:
   - Open your application in the Chrome instance
   - Complete the OAuth/SSO login flow
   - Keep Chrome running

## Configuration

### Basic Connection

```yaml
providers:
  - id: browser
    config:
      connectOptions:
        debuggingPort: 9222
        acceptSecurityRisk: true # Required acknowledgment

      steps:
        - action: navigate
          args:
            url: 'https://your-app.com/chat'
        # ... rest of your test steps
```

### WebSocket Connection

If you know the WebSocket endpoint:

```yaml
providers:
  - id: browser
    config:
      connectOptions:
        mode: websocket
        wsEndpoint: 'ws://localhost:9222/devtools/browser/...'
        acceptSecurityRisk: true
```

### With Session Verification

```yaml
providers:
  - id: browser
    config:
      connectOptions:
        debuggingPort: 9222
        acceptSecurityRisk: true

      # Optional: verify we're authenticated
      steps:
        - action: navigate
          args:
            url: 'https://your-app.com/dashboard'

        - action: wait
          args:
            selector: '[data-testid="user-menu"]'
            # This will fail if not authenticated
```

## Running the Example

1. Ensure Chrome is running with debugging enabled and you're logged in
2. Run the evaluation:

```bash
npx promptfoo eval
```

3. View results:

```bash
npx promptfoo view
```

## Common Issues

### "Cannot connect to Chrome"

- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check no firewall is blocking port 9222
- Try `curl http://localhost:9222/json/version` to verify

### "Multiple browser contexts"

- The provider uses the first available context
- Close extra tabs/windows if needed

### Session expires during testing

- Reduce test duration
- Implement session refresh in your test steps
- Consider saving/loading cookies instead

## Alternative Approaches

For production use, consider these more secure alternatives:

1. **Custom Provider with API tokens**
2. **HTTP Provider with extracted cookies**
3. **Session state export/import**

See the main documentation for details on these approaches.
