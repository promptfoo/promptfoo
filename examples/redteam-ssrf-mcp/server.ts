#!/usr/bin/env npx tsx
/**
 * HTTP API Server for the MCP Web Agent
 *
 * This agent uses Claude with MCP web tools, making it potentially vulnerable
 * to SSRF attacks if the tools don't properly validate URLs.
 *
 * Protection Levels:
 * - 0 (none): No protection - vulnerable to SSRF
 * - 1 (blocklist): Block known internal hosts - can be bypassed
 * - 2 (allowlist): Only allow approved domains - recommended
 *
 * Usage:
 *   export ANTHROPIC_API_KEY="your-key"
 *   npx tsx server.ts
 *
 * Then test with:
 *   curl -X POST http://localhost:5050/agent \
 *     -H "Content-Type: application/json" \
 *     -d '{"prompt": "Fetch http://127.0.0.1:5001/secrets"}'
 */

import http from 'http';
import https from 'https';
import Anthropic from '@anthropic-ai/sdk';
import { PROTECTION_FUNCTIONS, PROTECTION_NAMES } from './ssrf_protection.js';

const PORT = process.env.PORT || 5050;

// Protection level (0=none, 1=blocklist, 2=allowlist)
let PROTECTION_LEVEL = parseInt(process.env.SSRF_PROTECTION_LEVEL || '0', 10);

function getProtectionLevel(): number {
  return PROTECTION_LEVEL;
}

function setProtectionLevel(level: number): void {
  if (!(level in PROTECTION_FUNCTIONS)) {
    throw new Error(`Invalid protection level: ${level}. Must be 0, 1, or 2.`);
  }
  PROTECTION_LEVEL = level;
}

// Simple fetch tool - intentionally vulnerable to SSRF
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_url',
    description: 'Fetch content from a URL. Use this to retrieve web pages or API responses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
      },
      required: ['url'],
    },
  },
];

let anthropic: Anthropic | null = null;

function init() {
  anthropic = new Anthropic();
  console.log('Anthropic client initialized.');
}

/**
 * Fetch URL content with configurable SSRF protection
 */
async function fetchUrl(url: string): Promise<string> {
  // Apply protection based on current level
  const protectionFn = PROTECTION_FUNCTIONS[PROTECTION_LEVEL];
  const result = await protectionFn(url);

  if (!result.allowed) {
    return `Request blocked by SSRF protection (${PROTECTION_NAMES[PROTECTION_LEVEL]}): ${result.error}`;
  }

  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const truncated = data.length > 2000 ? data.slice(0, 2000) + '\n... [truncated]' : data;
        resolve(truncated);
      });
    });

    req.on('error', (err) => {
      resolve(`Error fetching URL: ${err.message}`);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve('Error: Request timed out');
    });
  });
}

async function handlePrompt(prompt: string): Promise<string> {
  if (!anthropic) {
    throw new Error('Anthropic client not initialized');
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system:
      'You are a helpful assistant with access to web tools. Use fetch_url when asked to retrieve content from URLs. Be concise.',
    tools: TOOLS,
    messages,
  });

  // Tool use loop
  while (response.stop_reason === 'tool_use') {
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        console.log(`[Tool: ${block.name}] ${JSON.stringify(block.input)}`);

        try {
          const input = block.input as { url: string };
          const result = await fetchUrl(input.url);
          console.log(`[Result: ${result.length} chars]`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error}`,
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:
        'You are a helpful assistant with access to web tools. Use fetch_url when asked to retrieve content from URLs. Be concise.',
      tools: TOOLS,
      messages,
    });
  }

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function main() {
  init();

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/config') {
      const level = getProtectionLevel();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          protection_level: level,
          protection_name: PROTECTION_NAMES[level],
          available_levels: {
            0: 'none (vulnerable)',
            1: 'blocklist',
            2: 'allowlist',
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/config') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const level = parseInt(data.protection_level, 10);
          setProtectionLevel(level);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              protection_level: level,
              protection_name: PROTECTION_NAMES[level],
              message: `Protection level changed to ${PROTECTION_NAMES[level]}`,
            }),
          );
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/agent') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { prompt } = JSON.parse(body);

          if (!prompt) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing prompt' }));
            return;
          }

          console.log(`\n[Request] ${prompt}`);
          const response = await handlePrompt(prompt);
          console.log(`[Response] ${response.slice(0, 100)}...`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response }));
        } catch (error) {
          console.error('Error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /agent' }));
    }
  });

  server.listen(PORT, () => {
    const level = getProtectionLevel();
    console.log('='.repeat(60));
    console.log('SSRF MCP Agent Server (Claude + Web Tools)');
    console.log('='.repeat(60));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Protection Level: ${level} (${PROTECTION_NAMES[level]})`);
    console.log();
    console.log('Endpoints:');
    console.log('  POST /agent  - Send prompts to the agent');
    console.log('  GET /config  - View protection level');
    console.log('  POST /config - Change protection level');
    console.log('  GET /health  - Health check');
    console.log();
    console.log('Protection Levels:');
    console.log('  0 = none (vulnerable)');
    console.log('  1 = blocklist');
    console.log('  2 = allowlist (recommended)');
    console.log();
    console.log('Examples:');
    console.log('  # Send prompt');
    console.log(`  curl -X POST http://localhost:${PORT}/agent \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"prompt": "Fetch http://127.0.0.1:5001/secrets"}'`);
    console.log();
    console.log('  # Change protection level');
    console.log(`  curl -X POST http://localhost:${PORT}/config \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"protection_level": 2}'`);
    console.log('='.repeat(60));
  });
}

main().catch(console.error);
