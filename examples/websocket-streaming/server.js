#!/usr/bin/env node

/**
 * Simple WebSocket server that simulates streaming responses
 * Similar to GPT-style streaming where tokens are sent incrementally
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// Create HTTP server for serving the test frontend
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const htmlPath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Sample responses to stream
const SAMPLE_RESPONSES = {
  'hello': 'Hello! How can I help you today?',
  'what is ai': 'Artificial Intelligence (AI) is a branch of computer science that focuses on creating intelligent machines capable of performing tasks that typically require human intelligence.',
  'tell me a joke': 'Why did the programmer quit his job? Because he didn\'t get arrays!',
  'default': 'I received your message. This is a streaming response being sent token by token.',
};

function getResponse(message) {
  const lowerMessage = message.toLowerCase();
  for (const [key, response] of Object.entries(SAMPLE_RESPONSES)) {
    if (lowerMessage.includes(key)) {
      return response;
    }
  }
  return SAMPLE_RESPONSES.default;
}

// Simulate streaming by splitting response into chunks
function* streamResponse(text) {
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const chunk = i === words.length - 1 ? word : word + ' ';
    yield chunk;
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message);

      const { prompt, stream = true } = message;

      if (!prompt) {
        ws.send(JSON.stringify({ error: 'No prompt provided' }));
        return;
      }

      const responseText = getResponse(prompt);

      if (stream) {
        // Stream the response token by token
        console.log('Streaming response...');

        for (const chunk of streamResponse(responseText)) {
          const event = {
            type: 'chunk',
            delta: chunk,
          };
          ws.send(JSON.stringify(event));
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Send completion event
        ws.send(JSON.stringify({
          type: 'done',
          content: responseText,
        }));
      } else {
        // Non-streaming response
        ws.send(JSON.stringify({
          type: 'complete',
          content: responseText,
        }));
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        error: err.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to streaming WebSocket server',
  }));
});

server.listen(PORT, () => {
  console.log(`WebSocket server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log('\nOpen http://localhost:8080 in your browser to test the frontend');
});
