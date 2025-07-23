---
sidebar_label: Web Browser
---

# Browser Provider

The Browser Provider enables automated web browser interactions for testing and data extraction.

This provider uses [Playwright](https://playwright.dev/) to control a headless Chrome browser, allowing you to navigate pages, interact with elements, and extract data from JavaScript-heavy websites.

## ⚠️ Important Ethical Considerations

Before using the Browser Provider, please consider these critical points:

### When NOT to Use Browser Automation

1. **Try simpler methods first:**
   - Use official APIs when available
   - Try [HTTP Provider](/docs/providers/http) for simple requests
   - Use [WebSocket Provider](/docs/providers/websocket) for real-time data
   - Consider [custom providers](/docs/providers/python) in Python or JavaScript

2. **Legal and ethical risks:**
   - **You may get banned** - Websites can detect and block automated browsers
   - **Respect robots.txt** - Check `https://example.com/robots.txt` before scraping
   - **Follow Terms of Service** - Violating ToS can lead to legal action
   - **Rate limiting is crucial** - Too many requests can overwhelm servers
   - **Privacy matters** - Never scrape personal or sensitive data

3. **Performance considerations:**
   - Browser automation is 10-100x slower than direct API calls
   - It consumes significant CPU and memory resources
   - Network costs can be substantial for large-scale operations

### Best Practices for Ethical Web Scraping

If you must use browser automation:

1. **Always check robots.txt first**
2. **Implement rate limiting** (see examples below)
3. **Use descriptive User-Agent headers**
4. **Respect server resources** - Add delays between requests
5. **Handle errors gracefully** - Don't retry failed requests aggressively
6. **Be transparent** - Consider reaching out to website owners

> **Note**: This tool is intended for legitimate testing, research, and automation purposes. Misuse can result in IP bans, legal consequences, and damage to your reputation.

## Prerequisites

Playwright is a peer dependency of promptfoo, so you will need to install it separately:

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

### Helpful Tools

#### Playwright Recorder Chrome Extension

The easiest way to create browser automation scripts is to use the [Playwright Recorder Chrome Extension](https://chrome.google.com/webstore/detail/playwright-recorder/pbbgjmghmjcpeelnheiphabndacpdfbc). This tool allows you to:

1. Record your browser interactions
2. Generate Playwright code automatically
3. Copy selectors for elements
4. Export actions in multiple formats

To use it:

1. Install the extension from the Chrome Web Store
2. Navigate to your target website
3. Click the extension icon and start recording
4. Perform your actions (click, type, etc.)
5. Stop recording and copy the generated selectors/code
6. Adapt the code for promptfoo's browser provider format

#### Useful Resources

- [Playwright Documentation](https://playwright.dev/docs/intro) - Official Playwright docs
- [Playwright Selectors Guide](https://playwright.dev/docs/selectors) - Learn about CSS, text, and other selector strategies
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Tips for reliable automation
- [Chrome DevTools Guide](https://developer.chrome.com/docs/devtools/) - For inspecting elements and finding selectors

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

## Ethical Usage Examples

### Example 1: Testing Your Own Application

The most ethical use case is testing your own applications:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Testing my own Gradio app locally

providers:
  - id: browser
    config:
      headless: false # Watch the test run
      steps:
        - action: navigate
          args:
            url: 'http://localhost:7860' # Your local app
        - action: wait
          args:
            ms: 2000 # Reasonable delay
        - action: type
          args:
            selector: 'textarea[data-testid="textbox"]'
            text: '{{prompt}}'
        - action: click
          args:
            selector: 'button:contains("Submit")'
        - action: wait
          args:
            ms: 3000 # Wait for processing
        - action: extract
          args:
            selector: '[data-testid="textbox"]:last-of-type'
          name: response
      transformResponse: 'extracted.response'

tests:
  - vars:
      prompt: 'Hello, how are you?'
    assert:
      - type: contains
        value: 'response'
```

### Example 2: Responsible Web Scraping with Rate Limiting

If you must scrape external sites, here's how to do it responsibly:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Responsible scraping with rate limiting

providers:
  - id: browser
    config:
      headless: true
      steps:
        # Always start with a delay to be respectful
        - action: wait
          args:
            ms: 5000 # 5 second initial delay

        - action: navigate
          args:
            url: '{{url}}'

        # Wait for page to fully load
        - action: wait
          args:
            ms: 3000

        # Extract only necessary data
        - action: extract
          args:
            selector: 'h1'
          name: title

        # Another delay before any additional requests
        - action: wait
          args:
            ms: 5000

      transformResponse: |
        return {
          output: extracted.title,
          metadata: {
            scraped_at: new Date().toISOString(),
            user_agent: 'PromptfooBot/1.0 (Testing; Contact: your-email@example.com)'
          }
        };

# Important: Test with very few requests
tests:
  - vars:
      url: 'https://example.com'
    # Add delays between test runs
    delay: 10000 # 10 seconds between tests
```

## Testing Local Applications (Recommended)

The best practice is to test against applications you control. Here's how to set up a simple test environment:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Testing a local demo application

providers:
  - id: browser
    config:
      headless: false # See what's happening
      steps:
        - action: navigate
          args:
            url: 'http://localhost:3000/demo'

        - action: type
          args:
            selector: '#user-input'
            text: '{{input}}'

        - action: click
          args:
            selector: '#submit-button'

        - action: waitForNewChildren
          args:
            parentSelector: '#results-container'
            timeout: 10000

        - action: extract
          args:
            selector: '#results-container .result-item'
          name: results

      transformResponse: 'extracted.results'

scenarios:
  test-functionality:
    tests:
      - vars:
          input: 'test query 1'
        assert:
          - type: not-empty

      - vars:
          input: 'test query 2'
        assert:
          - type: contains
            value: 'expected result'
```

## Testing Streamlit applications

Streamlit applications follow a common pattern where `data-testid` attributes are used to identify elements.

Here's an example configuration:

```yaml
providers:
  - id: browser
    config:
      headless: true # set to false to see the browser
      steps:
        # Load the page - make sure you get the full URL if it's in an iframe!
        - action: navigate
          args:
            url: 'https://doc-chat-llm.streamlit.app/~/+/'
        # Enter the message and press enter
        - action: type
          args:
            selector: 'textarea'
            text: '{{prompt}} <enter>'
        # Wait for the response
        - action: wait
          args:
            ms: 5000
        # Read the response
        - action: extract
          args:
            selector: 'div.stChatMessage:last-of-type'
          name: response
      transformResponse: 'extracted.response'
```

## Selector Strategies

Choosing the right selectors is crucial for reliable automation. Here are common strategies:

### 1. ID Selectors (Most Reliable)

```yaml
selector: '#submit-button' # <button id="submit-button">
```

### 2. Data Attributes

```yaml
selector: '[data-testid="user-input"]' # <input data-testid="user-input">
```

### 3. Class Selectors

```yaml
selector: '.btn-primary' # <button class="btn-primary">
```

### 4. Attribute Selectors

```yaml
selector: 'input[name="email"]'  # <input name="email">
selector: 'button[type="submit"]'  # <button type="submit">
```

### 5. Text Content (Playwright-specific)

```yaml
selector: 'text=Submit'  # Finds element containing "Submit"
selector: 'button:has-text("Submit")'  # Button containing "Submit"
```

### 6. CSS Combinators

```yaml
selector: '#form > input:first-child'  # Direct child
selector: '.container .result-item'     # Descendant
selector: 'h2 + p'                      # Adjacent sibling
```

### 7. Pseudo-selectors

```yaml
selector: 'button:visible'              # Only visible buttons
selector: '.item:nth-child(3)'          # Third item
selector: 'input:not([disabled])'       # Enabled inputs only
```

### Tips for Reliable Selectors

1. **Prefer stable attributes**: IDs and data-testid are less likely to change
2. **Avoid position-based selectors**: `:nth-child()` can break if layout changes
3. **Use the Playwright Recorder**: It suggests optimal selectors
4. **Test selectors in DevTools**: Press F12, use Console with `document.querySelector()`
5. **Be specific but not overly so**: Balance uniqueness with flexibility

## Troubleshooting

### Common Issues and Solutions

| Issue                               | Cause                                          | Solution                                                                                                             |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "Element not found"                 | Selector is incorrect or element hasn't loaded | • Use DevTools to verify selector<br>• Add `wait` before the action<br>• Check if element is in an iframe            |
| "Timeout waiting for selector"      | Page loads slowly or element never appears     | • Increase timeout in action<br>• Add explicit `wait` actions<br>• Check network tab for failed requests             |
| Actions work locally but fail in CI | Different environment or timing                | • Set `headless: false` locally to match CI<br>• Add more explicit waits<br>• Check for environment-specific content |
| "Click intercepted"                 | Another element is covering the target         | • Wait for overlays to disappear<br>• Scroll element into view first<br>• Use JavaScript click as last resort        |

### Debugging Techniques

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
LOG_LEVEL=debug npx promptfoo@latest eval
```

#### 3. Take Screenshots

Capture the page state when something goes wrong:

```yaml
steps:
  - action: navigate
    args:
      url: 'https://example.com'
  - action: screenshot
    args:
      path: 'debug-1.png' # See what loaded
  - action: click
    args:
      selector: '#button'
  - action: screenshot
    args:
      path: 'debug-2.png' # See result of click
```

#### 4. Test Selectors in Browser Console

Before using a selector in your config, test it:

```javascript
// In browser DevTools console (F12)
document.querySelector('your-selector'); // Should return the element
document.querySelectorAll('your-selector').length; // Check how many match
```

### Dealing with Dynamic Content

#### Iframes

If elements are inside an iframe, you may need to navigate directly to the iframe URL:

```yaml
# Instead of the parent page
- action: navigate
  args:
    url: 'https://example.com' # Parent page

# Navigate directly to iframe content
- action: navigate
  args:
    url: 'https://example.com/embedded-content' # Iframe URL
```

#### AJAX/Dynamic Loading

For content loaded after page load:

```yaml
# Option 1: Wait for specific element
- action: waitForNewChildren
  args:
    parentSelector: '#results'
    timeout: 10000

# Option 2: Fixed wait
- action: wait
  args:
    ms: 3000
```

#### Single Page Applications (SPAs)

For React, Vue, Angular apps:

```yaml
# Wait for app to initialize
- action: navigate
  args:
    url: 'https://spa-example.com'
- action: wait
  args:
    ms: 2000 # Let JavaScript framework load
# Now interact with the app
```

## Best Practices for Browser Automation

### 1. Check robots.txt Before Scraping

Always verify that your automation is allowed:

```javascript
// Example robots.txt checker
async function checkRobotsTxt(url) {
  const robotsUrl = new URL('/robots.txt', url).href;
  const response = await fetch(robotsUrl);
  const text = await response.text();

  // Parse and respect the rules
  console.log('Robots.txt:', text);
}
```

### 2. Implement Proper Rate Limiting

Space out your requests to avoid overwhelming servers:

```yaml
providers:
  - id: browser
    config:
      steps:
        # Initial delay
        - action: wait
          args:
            ms: 3000

        # Navigate
        - action: navigate
          args:
            url: '{{url}}'

        # Always wait between actions
        - action: wait
          args:
            ms: 2000

        # Perform action
        - action: click
          args:
            selector: '#button'

        # Final delay before next request
        - action: wait
          args:
            ms: 5000
```

### 3. Use Descriptive User Agents

Identify your automation clearly:

```yaml
providers:
  - id: browser
    config:
      userAgent: 'PromptfooBot/1.0 (Testing; Contact: your-email@example.com)'
```

### 4. Handle Errors Gracefully

Implement proper error handling in your transformResponse:

```yaml
transformResponse: |
  try {
    if (!extracted.content) {
      return {
        output: 'No content found',
        error: 'Content extraction failed'
      };
    }
    return {
      output: extracted.content,
      metadata: {
        extractedAt: new Date().toISOString(),
        success: true
      }
    };
  } catch (error) {
    return {
      output: '',
      error: error.message,
      metadata: {
        failed: true,
        reason: 'Transform error'
      }
    };
  }
```

### 5. Test Incrementally

Start with simple tests and gradually increase complexity:

```yaml
# Start simple
tests:
  - vars:
      url: 'http://localhost:3000'
    assert:
      - type: not-empty

# Then add more complex scenarios
scenarios:
  navigation-test:
    tests:
      - vars:
          action: 'click-button'
        assert:
          - type: contains
            value: 'Success'
```

### 6. Monitor Resource Usage

Browser automation can be resource-intensive. Monitor and limit:

```yaml
providers:
  - id: browser
    config:
      timeoutMs: 30000 # Set reasonable timeouts
      maxConcurrency: 1 # Limit concurrent browsers
```

### 7. Alternative Approaches

Before using browser automation, consider these alternatives:

| Method          | When to Use              | Pros                     | Cons                       |
| --------------- | ------------------------ | ------------------------ | -------------------------- |
| HTTP API        | When an API is available | Fast, reliable, official | May require authentication |
| HTTP Provider   | For simple requests      | Lightweight, fast        | Can't handle JavaScript    |
| WebSocket       | For real-time data       | Efficient for streams    | Complex setup              |
| Custom Provider | For specific needs       | Full control             | Requires coding            |

### 8. Legal and Ethical Checklist

Before running browser automation:

- [ ] Check if the website has an API
- [ ] Read the website's Terms of Service
- [ ] Review robots.txt
- [ ] Implement rate limiting
- [ ] Use descriptive User-Agent
- [ ] Only collect necessary data
- [ ] Secure any collected data
- [ ] Consider reaching out to website owner
- [ ] Document your practices
- [ ] Be prepared to stop if requested

Remember: Just because you _can_ automate something doesn't mean you _should_. Always prioritize ethical practices and respect for website owners and users.

## Quick Reference

### Essential Setup

```bash
# Install dependencies
npm install playwright @playwright/browser-chromium

# Run with debugging
LOG_LEVEL=debug npx promptfoo@latest eval
```

### Basic Configuration Template

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Browser automation test

prompts:
  - 'Search for: {{query}}'

providers:
  - id: browser
    config:
      headless: true
      steps:
        - action: wait
          args: { ms: 2000 } # Initial delay
        - action: navigate
          args: { url: 'https://example.com' }
        - action: type
          args:
            selector: '#search'
            text: '{{query}}'
        - action: click
          args: { selector: '#submit' }
        - action: wait
          args: { ms: 3000 } # Wait for results
        - action: extract
          args:
            selector: '.result'
          name: results
      transformResponse: 'extracted.results'

tests:
  - vars:
      query: 'test search'
    assert:
      - type: javascript
        value: output.length > 0
```

### Playwright Resources

- 📖 [Official Documentation](https://playwright.dev/docs/intro)
- 🎥 [Video Tutorials](https://playwright.dev/docs/videos)
- 🔧 [Playwright Recorder Extension](https://chrome.google.com/webstore/detail/playwright-recorder/pbbgjmghmjcpeelnheiphabndacpdfbc)
- 💬 [Community Discord](https://aka.ms/playwright-discord)

### Remember

✅ **Do**: Test your own applications, use APIs when available, implement rate limiting  
❌ **Don't**: Ignore robots.txt, scrape personal data, overwhelm servers

---

For more examples, check out the [headless-browser example](https://github.com/promptfoo/promptfoo/tree/main/examples/headless-browser) in our GitHub repository.
