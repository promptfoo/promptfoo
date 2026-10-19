import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { fetchWithCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { getStripFlags, sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createMockFetchResponse } from './mockProviderResponses';

import type { EvalConversations } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const valid = '{"count":1}';
const invalid = '{"count":"private-invalid"}';
const wrapped = (args: unknown = valid) => ({ name: 'regular', arguments: args });

const cases = [
  { label: 'invalid routed arguments', top: invalid, nested: valid, pass: false },
  { label: 'invalid routed JSON', top: '{private-invalid', nested: valid, pass: false },
  { label: 'routed object arguments', top: { count: 1 }, nested: valid, pass: false },
  { label: 'invalid original arguments', top: valid, nested: invalid, pass: false },
  { label: 'invalid original JSON', top: valid, nested: '{private-invalid', pass: false },
  { label: 'original object arguments', top: valid, nested: { count: 1 }, pass: false },
  { label: 'identical arguments', top: valid, nested: valid, pass: true },
  { label: 'different valid arguments', top: '{"count":2}', nested: valid, pass: true },
];

describe.each(['openai', 'azure'] as const)('%s ordinary callback evidence', (family) => {
  let provider: OpenAiChatCompletionProvider | AzureChatCompletionProvider;

  const createProvider = () => {
    const callbacks = {
      regular: vi.fn(async (_args: string) => 'Done'),
      alternate: vi.fn(async (_args: string) => 'Alternate done'),
      undeclared: vi.fn(async (_args: string) => 'Undeclared done'),
    };
    const config = {
      apiKey: 'test-key',
      apiBaseUrl: 'https://provider.example',
      tools: ['regular', 'alternate'].map((name) => ({
        type: 'function' as const,
        function: {
          name,
          parameters: {
            type: 'object' as const,
            properties: { count: { type: 'number' } },
            required: ['count'],
          },
        },
      })),
      functionToolCallbacks: callbacks,
    };
    provider =
      family === 'openai'
        ? new OpenAiChatCompletionProvider('gpt-4o-mini', { config })
        : new AzureChatCompletionProvider('test-deployment', { config });
    return callbacks;
  };

  const respond = (calls: unknown[]) => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({ choices: [{ message: { content: null, tool_calls: calls } }] }),
    );
  };

  const expectVerdicts = async (
    response: Awaited<ReturnType<typeof provider.callApi>>,
    pass: boolean,
  ) => {
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
      expect(grade.reason).not.toContain('private-invalid');
    }
  };

  afterEach(async () => {
    await provider?.cleanup();
    vi.resetAllMocks();
  });

  it.each(cases)('validates original and $label', async ({ top, nested, pass }) => {
    const callbacks = createProvider();
    const call = {
      id: 'shared-id',
      type: 'function',
      name: 'regular',
      arguments: top,
      function: wrapped(nested),
    };
    respond([call]);

    const response = await provider.callApi('Count');

    expect(response.output).toBe('Done');
    expect(callbacks.regular).toHaveBeenCalledOnce();
    expect(callbacks.regular.mock.calls[0][0]).toEqual(top);
    await expectVerdicts(response, pass);
    const original = { id: 'shared-id', type: 'function', function: wrapped(nested) };
    expect(response.metadata?.functionToolCalls).toEqual(
      top === nested ? [original] : [original, { type: 'function', function: wrapped(top) }],
    );
  });

  it.each(['alternate', 'undeclared'] as const)('validates the routed name %s', async (name) => {
    const callbacks = createProvider();
    respond([{ type: 'function', name, arguments: valid, function: wrapped() }]);

    const response = await provider.callApi('Count');

    expect(callbacks[name]).toHaveBeenCalledOnce();
    expect(callbacks[name].mock.calls[0][0]).toBe(valid);
    expect(callbacks.regular).not.toHaveBeenCalled();
    await expectVerdicts(response, name === 'alternate');
    expect(response.metadata?.functionToolCalls).toEqual([
      { type: 'function', function: wrapped() },
      { type: 'function', function: { name, arguments: valid } },
    ]);
  });

  it.each(['custom', undefined])('preserves malformed original type %s', async (type) => {
    const callbacks = createProvider();
    respond([{ type, name: 'regular', arguments: '{"count":2}', function: wrapped() }]);

    const response = await provider.callApi('Count');

    expect(callbacks.regular.mock.calls[0][0]).toBe('{"count":2}');
    expect(response.metadata?.functionToolCalls[0]).toEqual({ type, function: wrapped() });
    await expectVerdicts(response, false);
  });

  it('preserves an absent nested payload', async () => {
    const callbacks = createProvider();
    respond([{ type: 'function', name: 'regular', arguments: valid }]);

    const response = await provider.callApi('Count');

    expect(callbacks.regular.mock.calls[0][0]).toBe(valid);
    await expectVerdicts(response, false);
  });

  it.each([undefined, ''])('preserves provider routing for top-level arguments %s', async (top) => {
    const callbacks = createProvider();
    respond([{ type: 'function', name: 'regular', arguments: top, function: wrapped() }]);

    const response = await provider.callApi('Count');

    const expectedArgs = family === 'openai' ? valid : '{}';
    expect(callbacks.regular.mock.calls[0][0]).toBe(expectedArgs);
    await expectVerdicts(response, family === 'openai');
  });

  it('preserves provider routing for top-level arguments without a name', async () => {
    const callbacks = createProvider();
    respond([{ type: 'function', arguments: invalid, function: wrapped() }]);

    const response = await provider.callApi('Count');

    expect(callbacks.regular.mock.calls[0][0]).toBe(family === 'openai' ? invalid : valid);
    await expectVerdicts(response, family === 'azure');
  });

  it('records only callback routes reached after an earlier callback throws', async () => {
    const callbacks = createProvider();
    callbacks.regular.mockRejectedValue(new Error('Callback unavailable'));
    respond([
      { id: 'shared-id', type: 'function', function: wrapped() },
      {
        id: 'shared-id',
        type: 'function',
        name: 'alternate',
        arguments: invalid,
        function: { name: 'alternate', arguments: valid },
      },
    ]);

    const response = await provider.callApi('Count');

    expect(callbacks.regular).toHaveBeenCalledOnce();
    expect(callbacks.alternate).toHaveBeenCalledTimes(family === 'azure' ? 1 : 0);
    expect(response.metadata?.functionToolCalls).toHaveLength(family === 'azure' ? 3 : 2);
    await expectVerdicts(response, family === 'openai');
  });

  it('keeps supplemental private arguments out of stripped exports and conversation metadata', async () => {
    const callbacks = createProvider();
    respond([{ type: 'function', name: 'regular', arguments: invalid, function: wrapped() }]);
    const conversations: EvalConversations = {};

    const [result] = await runEval({
      provider,
      prompt: { raw: 'Count', label: 'Callback privacy' },
      test: { assert: [{ type: 'not-is-valid-openai-tools-call' }] },
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      conversations,
      registers: {},
    });

    expect(callbacks.regular.mock.calls[0][0]).toBe(invalid);
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.gradingResult)).not.toContain('private-invalid');
    const turns = Object.values(conversations).flat();
    expect(turns).toHaveLength(1);
    expect(JSON.stringify(turns)).not.toContain('private-invalid');
    expect(turns[0].metadata).not.toHaveProperty('functionToolCalls');
    for (const strip of [false, true]) {
      const projected = sanitizeResultForJsonlArtifact(
        result,
        getStripFlags({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: String(strip) }),
      );
      expect(projected.success).toBe(true);
      expect(JSON.stringify(projected).includes('private-invalid')).toBe(!strip);
    }
  });
});
