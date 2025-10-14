# Session Provider

This example demonstrates how to integrate promptfoo with conversational AI APIs that maintain server-side session state. It shows the session lifecycle pattern: explicit session initialization, message handling, and cleanup.

The example includes a mock HTTP service so you can test the flow end-to-end without external dependencies.

## Quick Start

Initialize this example in your current directory:

```bash
npx promptfoo@latest init --example session-provider
```

## Prerequisites

- Node.js 18+
- promptfoo installed or cloned locally

## 1. Start the mock session service

```bash
node examples/session-provider/mockSessionService.js
```

The server listens on `http://127.0.0.1:4100` and exposes:

- `POST /sessions` → creates a new chat session and returns its id
- `POST /sessions/:id/messages` → sends a message and returns a reply
- `DELETE /sessions/:id` → closes the session

## 2. Run the evaluation

```bash
promptfoo eval -c examples/session-provider/promptfooconfig.yaml
```

The config includes two test cases that share the same `conversationId`. Promptfoo automatically manages the provider session lifecycle:

1. `startSession()` is called before the first message
2. `callApi()` is called for each message with `context.sessionId`
3. `closeSession()` is called after all messages complete

## Files

- `sessionProvider.js` – Custom provider implementing the session lifecycle methods
- `promptfooconfig.yaml` – Configuration for a multi-turn conversation
- `mockSessionService.js` – Mock server simulating a session-based API

## Adapting to Your API

Replace the mock server calls in `sessionProvider.js` with calls to your actual API endpoints. The session lifecycle will work the same way.
