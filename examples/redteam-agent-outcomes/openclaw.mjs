import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const version = '2026.11.4';
const exec = promisify(execFile);

async function resolveEntry() {
  let directory = process.env.OPENCLAW_PACKAGE_DIR;
  if (!directory) {
    try {
      directory = fileURLToPath(new URL('../', import.meta.resolve('openclaw')));
    } catch {
      throw new Error('Install openclaw@' + version + ' in the example directory');
    }
  }
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (pkg.name !== 'openclaw' || pkg.version !== version) {
    throw new Error('Expected openclaw@' + version);
  }
  return path.resolve(directory, 'openclaw.mjs');
}

// Observe the request actually accepted by the model endpoint. Keep upstream credentials out of the child.
async function forward(request, response, { endpoint, key, model, observe }) {
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  try {
    let body = '';
    request.setEncoding('utf8');
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (
      input.model !== model ||
      input.tools?.some((t) => !t.function?.name?.startsWith('fixture__'))
    ) {
      throw new Error('Unexpected model or tool inventory');
    }
    const result = await fetch(endpoint, {
      method: 'POST',
      body,
      signal: controller.signal,
      redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    });
    if (result.ok) observe(input.messages);
    response.writeHead(result.status, {
      'content-type': result.headers.get('content-type') || 'application/json',
    });
    if (!result.body) return response.end();
    await pipeline(Readable.fromWeb(result.body), response);
  } catch {
    if (response.headersSent) response.destroy();
    else response.writeHead(502).end();
  }
}

// The loopback service and its credentials live only for this trial.
async function serve(tools, call, inference) {
  const route = '/mcp/' + randomUUID();
  const token = randomUUID();
  const http = createServer(async (request, response) => {
    if (
      request.method === 'POST' &&
      request.url === '/v1/chat/completions' &&
      request.headers.authorization === 'Bearer ' + token
    ) {
      return forward(request, response, inference);
    }
    if (request.url !== route || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    const server = new McpServer({ name: 'fixture', version: '1.0.0' });
    for (const [name, { description, inputSchema }] of Object.entries(tools)) {
      server.registerTool(name, { description, inputSchema }, async (args) => ({
        content: [{ type: 'text', text: JSON.stringify(await call(name, args)) }],
      }));
    }
    response.once('close', () => void server.close());
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (response.headersSent) response.destroy();
      else response.writeHead(400).end();
    }
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const local = 'http://127.0.0.1:' + http.address().port;
  return {
    token,
    baseUrl: local + '/v1',
    toolUrl: local + route,
    async close() {
      const closed = once(http, 'close');
      http.close();
      http.closeAllConnections();
      await closed;
    },
  };
}

function config(baseUrl, model, toolUrl, timeoutSeconds) {
  return {
    models: {
      mode: 'replace',
      catalogRefresh: { enabled: false },
      providers: {
        fixture: {
          api: 'openai-completions',
          baseUrl,
          apiKey: '${OUTCOME_MODEL_KEY}',
          timeoutSeconds,
          agentRuntime: { id: 'openclaw' },
          models: [
            {
              id: model,
              name: model,
              input: ['text'],
              reasoning: false,
              compat: { supportsTools: true },
            },
          ],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: 'fixture/' + model, fallbacks: [] },
        skills: [],
        contextInjection: 'never',
      },
    },
    tools: { profile: 'full', allow: ['fixture__*'], toolSearch: false, codeMode: false },
    mcp: { servers: { fixture: { transport: 'streamable-http', url: toolUrl } } },
  };
}

export async function runOpenClaw({ prompt, tools, call, model, signal, record, observe }) {
  const base = new URL(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  const key = process.env.OPENAI_API_KEY || (local ? 'local-placeholder' : '');
  const seconds = Number(process.env.AGENT_TIMEOUT_SECONDS ?? 300);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
    throw new Error('AGENT_TIMEOUT_SECONDS must be between 1 and 3600');
  }
  if (!model || !key)
    throw new Error('Set AGENT_MODEL and provide OPENAI_API_KEY for hosted inference');
  const entry = await resolveEntry();
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-outcome-'));
  const workspace = path.join(directory, 'workspace');
  const messageFile = path.join(directory, 'message.txt');
  const configFile = path.join(directory, 'config.json');
  let service;
  try {
    await mkdir(workspace);
    base.pathname = base.pathname.replace(/\/+$/, '') + '/chat/completions';
    service = await serve(tools, call, { endpoint: base, key, model, observe });
    await writeFile(
      configFile,
      JSON.stringify(config(service.baseUrl, model, service.toolUrl, seconds)),
    );
    await writeFile(messageFile, prompt);
    const args = [
      entry,
      'agent',
      'exec',
      '--config',
      configFile,
      '--message-file',
      messageFile,
      '--timeout',
      String(seconds),
      '--json',
    ];
    const { stdout } = await exec(process.execPath, args, {
      cwd: workspace,
      signal,
      timeout: (seconds + 60) * 1000,
      killSignal: 'SIGKILL',
      env: {
        PATH: process.env.PATH,
        TMPDIR: directory,
        OPENCLAW_HOME: directory,
        OPENCLAW_STATE_DIR: path.join(directory, 'state'),
        OPENCLAW_CONFIG_PATH: configFile,
        OUTCOME_MODEL_KEY: service.token,
        OPENCLAW_NO_RESPAWN: '1',
      },
    });
    const result = JSON.parse(stdout);
    if (!result.ok || typeof result.final !== 'string')
      throw new Error('OpenClaw returned no final reply');
    record('runtime', {
      harness: 'openclaw',
      version,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
      tools: result.toolSummary,
    });
    return result.final;
  } catch (error) {
    const message = String(error.message).replaceAll(key, '[redacted]');
    throw new Error(message.slice(-1200));
  } finally {
    try {
      await service?.close();
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
