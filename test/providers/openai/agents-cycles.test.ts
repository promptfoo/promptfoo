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
import type { HandoffInputData, RunContext } from '@openai/agents';

import type { OpenAiAgentsOptions } from '../../../src/providers/openai/agents-types';
import type { CallApiContextParams } from '../../../src/types';

vi.mock('../../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/esm')>()),
  importModule: vi.fn(),
}));

type Vars = { runId: string };
type WireRequest = Record<string, unknown>;
type WireOutput = Record<string, unknown>;
type Overrides = Pick<OpenAiAgentsOptions, 'model' | 'modelSettings'>;
const emptyParameters = {
  type: 'object' as const,
  properties: {},
  required: [],
  additionalProperties: false as const,
};
const replacementSettings: Array<{ temperature?: number }> = [{}, { temperature: 0.4 }];

function context(runId = 'single'): CallApiContextParams {
  return { prompt: { raw: `run:${runId}`, label: 'cycle' }, vars: { runId } };
}

function requestRunId(request: WireRequest): string {
  const match = JSON.stringify(request.input).match(/run:([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error('Missing run marker in the serialized request');
  }
  return match[1];
}

function finalOutput(): WireOutput[] {
  return [
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
    },
  ];
}

function functionOutput(name: string, args = '{}'): WireOutput[] {
  return [{ type: 'function_call', name, arguments: args, status: 'completed' }];
}

function transferOutput(request: WireRequest, args = '{}'): WireOutput[] {
  const tools = request.tools as Array<{ name: string }>;
  const selected = tools.find(
    ({ name }) => name.startsWith('transfer_to_') || name === 'return_to_b',
  );
  if (!selected) {
    throw new Error('Expected a serialized transfer function');
  }
  return functionOutput(selected.name, args);
}

function forcesLookup(request: WireRequest): boolean {
  return (
    request.tool_choice === 'required' ||
    (typeof request.tool_choice === 'object' &&
      request.tool_choice !== null &&
      (request.tool_choice as { name?: string }).name === 'lookup')
  );
}

function expectNoChoice(request: WireRequest) {
  expect(Object.hasOwn(request, 'tool_choice')).toBe(false);
}

function cycleReply(revisit = true) {
  const bRequests = new Map<string, number>();
  return (request: WireRequest): WireOutput[] => {
    if (request.instructions === 'Router' || request.instructions === 'C') {
      return transferOutput(request);
    }
    if (request.instructions !== 'B') {
      throw new Error(`Unexpected cycle agent: ${String(request.instructions)}`);
    }
    const runId = requestRunId(request);
    const turn = (bRequests.get(runId) ?? 0) + 1;
    bRequests.set(runId, turn);
    if (turn === 1) {
      return functionOutput('lookup');
    }
    if (turn === 2 && revisit) {
      return transferOutput(request);
    }
    // The old adapter forces lookup again on revisit. Honor it once, then finish after reset.
    if (turn === 3 && revisit && forcesLookup(request)) {
      return functionOutput('lookup');
    }
    if (turn > 4) {
      throw new Error('Cycle fixture exceeded its bounded B turns');
    }
    return finalOutput();
  };
}

function makeCycle(kind: 'plain' | 'convenience' | 'dynamic' = 'plain', resetToolChoice?: boolean) {
  const lookup = vi.fn(async () => 'Lookup result');
  const lookupTool = tool({
    name: 'lookup',
    description: 'Harmless lookup.',
    parameters: emptyParameters,
    execute: lookup,
  });
  const b = new Agent<Vars>({
    name: 'B',
    instructions: 'B',
    model: 'b-model',
    modelSettings: { toolChoice: 'lookup' },
    tools: [lookupTool],
    ...(resetToolChoice === undefined ? {} : { resetToolChoice }),
  });
  const c = new Agent<Vars>({ name: 'C', instructions: 'C', model: 'c-model' });
  const enteredB = vi.fn(async (_context: RunContext<Vars>) => {});
  const enteredC = vi.fn(async (_context: RunContext<Vars>) => {});
  const returnedB = vi.fn(async (_context: RunContext<Vars>) => {});
  const invokeReturn = vi.fn(async (_context: RunContext<Vars>, _args: string) => b);
  const declared = new Agent<Vars>({
    name: 'Declared target',
    instructions: 'Never execute declared target.',
  });
  const returnHandoff = new Handoff(declared, invokeReturn);
  b.handoffs = [kind === 'convenience' ? handoff(c, { onHandoff: enteredC }) : c];
  c.handoffs = [
    kind === 'dynamic'
      ? returnHandoff
      : kind === 'convenience'
        ? handoff(b, { onHandoff: returnedB })
        : b,
  ];
  const root = new Agent<Vars>({
    name: 'Router',
    instructions: 'Router',
    model: 'router-model',
    handoffs: [kind === 'convenience' ? handoff(b, { onHandoff: enteredB }) : b],
  });
  const starts = new Map<string, Agent<Vars>[]>();
  b.on('agent_start', (runContext, runtimeAgent) => {
    const prior = starts.get(runContext.context.runId) ?? [];
    prior.push(runtimeAgent);
    starts.set(runContext.context.runId, prior);
  });
  return {
    root,
    b,
    c,
    lookup,
    lookupTool,
    starts,
    enteredB,
    enteredC,
    returnedB,
    invokeReturn,
    returnHandoff,
  };
}

describe('OpenAiAgentsProvider cyclic handoffs', () => {
  const mockImportModule = vi.mocked(importModule);
  const requests: WireRequest[] = [];
  let reply: (request: WireRequest) => WireOutput[] | Promise<WireOutput[]>;

  beforeEach(() => {
    mockImportModule.mockReset();
    requests.length = 0;
    reply = () => {
      throw new Error('No HTTP response scripted');
    };
    setTracingDisabled(true);
    const client = new OpenAI({
      apiKey: 'test-key',
      baseURL: 'https://agents-cycles.invalid/v1',
      maxRetries: 0,
      fetch: async (url, init) => {
        expect(String(url)).toBe('https://agents-cycles.invalid/v1/responses');
        expect(init?.method).toBe('POST');
        const request = JSON.parse(init?.body as string) as WireRequest;
        requests.push(request);
        const index = requests.length;
        if (index > 24) {
          throw new Error('Cycle fixture exceeded its bounded HTTP requests');
        }
        const output = (await reply(request)).map((item, itemIndex) => ({
          ...item,
          id: `item_${index}_${itemIndex}`,
          ...(item.type === 'function_call' ? { call_id: `call_${index}_${itemIndex}` } : {}),
        }));
        return new Response(
          JSON.stringify({
            id: `response_${index}`,
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
      },
    });
    setDefaultModelProvider(
      new OpenAIProvider({
        openAIClient: client as unknown as NonNullable<
          ConstructorParameters<typeof OpenAIProvider>[0]
        >['openAIClient'],
        useResponses: true,
        useResponsesWebSocket: false,
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

  function providerFor(
    root: Agent<Vars>,
    overrides: Overrides = { model: 'override-model' },
    additions: OpenAiAgentsOptions = {},
  ) {
    mockImportModule.mockResolvedValueOnce({ default: root });
    return new OpenAiAgentsProvider('cycle-workflow', {
      config: { agent: 'file:///agents-cycle.mjs', ...overrides, ...additions },
    });
  }

  function expectStableB(graph: ReturnType<typeof makeCycle>, runId = 'single') {
    const starts = graph.starts.get(runId)!;
    expect(starts).toHaveLength(2);
    expect(starts[1]).toBe(starts[0]);
  }

  it.each(['plain', 'convenience', 'dynamic'] as const)(
    'resets the satisfied lookup after a %s cyclic return',
    async (kind) => {
      const graph = makeCycle(kind, kind === 'convenience' ? true : undefined);
      reply = cycleReply();
      const provider = providerFor(graph.root);

      await expect(provider.callApi('run:single', context())).resolves.toMatchObject({
        output: 'Done.',
      });

      expect({ requests: requests.length, lookupCalls: graph.lookup.mock.calls.length }).toEqual({
        requests: 5,
        lookupCalls: 1,
      });
      expect(requests.map((request) => request.model)).toEqual(Array(5).fill('override-model'));
      expect(requests[1].tool_choice).toEqual({ type: 'function', name: 'lookup' });
      for (const index of [0, 2, 3, 4]) {
        expectNoChoice(requests[index]);
      }
      expectStableB(graph);
      for (const callback of [graph.enteredB, graph.enteredC, graph.returnedB]) {
        expect(callback).toHaveBeenCalledTimes(kind === 'convenience' ? 1 : 0);
      }
      expect(graph.invokeReturn).toHaveBeenCalledTimes(kind === 'dynamic' ? 1 : 0);
      if (kind === 'dynamic') {
        expect(graph.invokeReturn).toHaveBeenCalledWith(
          expect.objectContaining({ context: { runId: 'single' } }),
          '{}',
        );
      }
      expect(graph.b.model).toBe('b-model');
      expect(graph.b.modelSettings).toEqual({ toolChoice: 'lookup' });
      expect(graph.b.tools[0]).toBe(graph.lookupTool);
      expect(mockImportModule).toHaveBeenCalledWith('/agents-cycle.mjs');
    },
  );

  it('retains source models and cycle reset without provider overrides through the inline loader', async () => {
    const graph = makeCycle();
    reply = cycleReply();
    const provider = new OpenAiAgentsProvider('cycle-workflow', {
      config: {
        agent: {
          name: 'Router',
          instructions: 'Router',
          model: 'router-model',
          handoffs: [graph.b],
        },
      },
    });

    await expect(provider.callApi('run:single', context())).resolves.toMatchObject({
      output: 'Done.',
    });

    expect(graph.lookup).toHaveBeenCalledTimes(1);
    expect(requests.map((request) => request.model)).toEqual([
      'router-model',
      'b-model',
      'b-model',
      'c-model',
      'b-model',
    ]);
    expectNoChoice(requests[2]);
    expectNoChoice(requests[4]);
    expectStableB(graph);
    expect(mockImportModule).not.toHaveBeenCalled();
  });

  it('retains ordinary post-tool reset without revisiting B', async () => {
    const graph = makeCycle();
    reply = cycleReply(false);
    const provider = providerFor(graph.root);
    await expect(provider.callApi('run:single', context())).resolves.toMatchObject({
      output: 'Done.',
    });
    expect(requests).toHaveLength(3);
    expect(graph.lookup).toHaveBeenCalledTimes(1);
    expectNoChoice(requests[2]);
    expect(graph.starts.get('single')).toHaveLength(1);
  });

  it('keeps a different same-name returned Agent tool history independent', async () => {
    const graph = makeCycle('dynamic');
    const secondLookup = vi.fn(async () => 'Second lookup result');
    const second = new Agent<Vars>({
      name: 'B',
      instructions: 'B2',
      model: 'b2-model',
      modelSettings: { toolChoice: 'lookup' },
      tools: [
        tool({
          name: 'lookup',
          description: 'Independent lookup.',
          parameters: emptyParameters,
          execute: secondLookup,
        }),
      ],
    });
    let secondRuntime: Agent<Vars> | undefined;
    second.on('agent_start', (_context, agent) => {
      secondRuntime = agent;
    });
    graph.invokeReturn.mockImplementation(async () => second);
    const originalReply = cycleReply();
    let secondRequests = 0;
    reply = (request) =>
      request.instructions === 'B2'
        ? ++secondRequests === 1
          ? functionOutput('lookup')
          : finalOutput()
        : originalReply(request);

    await expect(providerFor(graph.root).callApi('run:single', context())).resolves.toMatchObject({
      output: 'Done.',
    });

    expect(requests).toHaveLength(6);
    expect(requests[4].instructions).toBe('B2');
    expect(requests[4].tool_choice).toEqual({ type: 'function', name: 'lookup' });
    expectNoChoice(requests[5]);
    expect(graph.lookup).toHaveBeenCalledTimes(1);
    expect(secondLookup).toHaveBeenCalledTimes(1);
    expect(secondRuntime).not.toBe(graph.starts.get('single')![0]);
    expect(graph.invokeReturn).toHaveBeenCalledTimes(1);
    expect(second.model).toBe('b2-model');
  });

  it('uses fresh runtime identities on repeated calls while preserving hooks and configured additions', async () => {
    const graph = makeCycle();
    const once = vi.fn();
    const removed = vi.fn();
    const toolStarts = vi.fn();
    graph.b.once('agent_start', once);
    graph.b.on('agent_start', removed);
    graph.b.off('agent_start', removed);
    graph.b.on('agent_tool_start', toolStarts);
    const roots: Agent<Vars>[] = [];
    graph.root.on('agent_start', (_context, agent) => {
      roots.push(agent);
    });
    const rootTool = tool({
      name: 'root_added',
      description: 'Provider addition.',
      parameters: emptyParameters,
      execute: async () => 'Unused',
    });
    reply = cycleReply();
    const provider = providerFor(graph.root, { model: 'override-model' }, { tools: [rootTool] });
    for (const runId of ['first', 'second']) {
      await expect(provider.callApi(`run:${runId}`, context(runId))).resolves.toMatchObject({
        output: 'Done.',
      });
    }

    expect({ requests: requests.length, lookupCalls: graph.lookup.mock.calls.length }).toEqual({
      requests: 10,
      lookupCalls: 2,
    });
    expectStableB(graph, 'first');
    expectStableB(graph, 'second');
    expect(graph.starts.get('first')![0]).not.toBe(graph.starts.get('second')![0]);
    expect(roots[0]).not.toBe(roots[1]);
    expect(once).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(toolStarts).toHaveBeenCalledTimes(2);
    expect(toolStarts.mock.calls.every((call) => call[1] === graph.lookupTool)).toBe(true);
    for (const request of requests.filter((body) => body.instructions === 'Router')) {
      expect(request.tools).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'root_added' })]),
      );
    }
    expect(graph.root.tools).toEqual([]);
    expect(graph.root.model).toBe('router-model');
    expect(graph.b.modelSettings).toEqual({ toolChoice: 'lookup' });
  });

  it('isolates runtime identities and tool history across gated concurrent calls', async () => {
    const graph = makeCycle();
    const scripted = cycleReply();
    reply = scripted;
    const provider = providerFor(graph.root);
    // Initialize the reusable provider before overlapping runs, without testing initialization races.
    await provider.callApi('run:warmup', context('warmup'));
    requests.length = 0;
    graph.lookup.mockClear();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let bothArrived!: () => void;
    const arrived = new Promise<void>((resolve) => {
      bothArrived = resolve;
    });
    let routers = 0;
    reply = async (request) => {
      if (request.instructions === 'Router') {
        if (++routers === 2) {
          bothArrived();
        }
        await gate;
      }
      return scripted(request);
    };
    const runs = ['left', 'right'].map((runId) => provider.callApi(`run:${runId}`, context(runId)));
    try {
      await Promise.race([
        arrived,
        Promise.all(runs).then(() => {
          throw new Error('Runs ended before both Router requests arrived');
        }),
      ]);
      expect(routers).toBe(2);
      release();
      await expect(Promise.all(runs)).resolves.toEqual([
        expect.objectContaining({ output: 'Done.' }),
        expect.objectContaining({ output: 'Done.' }),
      ]);
      expect({ requests: requests.length, lookupCalls: graph.lookup.mock.calls.length }).toEqual({
        requests: 10,
        lookupCalls: 2,
      });
      for (const runId of ['left', 'right']) {
        expectStableB(graph, runId);
        const ownRequests = requests.filter((request) => requestRunId(request) === runId);
        expect(ownRequests).toHaveLength(5);
        expect(ownRequests[1].tool_choice).toEqual({ type: 'function', name: 'lookup' });
        expectNoChoice(ownRequests[4]);
      }
      expect(graph.starts.get('left')![0]).not.toBe(graph.starts.get('right')![0]);
    } finally {
      release();
      await Promise.allSettled(runs);
    }
  });

  it('refreshes a revisited Agent and descendants while retaining identity and handoff metadata', async () => {
    const graph = makeCycle('dynamic');
    const marker = tool({
      name: 'marker',
      description: 'Callback marker.',
      parameters: emptyParameters,
      execute: async () => 'Marker',
    });
    const descendant = new Agent<Vars>({
      name: 'Descendant',
      instructions: 'Old descendant',
      model: 'descendant-model',
    });
    const enabled = vi.fn(async () => true);
    const inputFilter = vi.fn((data: HandoffInputData) => data);
    const schema = {
      type: 'object' as const,
      properties: { route: { type: 'string' as const } },
      required: ['route'],
      additionalProperties: false,
    };
    graph.c.handoffs = [
      graph.returnHandoff.clone({
        toolName: 'return_to_b',
        toolDescription: 'Return to the existing B.',
        inputJsonSchema: schema,
        strictJsonSchema: false,
        isEnabled: enabled,
        inputFilter,
      }),
    ];
    graph.invokeReturn.mockImplementation(async () => {
      graph.b.instructions = 'B refreshed';
      graph.b.model = 'callback-model';
      graph.b.modelSettings = { toolChoice: 'lookup', temperature: 0.25 };
      graph.b.tools = [graph.lookupTool, marker];
      descendant.instructions = 'Refreshed descendant';
      graph.b.handoffs = [descendant];
      return graph.b;
    });
    const originalReply = cycleReply();
    let refreshedRequests = 0;
    reply = (request) => {
      if (request.instructions === 'B refreshed') {
        if (++refreshedRequests === 1 && forcesLookup(request)) {
          return functionOutput('lookup');
        }
        return transferOutput(request);
      }
      if (request.instructions === 'Refreshed descendant') {
        return finalOutput();
      }
      return request.instructions === 'C'
        ? transferOutput(request, '{"route":"back"}')
        : originalReply(request);
    };

    await expect(providerFor(graph.root).callApi('run:single', context())).resolves.toMatchObject({
      output: 'Done.',
    });

    expect({ requests: requests.length, lookupCalls: graph.lookup.mock.calls.length }).toEqual({
      requests: 6,
      lookupCalls: 1,
    });
    expectStableB(graph);
    expect(requests[3].tools).toEqual([
      expect.objectContaining({
        name: 'return_to_b',
        description: 'Return to the existing B.',
        parameters: schema,
        strict: false,
      }),
    ]);
    expect(requests[4]).toMatchObject({
      instructions: 'B refreshed',
      model: 'override-model',
      temperature: 0.25,
    });
    expectNoChoice(requests[4]);
    expect(requests[4].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'marker' }),
        expect.objectContaining({ name: handoff(descendant).toolName }),
      ]),
    );
    expect(requests[5]).toMatchObject({
      instructions: 'Refreshed descendant',
      model: 'override-model',
    });
    expect(graph.starts.get('single')![1].tools[1]).toBe(marker);
    expect(graph.invokeReturn).toHaveBeenCalledTimes(1);
    expect(graph.invokeReturn).toHaveBeenCalledWith(
      expect.objectContaining({ context: { runId: 'single' } }),
      '{"route":"back"}',
    );
    expect(inputFilter).toHaveBeenCalledTimes(1);
    expect(enabled).toHaveBeenCalled();
    expect(graph.b.model).toBe('callback-model');
    expect(graph.b.modelSettings).toEqual({ toolChoice: 'lookup', temperature: 0.25 });
    expect(descendant.model).toBe('descendant-model');
  });

  it.each([false, true])(
    'resets valid graph-wide required settings on revisit (model override: %s)',
    async (overrideModel) => {
      const graph = makeCycle();
      reply = cycleReply();
      const provider = providerFor(graph.root, {
        modelSettings: { toolChoice: 'required' },
        ...(overrideModel ? { model: 'override-model' } : {}),
      });
      await expect(provider.callApi('run:single', context())).resolves.toMatchObject({
        output: 'Done.',
      });
      expect({ requests: requests.length, lookupCalls: graph.lookup.mock.calls.length }).toEqual({
        requests: 5,
        lookupCalls: 1,
      });
      for (const index of [0, 1, 3]) {
        expect(requests[index].tool_choice).toBe('required');
      }
      expectNoChoice(requests[2]);
      expectNoChoice(requests[4]);
      expect(requests.map((request) => request.model)).toEqual(
        overrideModel
          ? Array(5).fill('override-model')
          : ['router-model', 'b-model', 'b-model', 'c-model', 'b-model'],
      );
      expectStableB(graph);
    },
  );

  it.each(replacementSettings)(
    'replaces the source forced choice with provider settings %j',
    async (modelSettings) => {
      const graph = makeCycle();
      reply = cycleReply();
      await expect(
        providerFor(graph.root, { modelSettings }).callApi('run:single', context()),
      ).resolves.toMatchObject({ output: 'Done.' });
      expect(requests).toHaveLength(5);
      expect(graph.lookup).toHaveBeenCalledTimes(1);
      for (const request of requests) {
        expectNoChoice(request);
        expect(request.temperature).toBe(modelSettings.temperature);
      }
      expect(graph.b.modelSettings).toEqual({ toolChoice: 'lookup' });
    },
  );

  it('preserves forced choice when reset is disabled and stops through a controlled abort', async () => {
    const graph = makeCycle('plain', false);
    const controller = new AbortController();
    let bRequests = 0;
    reply = (request) => {
      if (request.instructions === 'Router') {
        return transferOutput(request);
      }
      if (++bRequests === 1) {
        return functionOutput('lookup');
      }
      controller.abort();
      throw new DOMException('Controlled cycle fixture abort', 'AbortError');
    };
    await expect(
      providerFor(graph.root).callApi('run:single', context(), { abortSignal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    expect(requests).toHaveLength(3);
    expect(graph.lookup).toHaveBeenCalledTimes(1);
    expect(requests[2].tool_choice).toEqual({ type: 'function', name: 'lookup' });
    expect(controller.signal.aborted).toBe(true);
  });

  it('preserves explicit none and returns final output without invoking tools', async () => {
    const graph = makeCycle();
    graph.b.modelSettings = { toolChoice: 'none' };
    reply = finalOutput;
    await expect(providerFor(graph.b).callApi('run:single', context())).resolves.toMatchObject({
      output: 'Done.',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].tool_choice).toBe('none');
    expect(graph.lookup).not.toHaveBeenCalled();
  });

  it.each(['omitted', 'explicit-empty'] as const)(
    'refreshes %s tools provenance after callback tools are added and removed',
    async (state) => {
      const execute = vi.fn(async () => 'Callback tool result');
      const callbackTool = tool({
        name: 'callback_tool',
        description: 'Added during transfer.',
        parameters: emptyParameters,
        execute,
      });
      const prompt = {
        promptId: 'pmpt_cycle_provenance',
        version: '3',
        variables: { city: 'Paris' },
      };
      const b = new Agent<Vars>({
        name: 'B',
        instructions: 'B',
        prompt,
        model: 'b-model',
        ...(state === 'explicit-empty' ? { tools: [] } : {}),
      });
      const c = new Agent<Vars>({ name: 'C', instructions: 'C', model: 'c-model' });
      const add = vi.fn(async () => {
        b.tools = [callbackTool];
      });
      const remove = vi.fn(async () => {
        b.tools = [];
        b.handoffs = [];
      });
      b.handoffs = [c];
      c.handoffs = [handoff(b, { onHandoff: remove })];
      const root = new Agent<Vars>({
        name: 'Router',
        instructions: 'Router',
        handoffs: [handoff(b, { onHandoff: add })],
      });
      const starts: Array<{ agent: Agent<Vars>; tools: Agent<Vars>['tools']; explicit: boolean }> =
        [];
      b.on('agent_start', (_context, agent) => {
        starts.push({ agent, tools: [...agent.tools], explicit: agent.hasExplicitToolConfig() });
      });
      let bRequests = 0;
      reply = (request) => {
        if (request.instructions !== 'B') {
          return transferOutput(request);
        }
        switch (++bRequests) {
          case 1:
            return functionOutput('callback_tool');
          case 2:
            return transferOutput(request);
          default:
            return finalOutput();
        }
      };
      await expect(providerFor(root).callApi('run:single', context())).resolves.toMatchObject({
        output: 'Done.',
      });
      expect(requests).toHaveLength(5);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(starts).toHaveLength(2);
      expect(starts[1].agent).toBe(starts[0].agent);
      expect(starts[0].tools[0]).toBe(callbackTool);
      expect(starts.map((start) => start.explicit)).toEqual([true, state === 'explicit-empty']);
      expect(requests[4].prompt).toEqual({
        id: prompt.promptId,
        version: prompt.version,
        variables: prompt.variables,
      });
      expect(Object.hasOwn(requests[4], 'tools')).toBe(state === 'explicit-empty');
      if (state === 'explicit-empty') {
        expect(requests[4].tools).toEqual([]);
      }
      expect(b.hasExplicitToolConfig()).toBe(state === 'explicit-empty');
      expect(b.tools).toEqual([]);
    },
  );

  it('keeps the configured root baseline distinct from a returned unmerged source root', async () => {
    const root = new Agent<Vars>({ name: 'Router', instructions: 'Router', model: 'router-model' });
    const b = new Agent<Vars>({ name: 'B', instructions: 'B', model: 'b-model', handoffs: [root] });
    root.handoffs = [b];
    const addition = tool({
      name: 'root_added',
      description: 'Only on the configured root.',
      parameters: emptyParameters,
      execute: async () => 'Unused',
    });
    const roots: Agent<Vars>[] = [];
    root.on('agent_start', (_context, agent) => {
      roots.push(agent);
    });
    const visits = new Map<string, number>();
    reply = (request) => {
      if (request.instructions === 'B') {
        return transferOutput(request);
      }
      const runId = requestRunId(request);
      const visit = (visits.get(runId) ?? 0) + 1;
      visits.set(runId, visit);
      return visit === 1 ? transferOutput(request) : finalOutput();
    };
    const provider = providerFor(root, { model: 'override-model' }, { tools: [addition] });
    for (const runId of ['first', 'second']) {
      await expect(provider.callApi(`run:${runId}`, context(runId))).resolves.toMatchObject({
        output: 'Done.',
      });
    }
    expect(requests).toHaveLength(6);
    expect(roots).toHaveLength(4);
    for (const index of [0, 3]) {
      expect(requests[index].tools).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'root_added' })]),
      );
      const returnedTools = requests[index + 2].tools as Array<{ name: string }>;
      expect(returnedTools.map((candidate) => candidate.name)).not.toContain('root_added');
    }
    expect(roots[0]).not.toBe(roots[1]);
    expect(roots[0]).not.toBe(roots[2]);
    expect(root.tools).toEqual([]);
    expect(root.model).toBe('router-model');
  });
});
