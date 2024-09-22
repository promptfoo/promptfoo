---
sidebar_position: 54
sidebar_label: Web Browser
---

# Browser Provider

The Browser Provider allows you to automate web browser interactions for testing and scraping purposes.

This provider uses Playwright to control a headless Chrome browser, enabling you to navigate web pages, interact with elements, and extract data.

## Prerequisites

Playwright is a peer dependency of promptfoo, so you will need to install it separately:

```bash
npm install playwright @playwright/browser-chromium
```

## Configuration

To use the Headless Browser Provider, set the provider `id` to `browser` and provide a configuration object with a series of steps to execute.

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
      responseParser: 'data.searchResults'
```

## Supported Actions

The Headless Browser Provider supports the following actions:

1. `navigate`: Go to a specified URL
2. `click`: Click on an element
3. `type`: Enter text into an input field
4. `screenshot`: Take a screenshot of the page
5. `extract`: Extract text content from an element
6. `wait`: Wait for a specified amount of time
7. `waitForNewChildren`: Wait for new children of an element

### Action Details

#### navigate

- `url`: The URL to navigate to

#### click

- `selector`: The CSS selector of the element to click

#### type

- `selector`: The CSS selector of the input element
- `text`: The text to type into the input

#### screenshot

- `filename`: The filename to save the screenshot to

#### extract

- `selector`: The CSS selector of the element to extract text from

#### wait

- `ms`: The number of milliseconds to wait

#### waitForNewChildren

- `parentSelector`: The CSS selector of the parent element to wait for new children of
- `delay`: The number of milliseconds to wait before checking for new children
- `timeout`: The maximum number of milliseconds to wait for new children

## Response Parsing

Use the `responseParser` config option to extract specific data from the results. The parser receives an object with two properties:

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
      responseParser: 'extracted.topResult'

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
      responseParser: (extracted, finalHtml) => extracted.searchResults,
    }
  }],
}
```

## Reference

Supported config options:

| Option         | Type               | Description                                                                                                                                                                  |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| headless       | boolean            | Whether to run the browser in headless mode. Defaults to `true`.                                                                                                             |
| responseParser | string \| Function | A function or string representation of a function to parse the response. Receives an object with `extracted` and `finalHtml` parameters and should return a ProviderResponse |
| steps          | BrowserAction[]    | An array of actions to perform in the browser                                                                                                                                |
| timeoutMs      | number             | The maximum time in milliseconds to wait for the browser operations to complete                                                                                              |

Note: All string values in the config support Nunjucks templating. This means you can use the `{{prompt}}` variable or any other variables passed in the test context.

### Supported Browser Actions

The `steps` array in the configuration can include the following actions:

| Action             | Description                                          | Required Args                      | Optional Args                      |
| ------------------ | ---------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| navigate           | Navigate to a specified URL                          | `url`: string                      |                                    |
| click              | Click on an element                                  | `selector`: string                 |                                    |
| type               | Type text into an input field                        | `selector`: string, `text`: string |                                    |
| screenshot         | Take a screenshot of the page                        | `path`: string                     | `fullPage`: boolean                |
| extract            | Extract text content from an element                 | `selector`: string, `name`: string |                                    |
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

## Troubleshooting

### Iframes

If you are using a selector to interact with the page and it keeps timing out, it could be because the element is inside an iframe.

If this is the case, try loading the iframe contents directly using the `navigate` action.

### Viewing the browser

If you want to view the browser as it runs, you can set the `headless` option to `false` in the config.

```yaml
providers:
  - id: browser
    config:
      headless: false
```

### Debugging

If you are having trouble getting your tests to run, set `headless` to `false` and the browser will open. You can then see what is happening in the browser console.

Additionally, setting the `LOG_LEVEL=debug` environment variable will print debug information to the console during your evaluation.
