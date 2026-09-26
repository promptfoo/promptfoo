import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { calculateAzureCost } from '../../../src/providers/azure/util';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));
vi.mock('../../../src/logger');

const projectUrl = 'https://test.services.ai.azure.com/api/projects/responses';
const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };
const tool = (callId = 'call_one') => ({
  type: 'function_call',
  call_id: callId,
  name: 'lookup',
  arguments: '{"city":"Paris"}',
});
const reply = (id: string, output: any[], overrides: Record<string, unknown> = {}) => ({
  id,
  status: 'completed',
  model: 'gpt-4.1',
  error: null,
  output,
  usage,
  ...overrides,
});
const text = (value: string) => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text: value }],
});

// Mock only the SDK boundary; exercise real request construction and output processing.
describe('Foundry Responses conversation and accounting', () => {
  let create: ReturnType<typeof vi.fn>;
  let getAgent: ReturnType<typeof vi.fn>;
  let callback = vi.fn(async (_args: string) => 'sunny');
  const provider = (config: Record<string, unknown> = {}) =>
    new AzureFoundryAgentProvider('agent', {
      config: { projectUrl, functionToolCallbacks: { lookup: callback }, ...config },
    });

  beforeEach(() => {
    vi.resetAllMocks();
    create = vi.fn();
    callback = vi.fn(async (_args: string) => 'sunny');
    getAgent = vi.fn().mockResolvedValue({ id: 'agent_id', name: 'agent' });
    vi.spyOn(AzureFoundryAgentProvider.prototype as any, 'initializeClient').mockResolvedValue({
      agents: { get: getAgent },
      getOpenAIClient: () => ({ responses: { create } }),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('preserves effective instructions, tools, schema, model and generation settings across three turns', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()]))
      .mockResolvedValueOnce(reply('second', [tool('call_two')]))
      .mockResolvedValueOnce(reply('last', [text('{"weather":"sunny"}')]));
    const tools = [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }];
    const schema = {
      type: 'object',
      properties: { weather: { type: 'string' } },
      required: ['weather'],
      additionalProperties: false,
    };
    const result = await provider({
      instructions: 'provider instructions',
      temperature: 1,
    }).callApi('weather?', {
      prompt: {
        config: {
          instructions: 'Return weather JSON',
          modelName: 'gpt-4.1',
          tools,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'weather', schema, strict: true },
          },
          max_output_tokens: 77,
          temperature: 0.2,
          top_p: 0.9,
          reasoning_effort: 'low',
          verbosity: 'low',
          metadata: { task: 'weather' },
          passthrough: {
            parallel_tool_calls: false,
            store: true,
            include: ['message.output_text.logprobs'],
          },
        },
      },
    } as any);
    const [first, second, last] = create.mock.calls.map(([body]) => body);
    const { input: _input, ...settings } = first;
    expect(settings).toMatchObject({
      instructions: 'Return weather JSON',
      model: 'gpt-4.1',
      tools,
      temperature: 0.2,
      text: { format: { type: 'json_schema', name: 'weather', schema }, verbosity: 'low' },
      reasoning: { effort: 'low' },
      max_output_tokens: 77,
      top_p: 0.9,
      parallel_tool_calls: false,
      store: true,
    });
    expect(second).toEqual({
      ...settings,
      previous_response_id: 'first',
      input: [{ type: 'function_call_output', call_id: 'call_one', output: 'sunny' }],
    });
    expect(last).toEqual({
      ...settings,
      previous_response_id: 'second',
      input: [{ type: 'function_call_output', call_id: 'call_two', output: 'sunny' }],
    });
    expect(result.output).toEqual({ weather: 'sunny' });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['required', 'auto'],
    [{ type: 'function', name: 'lookup' }, 'auto'],
    [
      { type: 'allowed_tools', mode: 'required', tools: [{ type: 'function', name: 'lookup' }] },
      { type: 'allowed_tools', mode: 'auto', tools: [{ type: 'function', name: 'lookup' }] },
    ],
    ['auto', 'auto'],
    ['none', 'none'],
  ])(
    'relaxes first-turn forcing while preserving tool restrictions: %j',
    async (choice, continuationChoice) => {
      create
        .mockResolvedValueOnce(reply('first', [tool()]))
        .mockResolvedValueOnce(reply('last', [text('done')]));
      await provider({ tool_choice: choice }).callApi('weather?');
      expect(create.mock.calls[0][0].tool_choice).toEqual(choice);
      expect(create.mock.calls[1][0].tool_choice).toEqual(continuationChoice);
    },
  );

  it.each(['conv_one', { id: 'conv_one' }])(
    'uses the same conversation without response linkage: %j',
    async (conversation) => {
      create
        .mockResolvedValueOnce(reply('first', [tool()]))
        .mockResolvedValueOnce(reply('last', [text('done')]));
      await provider({ passthrough: { conversation } }).callApi('weather?');
      expect(create.mock.calls[1][0]).toEqual({
        conversation,
        input: [{ type: 'function_call_output', call_id: 'call_one', output: 'sunny' }],
      });
    },
  );

  it('replaces an initial previous response ID with the latest response ID', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()]))
      .mockResolvedValueOnce(reply('last', [text('done')]));
    await provider({ passthrough: { previous_response_id: 'old' } }).callApi('weather?');
    expect(create.mock.calls[0][0].previous_response_id).toBe('old');
    expect(create.mock.calls[1][0].previous_response_id).toBe('first');
  });

  it.each([{ conversation: 'conv' }, { previous_response_id: 'old' }])(
    'does not cache stateful requests: %j',
    async (passthrough) => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      create.mockResolvedValue(reply('one', [text('done')]));
      const p = provider({ passthrough, functionToolCallbacks: undefined });
      await p.callApi('same');
      await p.callApi('same');
      expect(create).toHaveBeenCalledTimes(2);
      expect(getCache).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ conversation: 'conv', previous_response_id: 'old' }, 'cannot be used together'],
    [{ stream: true }, 'non-streaming'],
    [{ background: true }, 'foreground'],
    [{ store: false }, 'stateless tool history'],
    [{ store: 'false' }, 'must be a boolean'],
  ])('rejects unsupported request combinations before SDK work: %j', async (passthrough, error) => {
    const result = await provider().callApi('weather?', {
      prompt: { config: { passthrough } },
    } as any);
    expect(result.error).toContain(error);
    expect(getAgent).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('supports single-turn stateless requests without automatic callbacks', async () => {
    create.mockResolvedValue(reply('one', [text('done')]));
    const result = await provider({
      passthrough: { store: false },
      functionToolCallbacks: undefined,
    }).callApi('weather?');
    expect(result.output).toBe('done');
    expect(create.mock.calls[0][0].store).toBe(false);
  });

  it('submits id-less parallel function calls exactly once using their call IDs', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool('one'), tool('two')]))
      .mockResolvedValueOnce(reply('last', [text('done')]));
    expect((await provider().callApi('weather?')).output).toBe('done');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].input).toEqual([
      { type: 'function_call_output', call_id: 'one', output: 'sunny' },
      { type: 'function_call_output', call_id: 'two', output: 'sunny' },
    ]);
  });

  it.each([
    [tool('one'), { ...tool('two'), name: 'unknown' }],
    [tool('one'), { ...tool('two'), name: 'toString' }],
    [tool('one'), { ...tool('two'), arguments: null }],
    [tool('one'), tool('one')],
  ])('does not execute part of an unresolved/invalid batch: %j', async (...calls) => {
    create.mockResolvedValue(reply('first', calls));
    await provider().callApi('weather?');
    expect(callback).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each([null, undefined])(
    'preserves usable output and accounting without executing a batch containing %s',
    async (invalidItem) => {
      const response = reply('first', [invalidItem, tool(), text('partial answer')]);
      create.mockResolvedValue(response);

      const result = await provider().callApi('weather?');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('partial answer');
      expect(result.output).toContain('"call_id":"call_one"');
      expect(result.raw).toBe(response);
      expect(result.tokenUsage).toMatchObject({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(calculateAzureCost('gpt-4.1', {}, 10, 5)!, 12);
      expect(callback).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledOnce();
    },
  );

  it.each([null, undefined])(
    'retains a late final answer containing %s after a completed tool turn',
    async (invalidItem) => {
      vi.useFakeTimers();
      create.mockResolvedValueOnce(reply('first', [tool()])).mockImplementationOnce(async () => {
        vi.advanceTimersByTime(100);
        return reply('last', [invalidItem, text('final answer')]);
      });

      const result = await provider({ maxPollTimeMs: 100 }).callApi('weather?');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('final answer');
      expect(result.tokenUsage).toMatchObject({ total: 30, numRequests: 2 });
      expect(callback).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['failed', 'cancelled', 'incomplete', 'queued', 'in_progress'])(
    'preserves %s as an error even with partial text',
    async (status) => {
      const response = reply('first', [text('partial')], {
        status,
        incomplete_details: { reason: 'max_output_tokens' },
        output_text: 'partial',
      });
      create.mockResolvedValue(response);
      const result = await provider().callApi('weather?');
      expect(result.error).toContain(status);
      expect(result.output).toBe('partial');
      expect(result.raw).toBe(response);
      expect(result.metadata).toMatchObject({
        responseStatus: status,
        incompleteReason: 'max_output_tokens',
      });
      expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 1 });
      expect(result.cost).toBeGreaterThan(0);
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it('does not mask an API error with output_text, even when output is missing', async () => {
    create.mockResolvedValue(
      reply('first', [], {
        error: { message: 'service failed', code: 'server_error' },
        output_text: 'partial',
      }),
    );
    const result = await provider().callApi('weather?');
    expect(result.error).toBe('service failed');
    expect(result.output).toBe('partial');
  });

  it.each([
    { refusal: '', expected: 'partial' },
    { refusal: 'Cannot help', expected: 'Cannot help' },
  ])('preserves terminal partial text with refusal "$refusal"', async ({ refusal, expected }) => {
    const message = text('partial');
    const response = reply(
      'first',
      [{ ...message, content: [...message.content, { type: 'refusal', refusal }] }, tool()],
      {
        status: 'failed',
        error: { message: 'service failed', code: 'server_error' },
        output_text: 'partial',
      },
    );
    create.mockResolvedValue(response);

    const result = await provider().callApi('weather?');

    expect(result).toMatchObject({ output: expected, error: 'service failed', isRefusal: true });
    expect(result.raw).toBe(response);
    expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 1 });
    expect(callback).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });

  it('preserves a parsed empty JSON string when retaining a terminal error', async () => {
    const response = reply('first', [text('""')], {
      status: 'failed',
      error: { message: 'service failed', code: 'server_error' },
      output_text: '""',
    });
    create.mockResolvedValue(response);

    const result = await provider({
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'text', schema: { type: 'string' } },
      },
    }).callApi('weather?');

    expect(result).toMatchObject({ output: '', error: 'service failed' });
    expect(result.isRefusal).not.toBe(true);
    expect(result.raw).toBe(response);
    expect(callback).not.toHaveBeenCalled();
  });

  it('preserves a string service error and partial output without executing callbacks', async () => {
    const response = reply('first', [text('partial'), tool()], {
      error: 'service diagnostic',
      output_text: 'partial',
    });
    create.mockResolvedValue(response);

    const result = await provider().callApi('weather?');

    expect(result.error).toBe('service diagnostic');
    expect(result.output).toContain('partial');
    expect(result.raw).toBe(response);
    expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 1 });
    expect(callback).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(['failed', 'incomplete'])(
    'does not execute calls included in a %s response',
    async (status) => {
      create.mockResolvedValue(reply('first', [tool()], { status }));
      expect((await provider().callApi('weather?')).error).toContain(status);
      expect(callback).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledOnce();
    },
  );

  it('keeps completed refusals distinguishable from provider errors', async () => {
    create.mockResolvedValue(
      reply('one', [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'refusal', refusal: 'Cannot help' }],
        },
      ]),
    );
    const result = await provider().callApi('weather?');
    expect(result).toMatchObject({ output: 'Cannot help', isRefusal: true });
    expect(result.error).toBeUndefined();
  });

  it('reports empty output as an error and retains its usage', async () => {
    create.mockResolvedValue(reply('one', []));
    const result = await provider().callApi('weather?');
    expect(result.error).toContain('Missing output array');
    expect(result.tokenUsage?.total).toBe(15);
  });

  it('sums usage details and separately priced models across all turns', async () => {
    const firstUsage = {
      input_tokens: 100,
      output_tokens: 30,
      total_tokens: 130,
      input_tokens_details: { cached_tokens: 40 },
      output_tokens_details: { reasoning_tokens: 10 },
    };
    const lastUsage = {
      input_tokens: 200,
      output_tokens: 40,
      total_tokens: 240,
      input_tokens_details: { cached_tokens: 60 },
      output_tokens_details: { reasoning_tokens: 20 },
    };
    create
      .mockResolvedValueOnce(reply('first', [tool()], { usage: firstUsage, model: 'gpt-4.1' }))
      .mockResolvedValueOnce(reply('last', [text('done')], { usage: lastUsage, model: 'gpt-5.6' }));
    const result = await provider({ modelName: 'gpt-4.1' }).callApi('weather?');
    expect(result.tokenUsage).toMatchObject({
      prompt: 300,
      completion: 70,
      total: 370,
      cached: 100,
      numRequests: 2,
      completionDetails: { reasoning: 30, cacheReadInputTokens: 100 },
    });
    const expected =
      calculateAzureCost('gpt-4.1', {}, 100, 30, 40)! +
      calculateAzureCost('gpt-5.6', {}, 200, 40, 60)!;
    expect(result.cost).toBeCloseTo(expected, 12);
    expect(result.raw?.id).toBe('last');
    expect(result.raw?.usage).toEqual(lastUsage);
  });

  it('counts a response without usage and marks totals incomplete instead of inventing cost', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()], { usage: undefined }))
      .mockResolvedValueOnce(reply('last', [text('done')]));
    const result = await provider().callApi('weather?');
    expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 2 });
    expect(result.cost).toBeUndefined();
    expect(result.metadata).toMatchObject({
      costIncomplete: true,
      usageIncomplete: true,
      knownCost: calculateAzureCost('gpt-4.1', {}, 10, 5),
    });
  });

  describe.each(['input_tokens', 'output_tokens'] as const)('%s validation', (field) => {
    it.each([undefined, null, '10', NaN, Infinity, -1])(
      'retains only known usage when the count is %s',
      async (value) => {
        create.mockResolvedValue(
          reply('first', [text('done')], {
            usage: { input_tokens: 10, output_tokens: 5, [field]: value },
          }),
        );

        const result = await provider().callApi('weather?');

        expect(result.tokenUsage).toMatchObject({
          prompt: field === 'input_tokens' ? 0 : 10,
          completion: field === 'output_tokens' ? 0 : 5,
          total: field === 'input_tokens' ? 5 : 10,
          numRequests: 1,
        });
        expect(result.metadata).toMatchObject({ usageIncomplete: true, costIncomplete: true });
        expect(result.cost).toBeUndefined();
      },
    );
  });

  it.each([{}, { input_tokens: null, output_tokens: null }])(
    'marks usage without either count incomplete: %j',
    async (partialUsage) => {
      create.mockResolvedValue(reply('first', [text('done')], { usage: partialUsage }));
      const result = await provider().callApi('weather?');
      expect(result.tokenUsage).toMatchObject({
        prompt: 0,
        completion: 0,
        total: 0,
        numRequests: 1,
      });
      expect(result.metadata).toMatchObject({ usageIncomplete: true, costIncomplete: true });
      expect(result.cost).toBeUndefined();
    },
  );

  describe.each([
    { field: 'total', details: (value: unknown) => ({ total_tokens: value }) },
    {
      field: 'reasoning',
      details: (value: unknown) => ({ output_tokens_details: { reasoning_tokens: value } }),
    },
    {
      field: 'accepted prediction',
      details: (value: unknown) => ({
        output_tokens_details: { accepted_prediction_tokens: value },
      }),
    },
    {
      field: 'rejected prediction',
      details: (value: unknown) => ({
        output_tokens_details: { rejected_prediction_tokens: value },
      }),
    },
    {
      field: 'cache write',
      details: (value: unknown) => ({ input_tokens_details: { cache_write_tokens: value } }),
    },
  ])('$field reporting-only usage validation', ({ details }) => {
    it.each([null, '2', NaN, Infinity, -1])(
      'retains both turns cost and incomplete usage for an invalid count %s',
      async (value) => {
        create
          .mockResolvedValueOnce(
            reply('first', [tool()], { usage: { ...usage, ...details(value) } }),
          )
          .mockResolvedValueOnce(reply('last', [text('done')]));

        const result = await provider().callApi('weather?');

        expect(result.output).toBe('done');
        expect(result.tokenUsage).toMatchObject({
          prompt: 20,
          completion: 10,
          total: 30,
          numRequests: 2,
        });
        expect(result.tokenUsage?.completionDetails).toBeUndefined();
        expect(result.metadata?.usageIncomplete).toBe(true);
        expect(result.metadata?.costIncomplete).toBeUndefined();
        expect(result.cost).toBeCloseTo(2 * calculateAzureCost('gpt-4.1', {}, 10, 5)!, 12);
        expect(callback).toHaveBeenCalledOnce();
      },
    );

    it('retains priced turns in known cost when a later model cannot be priced', async () => {
      create
        .mockResolvedValueOnce(reply('first', [tool()], { usage: { ...usage, ...details('2') } }))
        .mockResolvedValueOnce(reply('second', [tool('call_two')]))
        .mockResolvedValueOnce(reply('last', [text('done')], { model: 'custom-deployment' }));

      const result = await provider().callApi('weather?');

      expect(result.tokenUsage).toMatchObject({ total: 45, numRequests: 3 });
      expect(result.metadata).toMatchObject({ usageIncomplete: true, costIncomplete: true });
      expect(result.metadata?.knownCost).toBeCloseTo(
        2 * calculateAzureCost('gpt-4.1', {}, 10, 5)!,
        12,
      );
      expect(result.cost).toBeUndefined();
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it.each([undefined, 0])('keeps usage and cost complete for count %s', async (value) => {
      create.mockResolvedValue(
        reply('first', [text('done')], { usage: { ...usage, ...details(value) } }),
      );

      const result = await provider().callApi('weather?');

      expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 5, numRequests: 1 });
      expect(result.metadata?.usageIncomplete).toBeUndefined();
      expect(result.metadata?.costIncomplete).toBeUndefined();
      expect(result.cost).toBe(calculateAzureCost('gpt-4.1', {}, 10, 5));
    });
  });

  it.each([null, '2', NaN, Infinity, -1])(
    'excludes cost for an invalid cached input count %s while retaining later known cost',
    async (cached) => {
      create
        .mockResolvedValueOnce(
          reply('first', [tool()], {
            usage: { ...usage, input_tokens_details: { cached_tokens: cached } },
          }),
        )
        .mockResolvedValueOnce(reply('last', [text('done')]));

      const result = await provider().callApi('weather?');

      expect(result.tokenUsage).toMatchObject({ prompt: 20, completion: 10, total: 30 });
      expect(result.metadata).toMatchObject({
        usageIncomplete: true,
        costIncomplete: true,
        knownCost: calculateAzureCost('gpt-4.1', {}, 10, 5),
      });
      expect(result.cost).toBeUndefined();
    },
  );

  it.each([
    { input_tokens: 10, output_tokens: 5 },
    { input_tokens: 0, output_tokens: 0 },
  ])('derives an omitted total from complete counts: %j', async (completeUsage) => {
    create.mockResolvedValue(reply('first', [text('done')], { usage: completeUsage }));
    const result = await provider().callApi('weather?');
    expect(result.tokenUsage).toMatchObject({
      prompt: completeUsage.input_tokens,
      completion: completeUsage.output_tokens,
      total: completeUsage.input_tokens + completeUsage.output_tokens,
    });
    expect(result.metadata?.usageIncomplete).toBeUndefined();
    expect(result.metadata?.costIncomplete).toBeUndefined();
    expect(result.cost).toBeDefined();
  });

  it('keeps partial usage incomplete after a later complete turn', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()], { usage: { input_tokens: 20 } }))
      .mockResolvedValueOnce(reply('last', [text('done')]));
    const result = await provider().callApi('weather?');
    expect(result.tokenUsage).toMatchObject({
      prompt: 30,
      completion: 5,
      total: 35,
      numRequests: 2,
    });
    expect(result.metadata).toMatchObject({
      usageIncomplete: true,
      costIncomplete: true,
      knownCost: calculateAzureCost('gpt-4.1', {}, 10, 5),
    });
    expect(result.cost).toBeUndefined();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('discards malformed detail counts before accumulating later valid details', async () => {
    create
      .mockResolvedValueOnce(
        reply('first', [tool()], {
          usage: {
            ...usage,
            input_tokens_details: { cached_tokens: '3' },
            output_tokens_details: {
              reasoning_tokens: '2',
              accepted_prediction_tokens: -1,
              rejected_prediction_tokens: Infinity,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        reply('last', [text('done')], {
          usage: {
            ...usage,
            input_tokens_details: { cached_tokens: 4, cache_write_tokens: 1 },
            output_tokens_details: {
              reasoning_tokens: 2,
              accepted_prediction_tokens: 1,
              rejected_prediction_tokens: 0,
            },
          },
        }),
      );
    const result = await provider().callApi('weather?');
    expect(result.tokenUsage).toMatchObject({
      prompt: 20,
      completion: 10,
      total: 30,
      cached: 4,
      numRequests: 2,
      completionDetails: {
        reasoning: 2,
        acceptedPrediction: 1,
        rejectedPrediction: 0,
        cacheReadInputTokens: 4,
        cacheCreationInputTokens: 1,
      },
    });
    expect(result.metadata).toMatchObject({ usageIncomplete: true, costIncomplete: true });
  });

  describe.each([
    {
      field: 'input audio',
      details: (value: unknown) => ({ input_tokens_details: { audio_tokens: value } }),
    },
    {
      field: 'output audio',
      details: (value: unknown) => ({ output_tokens_details: { audio_tokens: value } }),
    },
    {
      field: 'input image',
      details: (value: unknown) => ({ input_tokens_details: { image_tokens: value } }),
    },
    {
      field: 'output image',
      details: (value: unknown) => ({ output_tokens_details: { image_tokens: value } }),
    },
    {
      field: 'cached input audio',
      details: (value: unknown) => ({
        input_tokens_details: { cached_tokens_details: { audio_tokens: value } },
      }),
    },
    {
      field: 'cached input image',
      details: (value: unknown) => ({
        input_tokens_details: { cached_tokens_details: { image_tokens: value } },
      }),
    },
  ])('$field modality usage validation', ({ details }) => {
    it.each([null, '2', NaN, Infinity, -1])(
      'excludes cost with an invalid count %s while retaining later known cost',
      async (value) => {
        create
          .mockResolvedValueOnce(
            reply('first', [tool()], { usage: { ...usage, ...details(value) } }),
          )
          .mockResolvedValueOnce(reply('last', [text('done')]));

        const result = await provider().callApi('weather?');

        expect(result.output).toBe('done');
        expect(result.tokenUsage).toMatchObject({
          prompt: 20,
          completion: 10,
          total: 30,
          numRequests: 2,
        });
        expect(result.metadata).toMatchObject({
          usageIncomplete: true,
          costIncomplete: true,
          knownCost: calculateAzureCost('gpt-4.1', {}, 10, 5),
        });
        expect(result.cost).toBeUndefined();
        expect(callback).toHaveBeenCalledOnce();
      },
    );

    it.each([undefined, 0, 2])('retains complete accounting for count %s', async (value) => {
      create.mockResolvedValue(
        reply('first', [text('done')], { usage: { ...usage, ...details(value) } }),
      );

      const result = await provider().callApi('weather?');

      expect(result.output).toBe('done');
      expect(result.tokenUsage).toMatchObject({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
      });
      expect(result.metadata?.usageIncomplete).toBeUndefined();
      expect(result.metadata?.costIncomplete).toBeUndefined();
      expect(result.cost).toBeGreaterThan(0);
    });
  });

  it.each([
    ['cached input exceeds input', { input_tokens_details: { cached_tokens: 20 } }],
    [
      'cached image implies an impossible input partition',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 8,
          cached_tokens_details: { image_tokens: 5 },
        },
      },
    ],
    [
      'cached audio implies an impossible input partition',
      {
        input_tokens_details: {
          cached_tokens: 5,
          image_tokens: 8,
          cached_tokens_details: { audio_tokens: 5 },
        },
      },
    ],
    ['input audio exceeds input', { input_tokens_details: { audio_tokens: 11 } }],
    ['input image exceeds input', { input_tokens_details: { image_tokens: 11 } }],
    [
      'input modalities exceed input',
      { input_tokens_details: { audio_tokens: 6, image_tokens: 5 } },
    ],
    ['output audio exceeds output', { output_tokens_details: { audio_tokens: 6 } }],
    ['output image exceeds output', { output_tokens_details: { image_tokens: 6 } }],
    [
      'output modalities exceed output',
      { output_tokens_details: { audio_tokens: 3, image_tokens: 3 } },
    ],
    [
      'cached audio exceeds input audio',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 2,
          cached_tokens_details: { audio_tokens: 3 },
        },
      },
    ],
    [
      'cached image exceeds input image',
      {
        input_tokens_details: {
          cached_tokens: 5,
          image_tokens: 2,
          cached_tokens_details: { image_tokens: 3 },
        },
      },
    ],
    [
      'cached audio exceeds cached input',
      {
        input_tokens_details: {
          cached_tokens: 2,
          audio_tokens: 4,
          cached_tokens_details: { audio_tokens: 3 },
        },
      },
    ],
    [
      'cached image exceeds cached input',
      {
        input_tokens_details: {
          cached_tokens: 2,
          image_tokens: 4,
          cached_tokens_details: { image_tokens: 3 },
        },
      },
    ],
    [
      'cached modalities exceed cached input',
      {
        input_tokens_details: {
          cached_tokens: 3,
          audio_tokens: 4,
          image_tokens: 4,
          cached_tokens_details: { audio_tokens: 2, image_tokens: 2 },
        },
      },
    ],
    [
      'cached modalities exceed input with omitted optional parents',
      { input_tokens_details: { cached_tokens_details: { audio_tokens: 6, image_tokens: 5 } } },
    ],
    [
      'explicit cached audio leaves too much cached input outside audio',
      {
        input_tokens_details: {
          cached_tokens: 10,
          audio_tokens: 8,
          cached_tokens_details: { audio_tokens: 1 },
        },
      },
    ],
    [
      'explicit cached modalities leave too much cached text',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 4,
          image_tokens: 4,
          cached_tokens_details: { audio_tokens: 1, image_tokens: 1 },
        },
      },
    ],
    [
      'explicit zero cached audio contradicts fully cached audio',
      {
        input_tokens_details: {
          cached_tokens: 10,
          audio_tokens: 8,
          cached_tokens_details: { audio_tokens: 0 },
        },
      },
    ],
  ])(
    'keeps accounting incomplete when %s, including after a later valid turn',
    async (_label, details) => {
      create
        .mockResolvedValueOnce(reply('first', [tool()], { usage: { ...usage, ...details } }))
        .mockResolvedValueOnce(reply('last', [text('done')]));

      const result = await provider().callApi('weather?');

      expect(result.output).toBe('done');
      expect(result.tokenUsage).toMatchObject({
        prompt: 20,
        completion: 10,
        total: 30,
        numRequests: 2,
      });
      expect(result.metadata).toMatchObject({
        usageIncomplete: true,
        costIncomplete: true,
        knownCost: calculateAzureCost('gpt-4.1', {}, 10, 5),
      });
      expect(result.cost).toBeUndefined();
      expect(callback).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['cached input equals input', { input_tokens_details: { cached_tokens: 10 } }],
    [
      'cached image implies a possible input partition at the boundary',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 5,
          cached_tokens_details: { image_tokens: 5 },
        },
      },
    ],
    [
      'cached audio implies a possible input partition at the boundary',
      {
        input_tokens_details: {
          cached_tokens: 5,
          image_tokens: 5,
          cached_tokens_details: { audio_tokens: 5 },
        },
      },
    ],
    [
      'all modality subtotals equal their parents',
      {
        input_tokens_details: {
          cached_tokens: 10,
          audio_tokens: 4,
          image_tokens: 6,
          cached_tokens_details: { audio_tokens: 4, image_tokens: 6 },
        },
        output_tokens_details: { audio_tokens: 2, image_tokens: 3 },
      },
    ],
    [
      'cached tokens overlap audio with an omitted cache breakdown',
      { input_tokens_details: { cached_tokens: 5, audio_tokens: 8 } },
    ],
    [
      'cached tokens overlap images with an omitted cache breakdown',
      { input_tokens_details: { cached_tokens: 5, image_tokens: 8 } },
    ],
    [
      'a partially reported cached modality partition stays possible',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 4,
          image_tokens: 4,
          cached_tokens_details: { audio_tokens: 1 },
        },
      },
    ],
    [
      'explicit cached audio leaves exactly the available cached text',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 8,
          cached_tokens_details: { audio_tokens: 3 },
        },
      },
    ],
    [
      'explicit cached modalities leave exactly the available cached text',
      {
        input_tokens_details: {
          cached_tokens: 5,
          audio_tokens: 4,
          image_tokens: 4,
          cached_tokens_details: { audio_tokens: 1, image_tokens: 2 },
        },
      },
    ],
    [
      'omitted cached and modality parents remain optional',
      { input_tokens_details: { cached_tokens_details: { audio_tokens: 2, image_tokens: 2 } } },
    ],
    [
      'explicit zero parents and subtotals remain valid',
      {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        input_tokens_details: {
          cached_tokens: 0,
          audio_tokens: 0,
          image_tokens: 0,
          cached_tokens_details: { audio_tokens: 0, image_tokens: 0 },
        },
        output_tokens_details: { audio_tokens: 0, image_tokens: 0 },
      },
    ],
  ])('keeps usage and pricing complete when %s', async (_label, details) => {
    create.mockResolvedValue(reply('first', [text('done')], { usage: { ...usage, ...details } }));

    const result = await provider().callApi('weather?');

    expect(result.output).toBe('done');
    expect(result.metadata?.usageIncomplete).toBeUndefined();
    expect(result.metadata?.costIncomplete).toBeUndefined();
    expect(result.cost).toBeGreaterThanOrEqual(0);
  });

  it('marks cost incomplete for an unknown served model but retains complete token usage', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()], { model: 'custom-deployment' }))
      .mockResolvedValueOnce(reply('last', [text('done')]));
    const result = await provider().callApi('weather?');
    expect(result.tokenUsage).toMatchObject({ total: 30, numRequests: 2 });
    expect(result.cost).toBeUndefined();
    expect(result.metadata?.costIncomplete).toBe(true);
    expect(result.metadata?.usageIncomplete).toBeUndefined();
  });

  it('retains known usage and rate-limit metadata when a later SDK request fails', async () => {
    create.mockResolvedValueOnce(reply('first', [tool()])).mockRejectedValueOnce(
      Object.assign(new Error('rate limited'), {
        status: 429,
        error: { code: 'rate_limit_exceeded' },
        headers: { 'retry-after': '3' },
      }),
    );
    const result = await provider().callApi('weather?');
    expect(result.error).toContain('Rate limit');
    expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 2 });
    expect(result.metadata).toMatchObject({
      http: { status: 429, headers: { 'retry-after': '3' } },
      usageIncomplete: true,
      costIncomplete: true,
    });
    expect(result.metadata?.knownCost).toBeGreaterThan(0);
  });

  it('retains usage and cost when a callback consumes the loop budget', async () => {
    vi.useFakeTimers();
    create.mockResolvedValue(reply('first', [tool()]));
    callback.mockImplementation(async () => {
      vi.advanceTimersByTime(100);
      return 'late';
    });
    const result = await provider({ maxPollTimeMs: 100 }).callApi('weather?');
    expect(result.error).toContain('timed out');
    expect(result.tokenUsage).toMatchObject({ total: 15, numRequests: 1 });
    expect(result.cost).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledOnce();
  });

  it('submits callback errors as tool outputs without losing multi-turn accounting', async () => {
    create
      .mockResolvedValueOnce(reply('first', [tool()]))
      .mockResolvedValueOnce(reply('last', [text('handled')]));
    callback.mockRejectedValue(new Error('lookup unavailable'));
    const result = await provider().callApi('weather?');
    expect(JSON.parse(create.mock.calls[1][0].input[0].output).error).toContain(
      'lookup unavailable',
    );
    expect(result.output).toBe('handled');
    expect(result.tokenUsage?.numRequests).toBe(2);
  });
});
