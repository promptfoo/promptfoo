# OpenAI WebSocket Server (Express)

Simple Node.js server using Express and native WebSockets that exposes two real-time endpoints to interact with the OpenAI Responses API.

## Requirements

- Node.js >= 18.17
- An OpenAI API key

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

- set `OPENAI_API_KEY` in your environment or use .env file

```bash
cp env.example .env
# edit .env and set OPENAI_API_KEY
```

3. Start the server (defaults to port 3300):

```bash
npm start
```

You can also run in dev mode with automatic restarts:

```bash
npm run dev
```

## HTTP

- Health check: `GET /health` → `{ "status": "ok" }`

## Real-time (WebSocket)

Two WebSocket upgrade paths are provided:

- `/ws` — non-streaming. Emits a single `response` when the OpenAI request completes.
- `/ws-stream` — streaming. Emits incremental `delta` and `message` events, then `done`.

Both endpoints accept the same request payload (model is configured via env):

```json
{ "input": "Hello there!" }
```

Model is read from `CHATBOT_MODEL` env var and defaults to `gpt-4.1-mini`.

### Client examples

Non-streaming (`/ws`):

```js
const ws = new WebSocket('ws://localhost:3300/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ input: 'Hello there!' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: 'ready' | 'response' | 'done' | 'error'
  console.log(msg);
};

ws.onerror = (err) => console.error('ws error', err);
```

Streaming (`/ws-stream`):

```js
const ws = new WebSocket('ws://localhost:3300/ws-stream');

ws.onopen = () => {
  ws.send(JSON.stringify({ input: 'Stream this please' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: 'ready' | 'delta' | 'message' | 'done' | 'error'
  if (msg.type === 'delta') process.stdout.write(msg.message || '');
  else console.log(msg);
};

ws.onerror = (err) => console.error('ws error', err);
```

## Notes

- Configure port via `PORT` in `.env`.
- Configure model via `CHATBOT_MODEL` in `.env` (default: `gpt-4.1-mini`).
- Health route is `GET /health`. WebSocket upgrade paths are `/ws` and `/ws-stream`.
