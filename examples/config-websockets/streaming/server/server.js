import http from 'http';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import OpenAI from 'openai';
import WebSocket, { WebSocketServer } from 'ws';

dotenv.config();

function validateEnvironmentVariables() {
  const missing = [];
  if (!process.env.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateEnvironmentVariables();

const PORT = Number(process.env.PORT || 3300);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const wssStream = new WebSocketServer({ noServer: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = 'gpt-4.1-mini';
const CHATBOT_MODEL =
  process.env.CHATBOT_MODEL && process.env.CHATBOT_MODEL.trim().length > 0
    ? process.env.CHATBOT_MODEL
    : DEFAULT_MODEL;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket: /ws (non-streaming)
wss.on('connection', (ws, request) => {
  const clientAddress = request.socket.remoteAddress;
  // eslint-disable-next-line no-console
  console.log(`WS client connected to /ws${clientAddress ? `: ${clientAddress}` : ''}`);

  ws.on('message', async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON payload' }));
      return;
    }

    const { input } = payload || {};
    if (typeof input !== 'string' || input.trim().length === 0) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Missing "input" (non-empty string) in payload',
        }),
      );
      return;
    }

    try {
      const response = await openai.responses.create({
        model: CHATBOT_MODEL,
        input,
      });
      const text = response.output[0].content[0].text;
      ws.send(JSON.stringify({ type: 'message', message: text, raw: response }));
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : 'OpenAI request failed';
      ws.send(JSON.stringify({ type: 'error', error: message }));
    }
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('WS client disconnected from /ws');
  });
});

// WebSocket: /ws-stream (streaming)
wssStream.on('connection', (ws, request) => {
  const clientAddress = request.socket.remoteAddress;
  // eslint-disable-next-line no-console
  console.log(`WS client connected to /ws-stream${clientAddress ? `: ${clientAddress}` : ''}`);

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ready', message: 'Connected to /ws-stream' }));
  }

  ws.on('message', async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      console.error('Invalid JSON payload', raw);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload' }));
      return;
    }

    const { input } = payload || {};
    if (typeof input !== 'string' || input.trim().length === 0) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Missing "input" (non-empty string) in payload',
        }),
      );
      return;
    }

    try {
      const stream = await openai.responses.stream(
        {
          model: CHATBOT_MODEL,
          input,
        },
        { stream: true },
      );

      stream.on('response.output_text.delta', (delta) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'delta', message: delta.delta }));
        }
      });

      stream.on('response.output_text.done', ({ text }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'message', message: text }));
        }
      });

      stream.on('error', (err) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: err && err.message ? err.message : 'Unknown streaming error',
            }),
          );
        }
      });

      await stream.done();
      // Debug: mark stream completion
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'done' }));
      }
    } catch (err) {
      const message = err && err.message ? err.message : 'OpenAI request failed';
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: message }));
      }
    }
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('WS client disconnected from /ws-stream');
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  if (url === '/ws' || url.startsWith('/ws?')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (url === '/ws-stream' || url.startsWith('/ws-stream?')) {
    wssStream.handleUpgrade(request, socket, head, (ws) => {
      wssStream.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('\nGracefully shutting down...');
  server.close(() => process.exit(0));
});
