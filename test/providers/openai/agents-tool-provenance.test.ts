import {
  Agent,
  Handoff,
  handoff,
  OpenAIProvider,
  setDefaultModelProvider,
  setTracingDisabled,
  tool,
} from '@openai/agents';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../../src/esm';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';

import type {
  AgentDefinition,
  OpenAiAgentsOptions,
} from '../../../src/providers/openai/agents-types';

vi.mock('../../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/esm')>()),
  importModule: vi.fn(),
}));

const reusablePrompt = {
  promptId: 'pmpt_tool_provenance',
  version: '7',
  variables: { destination: 'Paris' },
};
const wirePrompt = {
  id: reusablePrompt.promptId,
  version: reusablePrompt.version,
  variables: reusablePrompt.variables,
};
const sourceSettings = { temperature: 0.15, maxTokens: 17 };
const overrideSettings = { temperature: 0.6, maxTokens: 29 };
const overrideCases: Array<{
  name: string;
  config: Pick<OpenAiAgentsOptions, 'model' | 'modelSettings'>;
  model: string;
  settings: { temperature?: number; maxTokens?: number };
}> = [
  { name: 'no', config: {}, model: 'source-model', settings: sourceSettings },
  {
    name: 'model-only',
    config: { model: 'override-model' },
    model: 'override-model',
    settings: sourceSettings,
  },
  {
    name: 'settings-only',
    config: { modelSettings: overrideSettings },
    model: 'source-model',
    settings: overrideSettings,
  },
  {
    name: 'empty-settings',
    config: { modelSettings: {} },
    model: 'source-model',
    settings: {},
  },
  {
    name: 'combined',
    config: { model: 'override-model', modelSettings: overrideSettings },
    model: 'override-model',
    settings: overrideSettings,
  },
];

type WireRequest = Record<string, unknown>;
type WireOutput = Record<string, unknown>;
type ToolState = 'omitted' | 'explicit-empty';

function functionCall(name: string, id: string): WireOutput {
  return { id, type: 'function_call', call_id: id, name, arguments: '{}', status: 'completed' };
}

function transfer(request: WireRequest): WireOutput[] {
  const tools = request.tools as Array<{ type: string; name: string }>;
  const selected = tools.find((candidate) => candidate.name.startsWith('transfer_to_'));
  if (!selected) {
    throw new Error('Expected an actual serialized handoff function');
  }
  return [functionCall(selected.name, 'handoff_call')];
}

function expectToolState(request: WireRequest, state: ToolState) {
  expect(Object.hasOwn(request, 'tools')).toBe(state === 'explicit-empty');
  if (state === 'explicit-empty') {
    expect(request.tools).toEqual([]);
  }
}

describe('OpenAiAgentsProvider tool provenance', () => {
  const mockImportModule = vi.mocked(importModule);
  const requests: WireRequest[] = [];
  let outputs: Array<(request: WireRequest) => WireOutput[]>;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    mockImportModule.mockReset();
    requests.length = 0;
    outputs = [];
    setTracingDisabled(true);
    fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe('https://agents-tool-provenance.invalid/v1/responses');
      expect(init?.method).toBe('POST');
      // Capture serialized HTTP JSON so absent properties cannot be confused with undefined.
      const request = JSON.parse(init?.body as string) as WireRequest;
      requests.push(request);
      const output = outputs.shift()?.(request) ?? [
        {
          id: `message_${requests.length}`,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
        },
      ];
      return new Response(
        JSON.stringify({
          id: `response_${requests.length}`,
          object: 'response',
          created_at: 0,
          status: 'completed',
          model: request.model,
          output,
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const client = new OpenAI({
      apiKey: 'test-key',
      baseURL: 'https://agents-tool-provenance.invalid/v1',
      maxRetries: 0,
      fetch: fetchMock,
    });
    setDefaultModelProvider(
      new OpenAIProvider({
        openAIClient: client as unknown as NonNullable<
          ConstructorParameters<typeof OpenAIProvider>[0]
        >['openAIClient'],
        useResponses: true,
        cacheResponsesWebSocketModels: false,
      }),
    );
  });

  afterEach(() => {
    setDefaultModelProvider(new OpenAIProvider({ cacheResponsesWebSocketModels: false }));
    setTracingDisabled(false);
    mockImportModule.mockReset();
    vi.restoreAllMocks();
  });

  function exportedAgent(agent: Agent<any, any>): string {
    // Only module loading is substituted: the loader, exported Agent and Runner remain real.
    mockImportModule.mockResolvedValueOnce({ default: agent });
    return 'file:///agents-tool-provenance.mjs';
  }

  it.each(
    (['file', 'inline'] as const).flatMap((source) =>
      (['omitted', 'explicit-empty'] as const).flatMap((state) =>
        overrideCases.map((overrides) => ({ source, state, ...overrides })),
      ),
    ),
  )(
    'preserves $source $state tools with $name overrides',
    async ({ source, state, config, model, settings }) => {
      const definition = {
        name: 'Reusable workflow',
        instructions: 'Follow the reusable workflow.',
        prompt: reusablePrompt,
        model: 'source-model',
        modelSettings: sourceSettings,
        ...(state === 'explicit-empty' ? { tools: [] } : {}),
      } satisfies AgentDefinition;
      const original = new Agent(definition);
      const provider = new OpenAiAgentsProvider('workflow-label', {
        config: { agent: source === 'file' ? exportedAgent(original) : definition, ...config },
      });

      await expect(provider.callApi('Plan the visit.')).resolves.toMatchObject({ output: 'Done.' });

      expect(requests).toHaveLength(1);
      expect(requests[0].prompt).toEqual(wirePrompt);
      expect(requests[0].model).toBe(model);
      expect(requests[0].temperature).toBe(settings.temperature);
      expect(requests[0].max_output_tokens).toBe(settings.maxTokens);
      expectToolState(requests[0], state);
      expect(original.hasExplicitToolConfig()).toBe(state === 'explicit-empty');
      expect(original.model).toBe('source-model');
      expect(original.modelSettings).toEqual(sourceSettings);
      if (source === 'file') {
        expect(mockImportModule).toHaveBeenCalledWith('/agents-tool-provenance.mjs');
      } else {
        expect(mockImportModule).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    (['plain', 'explicit', 'dynamic'] as const).flatMap((kind) =>
      (['omitted', 'explicit-empty'] as const).map((state) => ({ kind, state })),
    ),
  )('preserves $state tools on a reached $kind handoff target', async ({ kind, state }) => {
    const target = new Agent({
      name: 'Prompt leaf',
      prompt: reusablePrompt,
      model: 'source-model',
      modelSettings: sourceSettings,
      ...(state === 'explicit-empty' ? { tools: [] } : {}),
    });
    const dynamicTarget = vi.fn(async () => target);
    const selectedHandoff =
      kind === 'plain'
        ? target
        : kind === 'explicit'
          ? handoff(target)
          : new Handoff(new Agent({ name: 'Declared target' }), dynamicTarget);
    const root = new Agent({ name: 'Router', handoffs: [selectedHandoff] });
    outputs.push(transfer);
    const provider = new OpenAiAgentsProvider('workflow-label', {
      config: {
        agent: exportedAgent(root),
        model: 'override-model',
        modelSettings: overrideSettings,
      },
    });

    await expect(provider.callApi('Transfer to the prompt workflow.')).resolves.toMatchObject({
      output: 'Done.',
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].tools).toEqual([
      expect.objectContaining({ type: 'function', name: expect.stringMatching(/^transfer_to_/) }),
    ]);
    expect(requests[1]).toMatchObject({
      prompt: wirePrompt,
      model: 'override-model',
      temperature: 0.6,
      max_output_tokens: 29,
    });
    expectToolState(requests[1], state);
    expect(dynamicTarget).toHaveBeenCalledTimes(kind === 'dynamic' ? 1 : 0);
    expect(target.hasExplicitToolConfig()).toBe(state === 'explicit-empty');
    expect(target.model).toBe('source-model');
  });

  it('retains callback-assigned tools when the target originally omitted tools', async () => {
    const execute = vi.fn(async () => 'Local tool result');
    const callbackTool = tool({
      name: 'callback_tool',
      description: 'Tool supplied by the transfer callback.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute,
    });
    const target = new Agent({
      name: 'Prompt leaf',
      prompt: reusablePrompt,
      model: 'source-model',
    });
    expect(target.hasExplicitToolConfig()).toBe(false);
    const onHandoff = vi.fn(async () => {
      target.tools = [callbackTool];
    });
    const root = new Agent({ name: 'Router', handoffs: [handoff(target, { onHandoff })] });
    outputs.push(transfer, () => [functionCall('callback_tool', 'tool_call')]);
    const provider = new OpenAiAgentsProvider('workflow-label', {
      config: {
        agent: exportedAgent(root),
        model: 'override-model',
        modelSettings: overrideSettings,
      },
    });

    await expect(provider.callApi('Transfer and use the local tool.')).resolves.toMatchObject({
      output: 'Done.',
    });

    expect(requests).toHaveLength(3);
    for (const request of requests.slice(1)) {
      expect(request).toMatchObject({
        prompt: wirePrompt,
        model: 'override-model',
        temperature: 0.6,
      });
      expect(request.tools).toEqual([
        expect.objectContaining({ type: 'function', name: 'callback_tool' }),
      ]);
    }
    expect(onHandoff).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(target.tools[0]).toBe(callbackTool);
    expect(target.hasExplicitToolConfig()).toBe(false);
  });

  it.each(['omitted', 'explicit-empty', 'nonempty'] as const)(
    'treats empty provider tool additions as a no-op for %s source tools',
    async (state) => {
      const localTool = tool({
        name: 'local_tool',
        description: 'Existing local tool.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute: async () => 'Local result',
      });
      const original = new Agent({
        name: 'Reusable workflow',
        prompt: reusablePrompt,
        ...(state === 'nonempty'
          ? { tools: [localTool] }
          : state === 'explicit-empty'
            ? { tools: [] }
            : {}),
      });
      const provider = new OpenAiAgentsProvider('workflow-label', {
        config: { agent: exportedAgent(original), tools: [], model: 'override-model' },
      });

      await expect(provider.callApi('Plan the visit.')).resolves.toMatchObject({ output: 'Done.' });

      expect(requests).toHaveLength(1);
      expect(requests[0].prompt).toEqual(wirePrompt);
      if (state === 'nonempty') {
        expect(requests[0].tools).toEqual([
          expect.objectContaining({ type: 'function', name: 'local_tool' }),
        ]);
        expect(original.tools[0]).toBe(localTool);
      } else {
        expectToolState(requests[0], state);
      }
    },
  );

  it.each(['omitted', 'explicit-empty'] as const)(
    'keeps an empty tools property without a reusable prompt for %s tools',
    async (state) => {
      const original = new Agent({
        name: 'Ordinary workflow',
        ...(state === 'explicit-empty' ? { tools: [] } : {}),
      });
      const provider = new OpenAiAgentsProvider('workflow-label', {
        config: { agent: exportedAgent(original), model: 'override-model' },
      });

      await expect(provider.callApi('Answer directly.')).resolves.toMatchObject({
        output: 'Done.',
      });

      expect(requests).toHaveLength(1);
      expect(Object.hasOwn(requests[0], 'prompt')).toBe(false);
      expectToolState(requests[0], 'explicit-empty');
    },
  );

  it.each([false, 'mock'] as const)(
    'still rejects reusable prompts before transport when executeTools is %s',
    async (executeTools) => {
      const provider = new OpenAiAgentsProvider('workflow-label', {
        config: {
          agent: {
            name: 'Reusable workflow',
            instructions: 'Follow the reusable workflow.',
            prompt: reusablePrompt,
          },
          model: 'override-model',
          executeTools,
        },
      });

      await expect(provider.callApi('Do not execute hosted tools.')).rejects.toThrow(
        'does not support reusable prompt templates',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
