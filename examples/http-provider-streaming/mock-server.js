#!/usr/bin/env node

/**
 * Mock streaming server for testing HTTP provider streaming functionality
 * Simulates OpenAI-style Server-Sent Events (SSE) streaming responses
 */

const http = require('http');
const url = require('url');

const PORT = 3001;

// Mock responses for different streaming scenarios
const streamingResponses = {
  openai: [
    { choices: [{ delta: { content: "Hello" } }] },
    { choices: [{ delta: { content: " there!" } }] },
    { choices: [{ delta: { content: " How" } }] },
    { choices: [{ delta: { content: " can" } }] },
    { choices: [{ delta: { content: " I" } }] },
    { choices: [{ delta: { content: " help" } }] },
    { choices: [{ delta: { content: " you?" } }] },
  ],
  simple: [
    { text: "This" },
    { text: " is" },
    { text: " a" },
    { text: " simple" },
    { text: " streaming" },
    { text: " response." },
  ],
  newline: [
    '{"chunk": 1, "text": "First chunk"}',
    '{"chunk": 2, "text": "Second chunk"}',
    '{"chunk": 3, "text": "Third chunk"}',
    '{"chunk": 4, "text": "Final chunk"}',
  ]
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${req.method} ${path} - User-Agent: ${req.headers['user-agent'] || 'unknown'}`);

  // Parse request body for POST requests
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    let requestData = {};
    try {
      if (body) {
        requestData = JSON.parse(body);
      }
    } catch (e) {
      console.log('Failed to parse request body:', body);
    }

    console.log('Request data:', JSON.stringify(requestData, null, 2));

    // Route handlers
    if (path === '/v1/chat/completions' && requestData.stream) {
      handleOpenAIStreaming(res, requestData);
    } else if (path === '/stream/simple') {
      handleSimpleStreaming(res, requestData);
    } else if (path === '/stream/newline') {
      handleNewlineStreaming(res, requestData);
    } else if (path === '/stream/error') {
      handleErrorStreaming(res, requestData);
    } else if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
});

function handleOpenAIStreaming(res, requestData) {
  console.log('Starting OpenAI-style streaming...');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const chunks = streamingResponses.openai;
  let chunkIndex = 0;

  function sendNextChunk() {
    if (chunkIndex < chunks.length) {
      const chunk = chunks[chunkIndex];
      const data = `data: ${JSON.stringify(chunk)}\n\n`;
      console.log(`Sending chunk ${chunkIndex + 1}/${chunks.length}:`, chunk);
      res.write(data);
      chunkIndex++;

      // Send next chunk after delay
      setTimeout(sendNextChunk, 200);
    } else {
      // Send completion marker
      res.write('data: [DONE]\n\n');
      console.log('Streaming completed');
      res.end();
    }
  }

  // Start streaming
  sendNextChunk();
}

function handleSimpleStreaming(res, requestData) {
  console.log('Starting simple streaming...');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const chunks = streamingResponses.simple;
  let chunkIndex = 0;

  function sendNextChunk() {
    if (chunkIndex < chunks.length) {
      const chunk = chunks[chunkIndex];
      const data = `data: ${JSON.stringify(chunk)}\n\n`;
      console.log(`Sending chunk ${chunkIndex + 1}/${chunks.length}:`, chunk);
      res.write(data);
      chunkIndex++;

      setTimeout(sendNextChunk, 300);
    } else {
      res.write('data: {"done": true}\n\n');
      console.log('Simple streaming completed');
      res.end();
    }
  }

  sendNextChunk();
}

function handleNewlineStreaming(res, requestData) {
  console.log('Starting newline-delimited streaming...');

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const chunks = streamingResponses.newline;
  let chunkIndex = 0;

  function sendNextChunk() {
    if (chunkIndex < chunks.length) {
      const chunk = chunks[chunkIndex];
      console.log(`Sending chunk ${chunkIndex + 1}/${chunks.length}:`, chunk);
      res.write(chunk + '\n');
      chunkIndex++;

      setTimeout(sendNextChunk, 250);
    } else {
      console.log('Newline streaming completed');
      res.end();
    }
  }

  sendNextChunk();
}

function handleErrorStreaming(res, requestData) {
  console.log('Starting error streaming test...');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send a couple chunks then error
  res.write('data: {"text": "This will"}\n\n');

  setTimeout(() => {
    res.write('data: {"text": " work for"}\n\n');

    setTimeout(() => {
      res.write('data: {"text": " a bit then"}\n\n');

      setTimeout(() => {
        // Simulate connection error
        console.log('Simulating connection error');
        res.destroy();
      }, 300);
    }, 300);
  }, 300);
}

server.listen(PORT, () => {
  console.log(`Mock streaming server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /v1/chat/completions (with stream: true) - OpenAI-style SSE');
  console.log('  POST /stream/simple - Simple SSE streaming');
  console.log('  POST /stream/newline - Newline-delimited JSON streaming');
  console.log('  POST /stream/error - Error simulation');
  console.log('  GET  /health - Health check');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down mock server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});