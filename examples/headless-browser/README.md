# headless-browser

A browser automation example demonstrating how to test web applications using Playwright.

You can run this example with:

```bash
npx promptfoo@latest init --example headless-browser
```

## Overview

This example demonstrates how to:

- Test a local Gradio application using browser automation
- Handle dynamic JavaScript-rendered content
- Extract data from web interfaces
- Work with complex UI interactions (forms, tabs, buttons)

## Prerequisites

Ensure you have Python 3 and Node.js installed on your system.

1. **Install Node.js dependencies**:

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

2. **Install Python dependencies** (for the demo application):

```bash
pip install -r requirements.txt
```

That's it! No additional setup scripts or configuration needed.

## Running the Example

1. **Start the Gradio demo application**:

```bash
python gradio_demo.py
```

This starts a local server at http://localhost:7860

2. **Run the browser automation tests**:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

3. **View the results**:

```bash
npx promptfoo@latest view
```

## Test Results

### Chatbot Example

The main configuration (`promptfooconfig.yaml`) tests a chatbot interface with a 100% pass rate:

```text
┌─────────────────────────────────────────────────┬─────────────────────────────────────────────────┐
│ topic                                           │ [browser-provider] Tell me about {{topic}}      │
├─────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ testing browser automation                      │ [PASS] Test successful! The browser automation  │
│                                                 │ is working correctly.                           │
├─────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ how the system works                            │ [PASS] I received your message: 'Tell me about  │
│                                                 │ how the system works'. This is a simple demo    │
│                                                 │ response!                                       │
├─────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ a simple greeting                               │ [PASS] I received your message: 'Tell me about  │
│                                                 │ a simple greeting'. This is a simple demo       │
│                                                 │ response!                                       │
└─────────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### Calculator Example

The `calculator-example.yaml` demonstrates form interactions with a 100% pass rate:

```text
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ num1              │ num2              │ operation         │ operationSelector │ [browser-provider]│
├───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ 10                │ 5                 │ Add               │ #operation        │ [PASS] Calculator │
│                   │                   │                   │ label:nth-child(1)│ interaction       │
│                   │                   │                   │                   │ successful        │
├───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ 20                │ 4                 │ Multiply          │ #operation        │ [PASS] Calculator │
│                   │                   │                   │ label:nth-child(3)│ interaction       │
│                   │                   │                   │                   │ successful        │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

This example demonstrates:

- Navigate between tabs in a web application
- Fill multiple input fields
- Select radio button options
- Click buttons and wait for results
- Extract and verify content from the page

## Configuration Details

The example configurations demonstrate key concepts:

- **Appropriate delays**: 2-3 seconds between actions for reliability
- **Local testing**: Tests run against localhost:7860
- **Error handling**: Uses `transformResponse` for data extraction
- **Clear assertions**: Validates expected outputs

## Selectors Used

The Gradio application provides consistent selectors:

- `textarea[data-testid="textbox"]` - Message input field
- `button#submit-button` - Submit button
- `div[data-testid="bot"]:last-of-type .prose` - Latest bot response
- `button[value="calculator"]` - Calculator tab button
- `input[type="radio"]` - Operation selection

## Adapting This Example

### Testing Your Own Application

1. Update the `url` in the navigation step
2. Modify selectors to match your UI elements
3. Adjust wait times based on your application's response time
4. Add appropriate assertions for your use case

### Handling Dynamic Content

For single-page applications or AJAX content:

```yaml
- action: waitForNewChildren
  args:
    parentSelector: '#results-container'
    timeout: 10000
```

### Complex Interactions

Chain multiple actions for sophisticated workflows:

```yaml
steps:
  - action: navigate
    args:
      url: 'http://localhost:3000'
  - action: click
    args:
      selector: '#menu-button'
  - action: wait
    args:
      ms: 1000
  - action: click
    args:
      selector: '#dropdown-option-2'
```

## Debugging Tips

| Issue                   | Solution                                        |
| ----------------------- | ----------------------------------------------- |
| Elements not found      | Use browser DevTools to verify selectors        |
| Timing issues           | Increase wait times or use `waitForNewChildren` |
| Want to see the browser | Set `headless: false` in the configuration      |
| Need detailed logs      | Run with `npx promptfoo@latest eval --verbose`  |

## Additional Resources

- [Browser Provider Documentation](/docs/providers/browser)
- [Playwright Selectors Guide](https://playwright.dev/docs/selectors)
- [Gradio Documentation](https://www.gradio.app/docs)
