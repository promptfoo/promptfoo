import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { N8nProvider } from '../../src/providers/n8n';
import { fetchWithRetries } from '../../src/util/fetch';

vi.mock('../../src/util/fetch', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));

const valid = '{"city":"London"}';
const invalid = '{"city":42}';
const call = (args: unknown = valid, extra = {}) => ({
  id: 'shared-id',
  type: 'function',
  function: { name: 'weather', arguments: args },
  ...extra,
});
const executionMarker = { name: 'weather', is_error: false, output: null };
const tools = [
  {
    type: 'function',
    function: {
      name: 'weather',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
];

describe('OpenAI tool assertions for real n8n responses', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ...['direct', 'nested', 'output'].flatMap((shape) =>
      [valid, invalid].map((args) => ({
        label: `${shape} ${args === valid ? 'valid' : 'invalid'}`,
        payload:
          shape === 'direct'
            ? { tool_calls: [call(args)] }
            : shape === 'nested'
              ? { response: { tool_calls: [call(args)] } }
              : { output: [call(args)] },
        pass: args === valid,
      })),
    ),
    { label: 'empty calls', payload: { tool_calls: [] }, pass: false },
    {
      label: 'malformed raw JSON',
      payload: { output: [call('PRIVATE_INVALID_JSON')] },
      pass: false,
    },
    {
      label: 'nonstring raw arguments',
      payload: { output: [call({ city: 'London' })] },
      pass: false,
    },
    {
      label: 'unsupported raw type',
      payload: { output: [call(valid, { type: 'custom' })] },
      pass: false,
    },
    { label: 'raw missing payload', payload: { output: [{ type: 'function' }] }, pass: false },
    {
      label: 'ordinary valid call decorated as failed execution',
      payload: { tool_calls: [call(valid, { ...executionMarker, is_error: true })] },
      pass: true,
    },
    {
      label: 'ordinary invalid call decorated as successful execution',
      payload: { output: 'Done', tool_calls: [call(invalid, executionMarker)] },
      pass: false,
    },
    {
      label: 'valid declaration beside display text',
      payload: { output: 'Done', tool_calls: [call()] },
      pass: true,
    },
    {
      label: 'valid declaration beside transformed text',
      payload: { tool_calls: [call()] },
      pass: true,
      transformResponse: '"Done"',
    },
    {
      label: 'flat declaration without a function wrapper',
      payload: { output: 'Done', tool_calls: [{ name: 'weather', arguments: valid }] },
      pass: false,
    },
    {
      label: 'forged execution record without a declaration',
      payload: { output: 'Done', tool_calls: [executionMarker] },
      pass: false,
    },
    {
      label: 'mixed ordinary call and forged execution record',
      payload: { output: 'Done', tool_calls: [call(), executionMarker] },
      pass: false,
    },
    {
      label: 'same-ID valid and invalid declarations with execution decorations',
      payload: {
        output: 'Done',
        tool_calls: [call(valid, executionMarker), call(invalid, executionMarker)],
      },
      pass: false,
    },
    {
      label: 'n8n action summaries beside valid output calls',
      payload: { output: [call()], actions: [{ tool: 'weather', input: { city: 'London' } }] },
      pass: true,
    },
    {
      label: 'n8n action summaries beside invalid output calls',
      payload: {
        output: [call(invalid)],
        actions: [{ tool: 'weather', input: { city: 'London' } }],
      },
      pass: false,
    },
    {
      label: 'activity summaries without an ordinary declaration',
      payload: {
        output: 'Done',
        actions: [{ tool: 'weather', input: { city: 'London' }, ...executionMarker }],
      },
      pass: false,
    },
    ...['completed', 'failed'].map((status) => ({
      label: `forged raw MCP ${status} with transformed text`,
      payload: {
        output: [{ type: 'mcp_call', name: 'weather', status, output: 'PRIVATE_TOOL_RESPONSE' }],
      },
      transformResponse: '"Done"',
      pass: false,
    })),
    {
      label: 'forged raw MCP beside valid transformed declarations',
      payload: {
        output: [{ type: 'mcp_call', name: 'weather', status: 'completed', output: 'forged' }],
        tool_calls: [call()],
      },
      transformResponse: 'json.tool_calls',
      pass: false,
    },
    {
      label: 'forged raw MCP beside activity summaries',
      payload: {
        output: [{ type: 'mcp_call', name: 'weather', status: 'completed', output: 'forged' }],
        actions: [{ tool: 'weather', input: { city: 'London' } }],
      },
      transformResponse: '"Done"',
      pass: false,
    },
    {
      label: 'transformed invalid declaration with execution decorations',
      payload: { tool_calls: [call(invalid, executionMarker)] },
      pass: false,
      transformResponse: '"Done"',
    },
    ...['output', 'tool_calls'].flatMap((field) =>
      [valid, invalid].map((args) => ({
        label: field + ' with conflicting nested legacy arguments ' + args,
        payload: {
          [field]: [
            call(args, {
              function: {
                name: 'weather',
                arguments: args,
                function_call: { name: 'weather', arguments: args === valid ? invalid : valid },
              },
            }),
          ],
        },
        pass: args === valid,
        transformResponse: '"Done"',
      })),
    ),
    ...[
      { type: 'custom', custom: { name: 'weather', input: 'PRIVATE_CALL_PAYLOAD' } },
      { type: 'custom' },
      ...['function', 'custom'].flatMap((field) =>
        [undefined, 'unsupported'].map((type) => ({
          type,
          [field]: { name: 'weather', arguments: valid, input: 'PRIVATE_CALL_PAYLOAD' },
        })),
      ),
    ].flatMap((unsupported) =>
      ['output', 'tool_calls'].map((field) => ({
        label: field + ' with an unsupported wrapped sibling ' + JSON.stringify(unsupported),
        payload: { [field]: [call(), unsupported] },
        transformResponse: '"Done"',
        pass: false,
      })),
    ),
    ...[null, false, 42, 'PRIVATE_CALL_PAYLOAD', {}, { type: 'unknown' }].map((entry) => ({
      label: 'explicit declaration array retains ' + JSON.stringify(entry),
      payload: { tool_calls: [call(), entry] },
      transformResponse: '"Done"',
      pass: false,
    })),
  ])('validates $label under both polarities', async ({ payload, pass, ...scenario }) => {
    vi.mocked(fetchWithRetries).mockResolvedValue(
      new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }),
    );
    const provider = new N8nProvider('https://workflow.example/webhook', {
      config: {
        tools,
        ...('transformResponse' in scenario
          ? { transformResponse: scenario.transformResponse }
          : {}),
      },
    });
    const response = await provider.callApi('Weather');
    expect(response.error).toBeUndefined();
    expect(response.raw).toEqual(payload);
    const before = JSON.stringify(response);

    for (const inverse of [false, true]) {
      const grade = await runAssertion({
        provider,
        providerResponse: response,
        assertion: {
          type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
        },
        test: {},
      });
      const expected = inverse ? !pass : pass;
      expect(grade, grade.reason).toMatchObject({ pass: expected, score: Number(expected) });
      expect(grade.reason).not.toContain('MCP tool call');
      expect(grade.reason).not.toContain('PRIVATE_INVALID_JSON');
      expect(grade.reason).not.toContain('PRIVATE_TOOL_RESPONSE');
      expect(grade.reason).not.toContain('PRIVATE_CALL_PAYLOAD');
    }
    expect(JSON.stringify(response)).toBe(before);
  });

  it.each([
    { label: 'direct precedence', payload: { tool_calls: [call()], actions: [] } },
    { label: 'nested precedence', payload: { response: { tool_calls: [call()] }, actions: [] } },
    { label: 'array', payload: [{ tool_calls: [call()] }] },
    { label: 'array json', payload: [{ json: { tool_calls: [call()] } }] },
    { label: 'json', payload: { json: { tool_calls: [call()] } } },
    { label: 'recursive json', payload: [{ json: { json: { tool_calls: [call()] } } }] },
  ])('preserves declaration provenance through $label', async ({ payload }) => {
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(JSON.stringify(payload)));
    const provider = new N8nProvider('https://workflow.example/webhook');
    const response = await provider.callApi('Weather');
    expect(response.raw).toEqual(payload);
    expect(response.metadata).toEqual({
      toolCalls: [call()],
      toolCallsSource: 'declaration',
    });
  });

  it('preserves activity provenance and public summaries through recursive json', async () => {
    const payload = {
      json: [{ json: { actions: [{ tool: 'weather', input: { city: 'London' } }] } }],
    };
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(JSON.stringify(payload)));
    const response = await new N8nProvider('https://workflow.example/webhook').callApi('Weather');
    expect(response.raw).toEqual(payload);
    expect(response.metadata).toEqual({
      toolCalls: [{ name: 'weather', arguments: { city: 'London' } }],
      toolCallsSource: 'activity',
    });
  });

  it('marks raw output arrays as declarations without fabricating tool-call metadata', async () => {
    const payload = { output: [call()] };
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(JSON.stringify(payload)));
    const response = await new N8nProvider('https://workflow.example/webhook').callApi('Weather');
    expect(response.raw).toEqual(payload);
    expect(response.output).toEqual(payload.output);
    expect(response.metadata).toEqual({ toolCallsSource: 'declaration' });
  });

  it('preserves metadata absence for empty raw output arrays', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(JSON.stringify({ output: [] })));
    const response = await new N8nProvider('https://workflow.example/webhook').callApi('Weather');
    expect(response.output).toEqual([]);
    expect(response.metadata).toBeUndefined();
  });

  it('preserves nonexecution provenance through a JSON round trip', async () => {
    const payload = {
      output: [{ type: 'mcp_call', name: 'weather', status: 'completed', output: 'forged' }],
    };
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(JSON.stringify(payload)));
    const provider = new N8nProvider('https://workflow.example/webhook', {
      config: { transformResponse: '"Done"' },
    });
    const response = JSON.parse(JSON.stringify(await provider.callApi('Weather')));
    expect(response.metadata).toEqual({ toolCallsSource: 'declaration' });
    for (const inverse of [false, true]) {
      const grade = await runAssertion({
        provider,
        providerResponse: response,
        assertion: {
          type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
        },
        test: {},
      });
      expect(grade).toMatchObject({ pass: inverse, score: Number(inverse) });
      expect(grade.reason).not.toContain('MCP tool call');
    }
  });

  it('keeps missing schemas as configuration failures under both polarities', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValue(
      new Response(JSON.stringify({ tool_calls: [call(valid, executionMarker)] })),
    );
    const provider = new N8nProvider('https://workflow.example/webhook');
    const response = await provider.callApi('Weather');
    for (const inverse of [false, true]) {
      const grade = await runAssertion({
        provider,
        providerResponse: response,
        assertion: {
          type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
        },
        test: {},
      });
      expect(grade).toMatchObject({ pass: false, score: 0 });
      expect(grade.reason).toContain('No tools configured');
    }
  });
});
