# browser-websocket-chat

Test WebSocket-based chat applications with multi-turn conversations and session persistence.

You can run this example with:

```bash
npx promptfoo@latest init --example browser-websocket-chat
```

## Overview

This example demonstrates how to test real-time chat applications with:

- **WebSocket communication** - Real-time bidirectional messaging
- **Streaming responses** - Word-by-word token streaming (like ChatGPT/Copilot)
- **Session management** - Cookie-based conversation persistence
- **Multi-turn context** - Tests that validate conversation memory across messages
- **Browser automation** - Using existing Chrome sessions to maintain state

Inspired by Microsoft 365 Copilot's chat interface.

## Quick Start

### 1. Install dependencies

```bash
cd examples/browser-websocket-chat
npm install
```

### 2. Start the server

```bash
npm start
```

Server runs at [http://localhost:3000](http://localhost:3000)

### 3. Start Chrome with debugging

```bash
# macOS/Linux
chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

### 4. Navigate to the chat

Open [http://localhost:3000](http://localhost:3000) in the Chrome instance you started with debugging enabled.

### 5. Run the tests

```bash
npx promptfoo eval
```

The tests will execute multi-turn conversations, validating that context is preserved across messages.

## How It Works

### Architecture

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Browser   │ ◄────────────────────────► │   Server    │
│ (Playwright)│         Streaming          │  (Express)  │
└─────────────┘                            └─────────────┘
      │                                           │
      │ Session Cookie                            │
      ▼                                           ▼
┌─────────────┐                          ┌─────────────┐
│   Chrome    │                          │ Conversation│
│   Context   │                          │   History   │
└─────────────┘                          └─────────────┘
```

### Session Flow

1. **Browser connects** → Server creates session → Sets cookie
2. **WebSocket opens** → Server reads session cookie
3. **User sends message** → Server loads conversation history
4. **Server responds** → Streams response word-by-word
5. **History saved** → Updates session with new messages
6. **Next test** → Same browser = same cookie = same session!

### Multi-Turn Testing

The key to multi-turn testing is using `connectOptions` in the browser provider:

```yaml
providers:
  - id: browser
    config:
      connectOptions:
        debuggingPort: 9222  # Reuses browser = preserves cookies
```

When you connect to an existing Chrome instance, the browser provider:

- ✅ Reuses the same browser context
- ✅ Preserves cookies between tests
- ✅ Maintains session state
- ✅ Only closes pages (not the browser)

This allows sequential tests to build on previous conversations!

### Example Test Sequence

```yaml
tests:
  # Test 1: Ask about weather
  - vars:
      message: 'What is the weather?'
    assert:
      - type: contains
        value: 'sunny'

  # Test 2: Context-aware follow-up
  - vars:
      message: 'What about tomorrow?'
    assert:
      - type: contains
        value: 'cloudy'  # Server knows we're talking about weather!
```

The second test proves context preservation - the server remembers the weather topic from test 1.

## Testing Strategy

### Wait for Streaming Completion

WebSocket responses stream word-by-word, so we need to wait for completion:

```yaml
steps:
  # Click send button
  - action: click
    args:
      selector: '#send-button'

  # Wait for assistant message to appear
  - action: waitForNewChildren
    args:
      parentSelector: '#chat-container'
      delay: 100
      timeout: 10000

  # Wait for streaming to finish
  - action: wait
    args:
      ms: 2000

  # Now extract is safe
  - action: extract
    args:
      selector: '.message.assistant:last-child .message-content'
    name: response
```

### Context Validation

Test context preservation with follow-up questions:

```yaml
# First establish a topic
- vars:
    message: 'What is the weather?'

# Then test context-aware response
- vars:
    message: 'What about tomorrow?'
  assert:
    - type: javascript
      value: output.includes('partly cloudy')
```

## Files

- `server.js` - Express + WebSocket server with session management
- `public/chat.html` - Copilot-inspired chat UI with streaming support
- `promptfooconfig.yaml` - Multi-turn conversation tests
- `package.json` - Server dependencies

## Server Features

### Context-Aware Responses

The server tracks conversation topics and generates context-aware responses:

```javascript
// User: "What is the weather?"
// Server: "Sunny and 72°F"
// Topics: [weather]

// User: "What about tomorrow?"
// Server: "Tomorrow will be partly cloudy, 68°F"  ← Context-aware!
```

### Conversation History

Each session maintains its own conversation history:

```javascript
conversations.get(sessionId)
// => [
//   { role: 'user', content: 'What is the weather?' },
//   { role: 'assistant', content: 'Sunny and 72°F' },
//   { role: 'user', content: 'What about tomorrow?' },
//   { role: 'assistant', content: 'Tomorrow will be partly cloudy' }
// ]
```

### Streaming Implementation

Responses stream word-by-word at 50ms intervals:

```javascript
async function streamResponse(ws, text) {
  const words = text.split(' ');
  for (const word of words) {
    ws.send(JSON.stringify({ type: 'chunk', content: word + ' ' }));
    await sleep(50);
  }
  ws.send(JSON.stringify({ type: 'done' }));
}
```

## Troubleshooting

### Tests fail with "Element not found"

- Make sure the server is running at http://localhost:3000
- Check that Chrome is started with `--remote-debugging-port=9222`
- Navigate to http://localhost:3000 in the debugging Chrome instance before running tests

### Context not preserved between tests

- Ensure you're using `connectOptions` in the browser provider config
- Verify the same Chrome instance is being reused
- Check server logs to confirm the same session ID across requests

### Streaming timeout errors

- Increase the `wait` time after `waitForNewChildren`
- Check server logs for errors during response generation
- Try disabling headless mode to see what's happening: `headless: false`

## What This Demonstrates

This example teaches:

1. ✅ **WebSocket testing** - How to test real-time applications
2. ✅ **Streaming responses** - Waiting for async operations to complete
3. ✅ **Session management** - Cookie-based state across browser automation tests
4. ✅ **Multi-turn conversations** - Validating context preservation
5. ✅ **Browser reuse** - Using `connectOptions` for stateful testing
6. ✅ **Wait strategies** - Combining `waitForNewChildren` with fixed waits

## Extending This Example

Want to customize this example? Try:

- **Add authentication** - Require login before accessing chat
- **Persist to database** - Store conversations in SQLite/PostgreSQL
- **Multiple users** - Test concurrent sessions
- **File uploads** - Add document sharing to conversations
- **Real LLM integration** - Connect to OpenAI/Anthropic APIs
- **Context window limits** - Implement conversation summarization

## Prerequisites

```bash
npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
```

## Further Reading

- [Browser Provider Documentation](/docs/providers/browser)
- [WebSocket Provider Documentation](/docs/providers/websocket)
- [Multi-turn Testing Guide](/docs/guides/multi-turn-testing)
