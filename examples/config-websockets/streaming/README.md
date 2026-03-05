# Websocket Streaming

This example shows how to configure a websocket application that streams its responses. It includes a small Node.js server that exposes two WebSocket endpoints:

- A non-streaming endpoint (`/ws`) that returns a single message when the model finishes.
- A streaming endpoint (`/ws-stream`) that sends incremental deltas and a final message.

You’ll run the server locally and use promptfoo’s eval command to test the quality of the application.

You can run this example with:

```bash
npx promptfoo@latest init --example websocket-streaming
```

## What’s in this folder

- `promptfooconfig.yaml` – Configures a target pointing at the local WebSocket server using the streaming endpoint
- `server/` – Minimal Express + WebSocket server that calls the OpenAI Responses API and exposes the two endpoints

## Prerequisites

- Node.js 20+
- An OpenAI API key set as `OPENAI_API_KEY`

## 1) Start the local WebSocket server

From this directory:

```bash
cd server
npm install

# Option A: set environment variables in your shell
export OPENAI_API_KEY=your_key_here
# Optional:
# export CHATBOT_MODEL=gpt-4.1-mini  # defaults to gpt-4.1-mini
# export PORT=3300                   # defaults to 3300

# Start the server
npm start
```

You should see the server listening at `http://localhost:3300`.

Health check:

```bash
curl http://localhost:3300/health
# {"status":"ok"}
```

WebSocket Endpoints:

- `ws://localhost:3300/ws` – non-streaming
- `ws://localhost:3300/ws-stream` – streaming (sends `delta` updates and a final `message`)

## 2) How the WebSocket configuration works

In `promptfooconfig.yaml`, the websocket endpoint is configured under the websocket endpoint id:

```yaml
- id: 'ws://localhost:3300/ws-stream'
```

The target configuration uses the streamResponse function `streamResponse(accumulator, data, context?)` to decide when to stop and what to return.

## Server Response Format

The server three types of messages:

1. `delta` messages that include a partial response
2. `message` messages that include the finalized response in full
3. `error` messages that indicate an error occurred

Example of a successful message stream:

```json
{"type":"delta","message":"Part of a thought"}
{"type":"message","message":"Part of a thought, now the thought is completed"}
```

The streamResponse function includes logic for handling these different cases. Note: the `delta` case is the fallback, which returns false for the second item in the tuple to indicate the response is not yet complete:

```yaml
- id: 'ws://localhost:3300/ws-stream'
  config:
    messageTemplate: '{"input": {{prompt | dump}}}'
    streamResponse: |
      (accumulator, event, context) => {
        const { message, type } = JSON.parse(event.data);
        if (type === 'message') { return [{ output: message }, true]; }
        if (type === 'error')   { return [{ error: message }, true]; }
        return [{output: message}, false];
      }
```

Tip: If you need to concatenate partials for UX, you can return an accumulator object with the concatenated value on `delta` frames and only return `true` when you receive the final message.

## 3) Run the evaluation

With the server running, open a new terminal at this example directory and run:

```bash
promptfoo eval
```

This will evaluate the test cases against the streaming WebSocket endpoint.

View results in the browser UI:

```bash
promptfoo view
```

## Troubleshooting

- If requests fail immediately, ensure `OPENAI_API_KEY` is set in the environment where the server is running.
- If the client can’t connect, verify the server is listening on the expected port (`PORT`, defaults to 3300) and that you’re using the correct `ws://` URL.
- For streaming behavior, watch the server logs and confirm you’re receiving `delta` events followed by a final `message`.

## Cleanup

Stop the server with `Ctrl+C` in its terminal.
