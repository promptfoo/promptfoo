---
sidebar_label: Web Browser
description: 'Execute LLM evaluations directly in browsers using WebGPU acceleration and local models for privacy-preserving testing'
---

# Browser Provider

The Browser Provider enables automated web browser interactions for testing complex web applications and JavaScript-heavy websites where simpler providers are not sufficient.

This provider uses [Playwright](https://playwright.dev/) to control headless browsers, allowing you to navigate pages, interact with elements, and extract data from dynamic websites. Playwright supports Chromium (Chrome, Edge), Firefox, and WebKit (Safari engine) browsers.

## When to Use the Browser Provider

The Browser Provider should only be used when simpler alternatives are not possible:

1. **Try these first:**
   - [HTTP Provider](/docs/providers/http) - For API calls and simple HTML responses
   - [WebSocket Provider](/docs/providers/websocket) - For real-time connections
   - [Custom Python Provider](/docs/providers/python) - For custom logic with existing libraries
   - [Custom JavaScript Provider](/docs/providers/custom-api) - For Node.js-based solutions

2. **Use Browser Provider only when:**
   - The application requires JavaScript execution to render content
   - You need to interact with complex UI elements (dropdowns, modals, etc.)
   - Authentication requires browser-based workflows (OAuth, SSO)
   - You need to test actual user interactions (clicks, typing, scrolling)

### Important Considerations

When using browser automation:

1. **Rate Limiting**: Always implement delays between requests to avoid overwhelming servers
2. **Anti-Bot Detection**: Many websites employ anti-bot measures that can detect and block automated browsers
3. **Resource Usage**: Browser automation is 10-100x slower than direct API calls and consumes significant CPU/memory
4. **Legal Compliance**: Always check the website's Terms of Service and robots.txt before automating

## Prerequisites

Playwright is a peer dependency of promptfoo, so you will need to install it separately:

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

Note: Currently, promptfoo's browser provider only supports Chromium-based browsers (Chrome, Edge). The provider uses `playwright-extra` with the Chromium engine for enhanced stealth capabilities.

## Configuration

To use the Browser Provider, set the provider `id` to `browser` and define a series of `steps` to execute:

```yaml
providers:
  - id: browser
    config:
      steps:
        - action: navigate
          args:
            url: 'https://example.com'
        - action: type
          args:
            selector: '#search-input'
            text: '{{prompt}}'
        - action: click
          args:
            selector: '#search-button'
        - action: extract
          args:
            selector: '#results'
          name: searchResults
      transformResponse: 'extracted.searchResults'
```

### Connecting to Existing Browser Sessions

You can connect to an existing Chrome browser session (e.g., with OAuth authentication already completed):

```yaml
providers:
  - id: browser
    config:
      connectOptions:
        debuggingPort: 9222 # Chrome debugging port

      steps:
        # Your test steps here
```

**Setup Instructions**:

1. Start Chrome with debugging: `chrome --remote-debugging-port=9222 --user-data-dir=/tmp/test`
2. Complete authentication manually
3. Run your tests

**Connection Options**:

- `debuggingPort`: Port number for Chrome DevTools Protocol (default: 9222)
- `mode`: Connection mode - `'cdp'` (default) or `'websocket'`
- `wsEndpoint`: Direct WebSocket endpoint (when using `mode: 'websocket'`)

## Supported Actions

The Browser Provider supports the following actions:

### Core Actions

#### 1. `navigate` - Load a webpage

Navigate to a specified URL.

```yaml
- action: navigate
  args:
    url: 'https://example.com/search?q={{query}}'
```

#### 2. `click` - Click an element

Click on any clickable element (button, link, etc.).

```yaml
- action: click
  args:
    selector: 'button[type="submit"]'
    optional: true # Won't fail if element doesn't exist
```

#### 3. `type` - Enter text

Type text into input fields, textareas, or any editable element.

```yaml
- action: type
  args:
    selector: 'input[name="username"]'
    text: '{{username}}'
```

Special keys:

- `<enter>` - Press Enter key
- `<tab>` - Press Tab key
- `<escape>` - Press Escape key

#### 4. `extract` - Get text content

Extract text from any element. The extracted content is available in `transformResponse`.

```yaml
- action: extract
  args:
    selector: '.result-title'
  name: title # Access as extracted.title
```

#### 5. `wait` - Pause execution

Wait for a specified duration (in milliseconds).

```yaml
- action: wait
  args:
    ms: 3000 # Wait 3 seconds
```

#### 6. `waitForNewChildren` - Wait for dynamic content

Wait for new elements to appear under a parent element. Useful for content loaded via AJAX.

```yaml
- action: waitForNewChildren
  args:
    parentSelector: '#results-container'
    delay: 500 # Check every 500ms
    timeout: 10000 # Max wait time 10 seconds
```

#### 7. `screenshot` - Capture the page

Take a screenshot of the current page state.

```yaml
- action: screenshot
  args:
    path: 'screenshot.png'
    fullPage: true # Capture entire page, not just viewport
```

### Action Parameters

| Action             | Required Args      | Optional Args      | Description                      |
| ------------------ | ------------------ | ------------------ | -------------------------------- |
| navigate           | `url`              | -                  | URL to navigate to               |
| click              | `selector`         | `optional`         | CSS selector of element to click |
| type               | `selector`, `text` | -                  | CSS selector and text to type    |
| extract            | `selector`, `name` | -                  | CSS selector and variable name   |
| wait               | `ms`               | -                  | Milliseconds to wait             |
| waitForNewChildren | `parentSelector`   | `delay`, `timeout` | Parent element to watch          |
| screenshot         | `path`             | `fullPage`         | File path to save screenshot     |

## Response Parsing

Use the `transformResponse` config option to extract specific data from the results. The parser receives an object with two properties:

- `extracted`: An object containing named results from `extract` actions
- `finalHtml`: The final HTML content of the page after all actions are completed

## Variables and Templating

You can use Nunjucks templating in your configuration, including the `{{prompt}}` variable and any other variables passed in the test context.

```yaml
providers:
  - id: browser
    config:
      steps:
        - action: navigate
          args:
            url: 'https://example.com/search?q={{prompt}}'
        - action: extract
          args:
            selector: '#first-result'
          name: topResult
      transformResponse: 'extracted.topResult'

tests:
  - vars:
      prompt: 'What is the capital of France?'
```

## Using as a Library

If you are using promptfoo as a [node library](/docs/usage/node-package/), you can provide the equivalent provider config:

```js
{
  // ...
  providers: [{
    id: 'browser',
    config: {
      steps: [
        { action: 'navigate', args: { url: 'https://example.com' } },
        { action: 'type', args: { selector: '#search', text: '{{prompt}}' } },
        { action: 'click', args: { selector: '#submit' } },
        { action: 'extract', args: { selector: '#results' }, name: 'searchResults' }
      ],
      transformResponse: (extracted, finalHtml) => extracted.searchResults,
    }
  }],
}
```

## Reference

Supported config options:

| Option            | Type                                                                             | Description                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| headless          | `boolean`                                                                        | Whether to run the browser in headless mode. Defaults to `true`.                                                                                                             |
| cookies           | `string` \| `{ name: string; value: string; domain?: string; path?: string; }[]` | A string or array of cookies to set on the browser                                                                                                                           |
| transformResponse | `string` \| `Function`                                                           | A function or string representation of a function to parse the response. Receives an object with `extracted` and `finalHtml` parameters and should return a ProviderResponse |
| steps             | `BrowserAction[]`                                                                | An array of actions to perform in the browser                                                                                                                                |
| timeoutMs         | `number`                                                                         | The maximum time in milliseconds to wait for the browser operations to complete                                                                                              |

Note: All string values in the config support Nunjucks templating. This means you can use the `{{prompt}}` variable or any other variables passed in the test context.

### Browser Support

While Playwright supports multiple browsers (Chromium, Firefox, and WebKit), promptfoo's browser provider currently only implements Chromium support. This includes:

- **Chrome** - Google's browser
- **Edge** - Microsoft's Chromium-based browser
- **Chromium** - Open-source browser project

The implementation uses `playwright-extra` with the Chromium engine for enhanced stealth capabilities to avoid detection.

### Supported Browser Actions

The `steps` array in the configuration can include the following actions:

| Action             | Description                                          | Required Args                      | Optional Args                      |
| ------------------ | ---------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| navigate           | Navigate to a specified URL                          | `url`: string                      |                                    |
| click              | Click on an element                                  | `selector`: string                 | `optional`: boolean                |
| extract            | Extract text content from an element                 | `selector`: string, `name`: string |                                    |
| screenshot         | Take a screenshot of the page                        | `path`: string                     | `fullPage`: boolean                |
| type               | Type text into an input field                        | `selector`: string, `text`: string |                                    |
| wait               | Wait for a specified amount of time                  | `ms`: number                       |                                    |
| waitForNewChildren | Wait for new child elements to appear under a parent | `parentSelector`: string           | `delay`: number, `timeout`: number |

Each action in the `steps` array should be an object with the following structure:

```typescript
{
  action: string;
  args: {
    [key: string]: any;
  };
  name?: string;
}
```

Each step in the `steps` array should have the following structure:

- `action`: Specifies the type of action to perform (e.g., 'navigate', 'click', 'type').
- `args`: Contains the required and optional arguments for the action.
- `name` (optional): Used to name extracted content in the 'extract' action.

Steps are executed sequentially, enabling complex web interactions.

All string values in `args` support Nunjucks templating, allowing use of variables like `{{prompt}}`.

## Advanced Features

### Playwright Recorder Tools

The easiest way to create browser automation scripts is to record your interactions:

#### Chrome Extension (Recommended)

The [Playwright Recorder Chrome Extension](https://chrome.google.com/webstore/detail/playwright-recorder/pbbgjmghmjcpeelnheiphabndacpdfbc) is particularly helpful for quickly generating selectors:

1. Install the extension from the Chrome Web Store
2. Navigate to your target website
3. Click the extension icon and start recording
4. Perform your actions (click, type, etc.)
5. Stop recording and copy the generated selectors/code
6. Adapt the code for promptfoo's browser provider format

This extension is especially useful because it:

- Shows selectors in real-time as you hover over elements
- Generates multiple selector options (CSS, text, XPath)
- Allows you to copy individual selectors without recording full actions

#### Playwright Inspector (All Browsers)

For cross-browser recording, use Playwright's built-in recorder:

```bash
npx playwright codegen https://example.com
```

This opens an interactive browser window where you can perform actions and see generated code in real-time. You can choose between Chromium, Firefox, or WebKit.

### Selector Strategies

Playwright supports various selector strategies:

| Strategy | Example                          | Description                   |
| -------- | -------------------------------- | ----------------------------- |
| CSS      | `#submit-button`                 | Standard CSS selectors        |
| Text     | `text=Submit`                    | Find elements by text content |
| Role     | `role=button[name="Submit"]`     | ARIA role-based selectors     |
| Test ID  | `data-testid=submit`             | Data attribute selectors      |
| XPath    | `xpath=//button[@type="submit"]` | XPath expressions             |

For the most reliable selectors:

- Prefer stable attributes like IDs and data-testid
- Use role-based selectors for accessibility
- Avoid position-based selectors that can break with layout changes

### Debugging

#### 1. Disable Headless Mode

See exactly what's happening in the browser:

```yaml
providers:
  - id: browser
    config:
      headless: false # Opens visible browser window
```

#### 2. Enable Debug Logging

Get detailed information about each action:

```bash
npx promptfoo@latest eval --verbose
```

#### 3. Take Screenshots

Capture the page state during execution:

```yaml
steps:
  - action: navigate
    args:
      url: 'https://example.com'
  - action: screenshot
    args:
      path: 'debug-{{_attempt}}.png'
```

### Performance Optimization

1. **Use headless mode in production**: It's faster and uses fewer resources
2. **Minimize wait times**: Only wait as long as necessary
3. **Batch operations**: Group related actions together
4. **Reuse browser contexts**: For multiple tests against the same site

### Best Practices for Rate Limiting

Implementing proper rate limiting is crucial to avoid detection and server overload:

```yaml
providers:
  - id: browser
    config:
      steps:
        # Always start with a respectful delay
        - action: wait
          args:
            ms: 2000

        - action: navigate
          args:
            url: 'https://example.com'

        # Wait between actions
        - action: wait
          args:
            ms: 1000

        - action: click
          args:
            selector: '#button'

        # Final delay before next request
        - action: wait
          args:
            ms: 3000
```

**Tips for avoiding detection:**

- Randomize delays between actions (1-3 seconds)
- Use the stealth plugin (included with playwright-extra)
- Avoid patterns that look automated
- Consider using different user agents
- Respect robots.txt and rate limits

### Dealing with Anti-Bot Measures

Many websites implement anti-bot detection systems (like Cloudflare, reCAPTCHA, etc.). Here's how to handle common scenarios:

#### Common Anti-Bot Challenges

| Challenge              | Detection Method                 | Mitigation Strategy                             |
| ---------------------- | -------------------------------- | ----------------------------------------------- |
| Browser fingerprinting | JavaScript checks for automation | Stealth plugin helps mask automation            |
| Behavioral analysis    | Mouse movements, typing patterns | Add realistic delays and interactions           |
| IP rate limiting       | Too many requests from one IP    | Implement proper delays, use proxies cautiously |
| CAPTCHA challenges     | Human verification tests         | Consider if the site allows automation          |
| User-Agent detection   | Checking for headless browsers   | Use realistic user agent strings                |

#### Example with Anti-Bot Considerations

```yaml
providers:
  - id: browser
    config:
      headless: false # Some sites detect headless mode
      steps:
        # Human-like delay before starting
        - action: wait
          args:
            ms: 3000

        - action: navigate
          args:
            url: '{{url}}'

        # Wait for any anti-bot checks to complete
        - action: wait
          args:
            ms: 5000

        # Type slowly like a human would
        - action: type
          args:
            selector: '#search'
            text: '{{query}}'
            delay: 100 # Delay between keystrokes
```

**Note**: If a website has strong anti-bot measures, it's often a sign that automation is not welcome. Always respect the website owner's wishes and consider reaching out for API access instead.

## Example: Testing a Login Flow

Here's a complete example testing a login workflow:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Test login functionality

prompts:
  - 'Login with username {{username}} and password {{password}}'

providers:
  - id: browser
    config:
      headless: true
      steps:
        - action: navigate
          args:
            url: 'https://example.com/login'

        - action: type
          args:
            selector: '#username'
            text: '{{username}}'

        - action: type
          args:
            selector: '#password'
            text: '{{password}}'

        - action: click
          args:
            selector: 'button[type="submit"]'

        - action: wait
          args:
            ms: 2000

        - action: extract
          args:
            selector: '.welcome-message'
          name: welcomeText

      transformResponse: |
        return {
          output: extracted.welcomeText,
          success: extracted.welcomeText.includes('Welcome')
        };

tests:
  - vars:
      username: 'testuser'
      password: 'testpass123'
    assert:
      - type: javascript
        value: output.success === true
```

## Troubleshooting

### Common Issues and Solutions

| Issue                          | Cause                                      | Solution                                                                                         |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| "Element not found"            | Selector incorrect or element not loaded   | • Verify selector in DevTools<br />• Add wait before action<br />• Check if element is in iframe |
| "Timeout waiting for selector" | Page loads slowly or element never appears | • Increase timeout<br />• Add explicit wait actions<br />• Check for failed network requests     |
| "Access denied" or 403 errors  | Anti-bot detection triggered               | • Use headless: false<br />• Add more delays<br />• Check if automation is allowed               |
| "Click intercepted"            | Element covered by overlay                 | • Wait for overlays to disappear<br />• Scroll element into view<br />• Use force click option   |
| Inconsistent results           | Timing or detection issues                 | • Add consistent delays<br />• Use stealth plugin<br />• Test during off-peak hours              |

### Debugging Anti-Bot Detection

If you suspect anti-bot measures are blocking your automation:

```yaml
providers:
  - id: browser
    config:
      headless: false # Always start with headed mode for debugging
      steps:
        - action: navigate
          args:
            url: '{{url}}'

        - action: screenshot
          args:
            path: 'debug-landing.png' # Check if you hit a challenge page

        - action: wait
          args:
            ms: 10000 # Longer wait to see what happens

        - action: screenshot
          args:
            path: 'debug-after-wait.png'
```

## Useful Resources

- [Playwright Documentation](https://playwright.dev/docs/intro) - Official Playwright docs
- [Playwright Browsers Guide](https://playwright.dev/docs/browsers) - Detailed information about supported browsers
- [Playwright Selectors Guide](https://playwright.dev/docs/selectors) - Learn about CSS, text, and other selector strategies
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Tips for reliable automation
- [Playwright Inspector](https://playwright.dev/docs/inspector) - Interactive tool for authoring and debugging tests
- [Chrome DevTools Guide](https://developer.chrome.com/docs/devtools/) - For inspecting elements and finding selectors

---

For more examples, check out the [headless-browser example](https://github.com/promptfoo/promptfoo/tree/main/examples/headless-browser) in our GitHub repository.
