# stateful-session-management

This example demonstrates how to use server-generated UUIDs to identify test cases and maintain server-side conversation history when a test case has multiple turns. It is useful when your provider/target generates unique identifiers to stitch together messages into a conversation "threads".

## Quick Start

```sh
npx promptfoo@latest init --example stateful-session-management
```

## Requirements

- Node.js 20+
- An OpenAI API key in `OPENAI_API_KEY`

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the demo server (in one terminal):

   ```bash
   export OPENAI_API_KEY=your-api-key && npm run server
   ```

3. Run the eval (in another terminal):

   ```bash
   promptfoo redteam eval -c redteam.yaml
   ```

## How it works

- `server.js`: A minimal Express server that manages conversation history and forwards inference requests to OpenAI.
- `hooks.js`: An [extension hook](https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks) that requests a new `sessionId` from the server for each test case and cleans up the session after the test case completes.
- `promptfooconfig.yaml`: A red team configuration that includes single and multi-turn strategies and uses an HTTP provider to interface with the Express server.
- `redteam.yaml`: The generated red team test cases to evaluate against.
