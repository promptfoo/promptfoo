const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789').replace(
  /\/$/,
  '',
);
const authToken = process.env.OPENCLAW_GATEWAY_TOKEN;

if (!authToken) {
  throw new Error('OPENCLAW_GATEWAY_TOKEN is required');
}

const headers = {
  Authorization: `Bearer ${authToken}`,
  'Content-Type': 'application/json',
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { response, body };
}

async function createResponse(body) {
  return jsonRequest('/v1/responses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function getOutputText(body) {
  if (typeof body?.output_text === 'string') {
    return body.output_text;
  }

  return (body?.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n');
}

const fileData =
  'ZGlmZiAtLWdpdCBhL3NyYy9vcmRlcnMudHMgYi9zcmMvb3JkZXJzLnRzCkBACi1leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0T3JkZXIodXNlcklkOiBzdHJpbmcsIG9yZGVySWQ6IHN0cmluZykgewotICByZXR1cm4gZGIub3JkZXJzLmZpbmRGaXJzdCh7IHdoZXJlOiB7IGlkOiBvcmRlcklkLCB1c2VySWQgfSB9KTsKK2V4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRPcmRlcihfdXNlcklkOiBzdHJpbmcsIG9yZGVySWQ6IHN0cmluZykgeworICByZXR1cm4gZGIub3JkZXJzLmZpbmRGaXJzdCh7IHdoZXJlOiB7IGlkOiBvcmRlcklkIH0gfSk7CiB9Cg==';
const redSquareData =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NsQ0AAAzCMP5/un0CNkuZ41wybXsHAAAAAAAAAAAAxR4yw/wuPL6QkAAAAABJRU5ErkJggg==';

const checks = [];

{
  const { response } = await jsonRequest('/healthz', { method: 'GET' });
  assert(response.ok, '/healthz failed');
  checks.push('healthz');
}

{
  const { response, body } = await jsonRequest('/v1/models', { method: 'GET' });
  assert(response.ok, '/v1/models failed');
  assert(Array.isArray(body?.data), '/v1/models did not return model data');
  checks.push('models');
}

{
  const first = await createResponse({
    model: 'openclaw/default',
    user: 'promptfoo-probe',
    input: 'Remember the codeword PROBE_314. Reply exactly ACK.',
  });
  assert(first.response.ok, 'initial response failed');
  assert(getOutputText(first.body) === 'ACK', 'initial response mismatch');

  const second = await createResponse({
    model: 'openclaw/default',
    user: 'promptfoo-probe',
    previous_response_id: first.body.id,
    input: 'What codeword did I give you? Reply with only the codeword.',
  });
  assert(second.response.ok, 'previous_response_id response failed');
  assert(getOutputText(second.body) === 'PROBE_314', 'previous_response_id continuity mismatch');
  checks.push('previous_response_id');
}

{
  const { response, body } = await createResponse({
    model: 'openclaw/default',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Review the attached diff. If it removes the ownership check from order lookup, reply with exactly AUTH_GAP. Otherwise reply with exactly OK.',
          },
          {
            type: 'input_file',
            source: {
              type: 'base64',
              media_type: 'text/plain',
              data: fileData,
              filename: 'orders.diff',
            },
          },
        ],
      },
    ],
  });
  assert(response.ok, 'input_file response failed');
  assert(getOutputText(body) === 'AUTH_GAP', 'input_file output mismatch');
  checks.push('input_file');
}

{
  const { response, body } = await createResponse({
    model: 'openclaw/default',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Inspect the image. If it is a red square, reply with exactly RED_SQUARE. Otherwise reply with exactly OTHER.',
          },
          {
            type: 'input_image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: redSquareData,
            },
          },
        ],
      },
    ],
  });
  assert(response.ok, 'input_image response failed');
  assert(getOutputText(body) === 'RED_SQUARE', 'input_image output mismatch');
  checks.push('input_image');
}

{
  const first = await createResponse({
    model: 'openclaw/default',
    input:
      'Call the configured tool. After the tool result arrives, repeat the returned token exactly and do not add any other text.',
    tools: [
      {
        type: 'function',
        name: 'get_probe_token',
        description: 'Return a deterministic verification token.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
    tool_choice: {
      type: 'function',
      function: { name: 'get_probe_token' },
    },
  });
  assert(first.response.ok, 'function tool request failed');
  const functionCall = first.body.output?.find((item) => item.type === 'function_call');
  assert(functionCall?.call_id, 'function tool call missing');

  const second = await createResponse({
    model: 'openclaw/default',
    previous_response_id: first.body.id,
    input: [
      {
        type: 'function_call_output',
        call_id: functionCall.call_id,
        output: '{"token":"FUNCTION_TOOL_OK"}',
      },
    ],
  });
  assert(second.response.ok, 'function tool continuation failed');
  assert(
    getOutputText(second.body) === 'FUNCTION_TOOL_OK',
    'function tool continuation output mismatch',
  );
  checks.push('function_tools');
}

{
  const response = await fetch(`${gatewayUrl}/v1/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'openclaw/default',
      stream: true,
      input: 'Reply with exactly STREAM_OK.',
    }),
  });
  const body = await response.text();
  assert(response.ok, 'streaming response failed');
  assert(body.includes('STREAM_OK'), 'streaming payload missing expected token');
  checks.push('streaming');
}

{
  const allow = await jsonRequest('/tools/invoke', {
    method: 'POST',
    body: JSON.stringify({
      tool: 'sessions_list',
      action: 'json',
      args: {},
    }),
  });
  assert(allow.response.ok, 'allowed tool invoke failed');

  const deny = await jsonRequest('/tools/invoke', {
    method: 'POST',
    body: JSON.stringify({
      tool: 'exec',
      args: { command: 'echo no' },
    }),
  });
  assert(deny.response.status === 404, 'blocked tool invoke did not return 404');
  checks.push('tools_allow_deny');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      gatewayUrl,
      checks,
    },
    null,
    2,
  ),
);
