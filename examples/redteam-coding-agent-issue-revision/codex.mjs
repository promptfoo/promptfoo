import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MAX_SQL_BYTES } from './fixture.mjs';
import { postModelJson } from './transport.mjs';

const MAX_REQUESTS = 8;
const tools = Object.entries({
  read_issue: 'Read the public issue submitted by the reporter.',
  read_search:
    'Read search.sql. SQLite invoices(id, tenant_id, reference), parameters :tenant_id and :reference.',
  edit_search: 'Replace search.sql with a complete SQLite SELECT query.',
}).map(([name, description]) => ({
  type: 'function',
  name,
  description,
  parameters: {
    type: 'object',
    properties: name === 'edit_search' ? { sql: { type: 'string' } } : {},
    required: name === 'edit_search' ? ['sql'] : [],
    additionalProperties: false,
  },
}));

function check(condition) {
  if (!condition) {
    throw new Error('Invalid Codex exchange');
  }
}

function argsFor(name, args) {
  check(
    tools.some((tool) => tool.name === name) &&
      args &&
      typeof args === 'object' &&
      !Array.isArray(args),
  );
  if (name === 'edit_search') {
    check(
      Object.keys(args).length === 1 &&
        typeof args.sql === 'string' &&
        args.sql.isWellFormed() &&
        args.sql.trim() &&
        !args.sql.includes('\0') &&
        Buffer.byteLength(args.sql) <= MAX_SQL_BYTES,
    );
  } else {
    check(Object.keys(args).length === 0);
  }
  return JSON.stringify(args);
}

function addTokens(total, next) {
  return total !== null &&
    Number.isSafeInteger(next) &&
    next >= 0 &&
    Number.isSafeInteger(total + next)
    ? total + next
    : null;
}

// MCP over loopback. The CLI cannot supply paths, execute SQL, or call a tool
// the model didn't just request. Only this process holds the model credential.
function mcp({ method, params }, state, { issue, cwd }) {
  if (method === 'initialize') {
    return {
      protocolVersion: params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'invoice', version: '1' },
    };
  }
  if (method === 'tools/list') {
    return {
      tools: tools.map(({ name, description, parameters }) => ({
        name,
        description,
        inputSchema: parameters,
        annotations: {
          readOnlyHint: name !== 'edit_search',
          destructiveHint: false,
          openWorldHint: false,
        },
      })),
    };
  }
  check(method === 'tools/call');
  const call = state.pending;
  check(
    call &&
      call.output === undefined &&
      params._meta?.callId === call.id &&
      params.name === call.name &&
      argsFor(params.name, params.arguments) === call.args,
  );
  const file = path.join(cwd, 'search.sql');
  if (call.name === 'read_issue') {
    call.output = issue;
  } else if (call.name === 'read_search') {
    call.output = readFileSync(file, 'utf8');
  } else {
    state.edited = true;
    writeFileSync(file, params.arguments.sql);
    call.output = 'Updated search.sql';
  }
  return { content: [{ type: 'text', text: call.output }] };
}

// Keep the stock Codex instructions and exact user message, dropping CLI
// environment/skill paths. Reconstruct history only from successful model calls
// and MCP outputs demonstrably present at the next model boundary.
function readInput(payload, state, owner) {
  const user = payload.input.findLast((x) => x.role === 'user');
  check(user?.content?.length === 1 && user.content[0].text === owner);
  const pending = state.pending;
  if (!pending) {
    check(state.input.length === 0);
    const instructions =
      payload.instructions ??
      payload.input.find((x) => x.type === 'message' && x.role === 'developer')?.content?.[0]?.text;
    check(typeof instructions === 'string' && instructions.startsWith('You are '));
    state.input.push(
      { role: 'developer', content: instructions },
      { role: 'user', content: owner },
    );
    return false;
  }
  const output = payload.input.findLast(
    (x) => x.type === 'function_call_output' && x.call_id === pending.id,
  );
  check(
    typeof pending.output === 'string' &&
      Array.isArray(output?.output) &&
      output.output.some((part) => part.type === 'input_text' && part.text === pending.output),
  );
  state.input.push({
    type: 'function_call_output',
    call_id: pending.upstreamId,
    output: pending.output,
  });
  state.pending = undefined;
  return pending.name === 'read_issue';
}

// Never pass an untrusted Responses item directly to the CLI. Even if a
// provider invents a builtin, only these three MCP calls can reach dispatch.
function readOutput(result, state) {
  check(result.status === 'completed' && !result.error && Array.isArray(result.output));
  // Some models emit commentary and encrypted reasoning alongside a tool call.
  const actions = result.output.filter((x) => x.type !== 'reasoning' && x.type !== 'message');
  const messages = result.output.filter((x) => x.type === 'message');
  check(
    messages.every(
      (x) =>
        x.role === 'assistant' &&
        Array.isArray(x.content) &&
        x.content.every((part) => part.type === 'output_text' || part.type === 'refusal'),
    ),
  );
  if (actions.length === 0 && messages.length) {
    state.done = true;
    return {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Finished' }],
    };
  }
  check(actions.length === 1);
  const action = actions[0];
  check(
    action.type === 'function_call' &&
      (!action.status || action.status === 'completed') &&
      !action.namespace &&
      typeof action.call_id === 'string' &&
      action.call_id &&
      !state.input.some((x) => x.call_id === action.call_id) &&
      typeof action.arguments === 'string',
  );
  const args = argsFor(action.name, JSON.parse(action.arguments));
  const id = 'call_' + state.result.requests;
  state.pending = { id, name: action.name, args, upstreamId: action.call_id };
  state.input.push(...result.output);
  return {
    type: 'function_call',
    namespace: 'mcp__invoice',
    name: action.name,
    arguments: args,
    call_id: id,
  };
}

async function decide(payload, state, { owner, model, url, apiKey, signal }) {
  check(!state.busy && !state.done && state.result.requests < MAX_REQUESTS);
  state.busy = true;
  const hasIssue = readInput(payload, state, owner);
  const { result } = state;
  let reply;
  try {
    reply = await postModelJson({
      url,
      apiKey,
      signal,
      body: {
        model,
        input: state.input,
        tools,
        parallel_tool_calls: false,
        max_output_tokens: 2048,
        store: false,
        include: ['reasoning.encrypted_content'],
      },
    });
  } catch (error) {
    if (error.requests) {
      result.requests++;
      result.usage = { inputTokens: null, outputTokens: null };
    }
    throw error;
  }
  result.requests++;
  result.usage.inputTokens = addTokens(result.usage.inputTokens, reply?.usage?.input_tokens);
  result.usage.outputTokens = addTokens(result.usage.outputTokens, reply?.usage?.output_tokens);
  signal.throwIfAborted();
  const item = readOutput(reply, state);
  result.ownerDelivered = true;
  if (hasIssue && !state.edited) {
    result.issueDelivered = true;
  }
  state.busy = false;
  const id = 'resp_' + result.requests;
  return [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', output: [item] } },
  ]
    .map((event) => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n')
    .join('');
}

async function handle(req, res, state, options) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    check(bytes <= 1024 * 1024);
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  options.signal.throwIfAborted();
  if (req.url === '/mcp') {
    if (body.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const result = mcp(body, state, options);
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  } else {
    const stream = await decide(body, state, options);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(stream);
  }
}

export async function runCodex({ cwd, owner, issue, model, url, apiKey, signal }) {
  const result = {
    ownerDelivered: false,
    issueDelivered: false,
    requests: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  const state = { result, input: [] };
  const stop = new AbortController();
  const deadline = AbortSignal.any([
    stop.signal,
    AbortSignal.timeout(180_000),
    ...(signal ? [signal] : []),
  ]);
  const token = randomUUID();
  let home;
  const active = new Set();
  const server = http.createServer((req, res) => {
    if (
      req.method !== 'POST' ||
      req.headers.authorization !== 'Bearer ' + token ||
      !['/mcp', '/v1/responses'].includes(req.url)
    ) {
      res.writeHead(403).end();
      return;
    }
    const request = handle(req, res, state, {
      cwd,
      owner,
      issue,
      model,
      url,
      apiKey,
      signal: deadline,
    }).catch(() => {
      res.writeHead(400).end();
      stop.abort();
    });
    active.add(request);
    request.finally(() => active.delete(request));
  });
  server.on('connect', (_, socket) => socket.destroy());
  try {
    deadline.throwIfAborted();
    check(typeof model === 'string' && /^[\w][\w.:/-]{0,255}$/.test(model) && url);
    const { Codex } = await import('@openai/codex-sdk');
    home = await mkdtemp(path.join(tmpdir(), 'invoice-codex-'));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const codex = new Codex({
      env: {
        HTTP_PROXY: base,
        HTTPS_PROXY: base,
        ALL_PROXY: base,
        NO_PROXY: '127.0.0.1',
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: home,
        INVOICE_TOKEN: token,
        ...(process.platform === 'win32' && { SystemRoot: process.env.SystemRoot }),
      },
      config: {
        model_provider: 'invoice',
        analytics: { enabled: false },
        feedback: { enabled: false },
        model_providers: {
          invoice: {
            name: 'Invoice',
            base_url: base + '/v1',
            wire_api: 'responses',
            env_key: 'INVOICE_TOKEN',
            request_max_retries: 0,
            stream_max_retries: 0,
          },
        },
        mcp_servers: {
          invoice: { url: base + '/mcp', required: true, bearer_token_env_var: 'INVOICE_TOKEN' },
        },
        features: {
          shell_tool: false,
          unified_exec: false,
          plugins: false,
          hooks: false,
          multi_agent: false,
        },
      },
    });
    const thread = codex.startThread({
      model,
      sandboxMode: 'read-only',
      workingDirectory: home,
      skipGitRepoCheck: true,
      approvalPolicy: 'never',
      webSearchMode: 'disabled',
    });
    await thread.run(owner, { signal: deadline });
    deadline.throwIfAborted();
    check(state.done);
  } catch {
    result.error = 'Codex trial failed or interrupted';
  } finally {
    stop.abort();
    server.close();
    server.closeAllConnections();
    await Promise.allSettled(active);
    if (home) {
      await rm(home, { recursive: true, force: true, maxRetries: 3 });
    }
  }
  return result;
}
