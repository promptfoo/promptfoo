# headless-browser (Browser Automation Example)

Browser automation example demonstrating ethical web scraping and testing practices.

You can run this example with:

```bash
npx promptfoo@latest init --example headless-browser
```

## ⚠️ Important: Ethical Considerations

Before using browser automation, please read these critical points:

1. **Always try simpler methods first**: Use APIs, HTTP requests, or WebSocket connections when possible
2. **Respect robots.txt and Terms of Service**: Check before scraping any website
3. **Implement rate limiting**: Too many requests can get you banned or cause server issues
4. **Test on your own applications**: The best practice is testing apps you control

## What This Example Demonstrates

This example shows how to:

- Test a local Gradio application using browser automation
- Implement proper rate limiting and delays
- Extract data responsibly from web interfaces
- Handle dynamic content that requires JavaScript

## Prerequisites

1. **Install browser automation dependencies**:

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

2. **Install Python dependencies** (for the Gradio demo):

```bash
pip install -r requirements.txt
```

## Running the Example

1. **Start the local Gradio demo**:

```bash
python gradio_demo.py
```

This will start a local server at http://localhost:7860

2. **In another terminal, run the browser tests**:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

3. **View the results**:

```bash
npx promptfoo@latest view
```

## Example Results

The main chatbot example (`promptfooconfig.yaml`) demonstrates successful browser automation with a 100% pass rate:

```
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

The `calculator-example.yaml` demonstrates more complex form interactions with a 100% pass rate:

```
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

This example shows how to:
- Navigate between tabs in a web application
- Fill multiple input fields
- Select radio button options
- Click buttons and wait for results
- Extract and verify content from the page

## Understanding the Configuration

The `promptfooconfig.yaml` demonstrates best practices:

- Uses reasonable delays between actions (2-3 seconds)
- Tests against a local application (not external sites)
- Includes proper error handling with transformResponse
- Implements clear assertions for test validation

## Example Selectors

The Gradio demo uses clear element IDs for easy automation:

- `#user-input textarea` - The message input field
- `#submit-button` - The submit button
- `.message.bot-message:last-of-type` - The latest bot response

## Customizing for Your Use Case

To adapt this example for your needs:

1. **For testing your own web app**:
   - Update the URL to your application
   - Modify selectors to match your UI elements
   - Adjust wait times based on your app's performance

2. **For responsible web scraping**:
   - Always check robots.txt first
   - Add delays of at least 3-5 seconds between requests
   - Use descriptive User-Agent headers
   - Limit the number of concurrent requests

3. **For complex interactions**:
   - Chain multiple browser actions
   - Use `waitForNewChildren` for dynamic content
   - Implement proper error handling

## Troubleshooting

- **Browser not visible?** Set `headless: false` in the config
- **Selectors not working?** Use browser DevTools to inspect elements
- **Getting blocked?** Increase delays and reduce request frequency

Remember: With great power comes great responsibility. Use browser automation ethically!
