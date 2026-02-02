#!/usr/bin/env node
/**
 * Simple test server that:
 * 1. Accepts POST requests with form data (application/x-www-form-urlencoded)
 * 2. Streams back SSE responses in OpenAI-compatible format
 *
 * Usage: node test-server.js
 * Server runs on http://localhost:3456
 */

const http = require('http');
const { URLSearchParams } = require('url');

const PORT = 3456;
const EXPECTED_API_KEY = 'test-api-key-12345';

/**
 * Parse multipart/form-data body
 */
function parseMultipart(body, contentType) {
  try {
    // Extract boundary from content-type header
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) {
      console.log('No boundary found in content-type');
      return null;
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const result = {};
    // Split by boundary
    const parts = body.split(`--${boundary}`);

    for (const part of parts) {
      // Skip empty parts and closing boundary
      if (!part.trim() || part.trim() === '--') continue;

      // Split headers from content (separated by double newline)
      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) {
        // Try with just \n\n
        const altIndex = part.indexOf('\n\n');
        if (altIndex === -1) continue;

        const headers = part.slice(0, altIndex);
        const content = part.slice(altIndex + 2).trim();

        // Extract field name
        const nameMatch = headers.match(/name="([^"]+)"/);
        if (nameMatch) {
          result[nameMatch[1]] = content.replace(/\r?\n$/, '');
        }
      } else {
        const headers = part.slice(0, headerEndIndex);
        const content = part.slice(headerEndIndex + 4);

        // Extract field name
        const nameMatch = headers.match(/name="([^"]+)"/);
        if (nameMatch) {
          // Remove trailing boundary marker if present
          let value = content.replace(/\r?\n--$/, '').replace(/\r?\n$/, '');
          result[nameMatch[1]] = value;
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.error('Error parsing multipart:', err);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers for local testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed. Use POST.');
    return;
  }

  // Check for authorization (supports multiple formats)
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  let authValid = false;
  let authMethod = 'none';

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      authValid = token === EXPECTED_API_KEY;
      authMethod = 'bearer';
    } else if (authHeader.startsWith('Basic ')) {
      // Basic auth: decode and check (expects "user:test-api-key-12345")
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      authValid = decoded.includes(EXPECTED_API_KEY);
      authMethod = 'basic';
    }
  } else if (apiKeyHeader) {
    authValid = apiKeyHeader === EXPECTED_API_KEY;
    authMethod = 'api-key';
  } else {
    // No auth header - allow for backward compatibility but log it
    authValid = true;
    authMethod = 'none (allowed)';
  }

  console.log(`Auth check: method=${authMethod}, valid=${authValid}`);

  if (!authValid) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing authorization' }));
    return;
  }

  // Read request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  // Parse form data
  let formData;
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    formData = Object.fromEntries(new URLSearchParams(body));
  } else if (contentType.includes('application/json')) {
    try {
      formData = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid JSON');
      return;
    }
  } else if (contentType.includes('multipart/form-data')) {
    // Parse multipart/form-data
    formData = parseMultipart(body, contentType);
    if (!formData) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid multipart/form-data');
      return;
    }
  } else {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Unsupported Content-Type: ${contentType}. Use application/x-www-form-urlencoded, application/json, or multipart/form-data`);
    return;
  }

  console.log('Received form data:', formData);

  const prompt = formData.prompt || formData.message || 'Hello';
  const streamParam = formData.stream;

  // Check if streaming is requested
  const shouldStream = streamParam === 'true' || streamParam === true;

  if (shouldStream) {
    // SSE streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Generate a simple response based on the prompt
    const response = `I received your message: "${prompt}". This is a streamed response from the test server.`;
    const words = response.split(' ');

    // Stream each word as a separate SSE event (OpenAI-style format)
    for (let i = 0; i < words.length; i++) {
      const word = (i === 0 ? '' : ' ') + words[i];
      const chunk = {
        id: `chatcmpl-test-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: formData.model || 'test-model',
        choices: [
          {
            index: 0,
            delta: { content: word },
            finish_reason: null,
          },
        ],
      };

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);

      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Send final chunk with finish_reason
    const finalChunk = {
      id: `chatcmpl-test-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: formData.model || 'test-model',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    };
    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    // Non-streaming JSON response
    const response = {
      id: `chatcmpl-test-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: formData.model || 'test-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `I received your message: "${prompt}". This is a non-streamed response.`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: prompt.split(' ').length,
        completion_tokens: 15,
        total_tokens: prompt.split(' ').length + 15,
      },
      // Echo back the form data for debugging
      _debug: { received_form_data: formData },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Test server running at http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log('  POST / - Accepts form data, returns JSON or streams SSE');
  console.log('\nAuthentication (optional but validated if provided):');
  console.log(`  API Key: ${EXPECTED_API_KEY}`);
  console.log('  Supported methods:');
  console.log('    - Bearer token: Authorization: Bearer <key>');
  console.log('    - API key header: X-API-Key: <key>');
  console.log('    - Basic auth: Authorization: Basic <base64(user:key)>');
  console.log('\nForm fields:');
  console.log('  - prompt: The message to echo back');
  console.log('  - stream: Set to "true" for SSE streaming response');
  console.log('  - model: Optional model name to echo back');
  console.log('\nExample curl commands:');
  console.log(`  # Without auth (allowed):`);
  console.log(`  curl -X POST http://localhost:${PORT} -d "prompt=Hello&model=test"`);
  console.log(`\n  # With Bearer token:`);
  console.log(`  curl -X POST http://localhost:${PORT} -H "Authorization: Bearer ${EXPECTED_API_KEY}" -d "prompt=Hello&stream=true"`);
  console.log(`\n  # With X-API-Key header:`);
  console.log(`  curl -X POST http://localhost:${PORT} -H "X-API-Key: ${EXPECTED_API_KEY}" -d "prompt=Hello&stream=true"`);
  console.log('\nPress Ctrl+C to stop.\n');
});
