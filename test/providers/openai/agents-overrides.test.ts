import {
  Agent,
  Handoff,
  handoff,
  OpenAIProvider,
  Runner,
  run,
  setDefaultModelProvider,
  tool,
  Usage,
} from '@openai/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';
import type {
  Model,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamEvent,
} from '@openai/agents';

class HandoffModel implements Model {
  readonly requests: ModelRequest[] = [];

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);

    if (request.handoffs.length > 0) {
      return {
        usage: new Usage(),
        output: [
          {
            type: 'function_call',
            callId: 'handoff-call',
            name: request.handoffs[0].toolName,
            arguments: '{}',
          },
        ],
      };
    }

    return {
      usage: new Usage(),
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Escalated successfully.' }],
        },
      ],
    };
  }

  async *getStreamedResponse(_request: ModelRequest): AsyncIterable<StreamEvent> {
    throw new Error('Streaming is not used by this test');
  }
}

class RecordingModelProvider implements ModelProvider {
  readonly model = new HandoffModel();
  readonly modelNames: Array<string | undefined> = [];

  getModel(modelName?: string): Model {
    this.modelNames.push(modelName);
    return this.model;
  }
}

class ToolCallingModel extends HandoffModel {
  private invokedTool = false;

  override async getResponse(request: ModelRequest): Promise<ModelResponse> {
    if (request.tools.length && !this.invokedTool) {
      this.invokedTool = true;
      this.requests.push(request);
      return {
        usage: new Usage(),
        output: [
          {
            type: 'function_call',
            callId: 'delegate-call',
            name: 'delegate',
            arguments: '{"input":"Delegate."}',
          },
        ],
      };
    }
    return super.getResponse(request);
  }
}

describe('OpenAiAgentsProvider execution overrides', () => {
  afterEach(() => {
    setDefaultModelProvider(new OpenAIProvider({ cacheResponsesWebSocketModels: false }));
  });

  it.each([
    { phase: 'input' as const, customModel: false },
    { phase: 'output' as const, customModel: false },
    { phase: 'input' as const, customModel: true },
    { phase: 'output' as const, customModel: true },
  ])(
    'preserves independent $phase guardrail models and settings (custom Model: $customModel)',
    async ({ phase, customModel }) => {
      const modelProvider = new RecordingModelProvider();
      setDefaultModelProvider(modelProvider);
      const classifierModel = new HandoffModel();
      const classifier = new Agent({
        name: 'Independent Classifier',
        model: customModel ? classifierModel : 'classifier-model',
        modelSettings: { temperature: 0.05, topP: 0.6 },
      });
      const execute = vi.fn(async () => {
        const result = customModel
          ? await run(classifier, 'Classify this request.')
          : await new Runner({ modelProvider }).run(classifier, 'Classify this request.');
        return { tripwireTriggered: false, outputInfo: result.finalOutput };
      });
      const guardrail = { name: 'Independent safety check', execute, runInParallel: false };
      const provider = new OpenAiAgentsProvider('evaluated-workflow', {
        config: {
          agent: new Agent({ name: 'Evaluated Agent', model: 'initial-model' }),
          model: 'evaluated-model',
          modelSettings: { temperature: 0.2 },
          ...(phase === 'input'
            ? { inputGuardrails: [guardrail] }
            : { outputGuardrails: [guardrail] }),
        },
      });

      await expect(provider.callApi('Evaluate this request.')).resolves.toMatchObject({
        output: 'Escalated successfully.',
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(modelProvider.modelNames).toEqual(
        customModel
          ? ['evaluated-model']
          : phase === 'input'
            ? ['classifier-model', 'evaluated-model']
            : ['evaluated-model', 'classifier-model'],
      );
      const classifierRequest = customModel
        ? classifierModel.requests[0]
        : modelProvider.model.requests[phase === 'input' ? 0 : 1];
      expect(classifierRequest?.modelSettings).toEqual({ temperature: 0.05, topP: 0.6 });
      expect(
        modelProvider.model.requests[phase === 'input' && !customModel ? 1 : 0].modelSettings,
      ).toEqual({ temperature: 0.2 });
      expect(classifier.model).toBe(customModel ? classifierModel : 'classifier-model');
    },
  );

  it.each(['input', 'output'] as const)(
    'still enforces %s guardrail tripwires from independent classifiers',
    async (phase) => {
      const modelProvider = new RecordingModelProvider();
      setDefaultModelProvider(modelProvider);
      const classifierModel = new HandoffModel();
      const classifier = new Agent({ name: 'Classifier', model: classifierModel });
      const guardrail = {
        name: 'Blocking classifier',
        runInParallel: false,
        execute: async () => {
          const result = await run(classifier, 'Classify this request.');
          return { tripwireTriggered: true, outputInfo: result.finalOutput };
        },
      };
      const provider = new OpenAiAgentsProvider('evaluated-workflow', {
        config: {
          agent: new Agent({
            name: 'Evaluated Agent',
            ...(phase === 'input'
              ? { inputGuardrails: [guardrail] }
              : { outputGuardrails: [guardrail] }),
          }),
          model: 'evaluated-model',
        },
      });

      await expect(provider.callApi('Evaluate this request.')).rejects.toThrow(/guardrail/i);
      expect(classifierModel.requests).toHaveLength(1);
      expect(modelProvider.model.requests).toHaveLength(phase === 'input' ? 0 : 1);
    },
  );

  it.each([
    'tool-input',
    'tool-output',
    'runner-input',
    'runner-output',
    'input-builder',
    'output-extractor',
  ])('preserves independent classifier and child models in %s callbacks', async (callback) => {
    const evaluatedModel = new ToolCallingModel();
    const getModel = vi.fn(() => evaluatedModel);
    setDefaultModelProvider({ getModel });
    const classifierModel = new HandoffModel();
    const classifier = new Agent({
      name: 'Classifier',
      model: classifierModel,
      modelSettings: { temperature: 0.05 },
    });
    const classify = vi.fn(async () => {
      await run(classifier, 'Classify.');
    });
    const childModel = new HandoffModel();
    const child = new Agent({
      name: 'Child',
      model: childModel,
      modelSettings: { temperature: 0.9 },
    });
    const checkAgent = {
      name: 'Independent classifier',
      execute: async () => {
        await classify();
        return { tripwireTriggered: false, outputInfo: null };
      },
    };
    const checkTool = {
      name: 'Independent classifier',
      run: async () => {
        await classify();
        return { behavior: { type: 'allow' as const } };
      },
    };
    const delegatedTool = callback.startsWith('tool-')
      ? tool({
          name: 'delegate',
          description: 'Delegate work.',
          parameters: {
            type: 'object',
            properties: { input: { type: 'string' } },
            required: ['input'],
            additionalProperties: false,
          },
          execute: async () => 'Delegated.',
          ...(callback === 'tool-input'
            ? { inputGuardrails: [checkTool] }
            : { outputGuardrails: [checkTool] }),
        })
      : child.asTool({
          toolName: 'delegate',
          runConfig:
            callback === 'runner-input'
              ? { inputGuardrails: [checkAgent] }
              : callback === 'runner-output'
                ? { outputGuardrails: [checkAgent] }
                : undefined,
          ...(callback === 'input-builder'
            ? {
                inputBuilder: async () => {
                  await classify();
                  return 'Delegate.';
                },
              }
            : {}),
          ...(callback === 'output-extractor'
            ? {
                customOutputExtractor: async () => {
                  await classify();
                  return 'Delegated.';
                },
              }
            : {}),
        });
    const provider = new OpenAiAgentsProvider('evaluated-workflow', {
      config: {
        agent: new Agent({ name: 'Root', tools: [delegatedTool] }),
        model: 'evaluated-model',
        modelSettings: { temperature: 0.2 },
      },
    });

    await expect(provider.callApi('Delegate this request.')).resolves.toMatchObject({
      output: 'Escalated successfully.',
    });
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classifierModel.requests).toHaveLength(1);
    expect(classifierModel.requests[0].modelSettings).toEqual({ temperature: 0.05 });
    expect(getModel.mock.calls).toEqual([['evaluated-model'], ['evaluated-model']]);
    expect(evaluatedModel.requests.map((request) => request.modelSettings)).toEqual([
      { temperature: 0.2 },
      { temperature: 0.2 },
    ]);
    if (!callback.startsWith('tool-')) {
      expect(childModel.requests).toHaveLength(1);
      expect(childModel.requests[0].modelSettings).toEqual({ temperature: 0.9 });
      expect(child.model).toBe(childModel);
    }
  });

  it.each([
    {
      name: 'model and model settings',
      overrides: { model: 'override-model', modelSettings: { temperature: 0.2 } },
      expectedModels: ['override-model', 'override-model', 'override-model'],
      expectedSettings: [{ temperature: 0.2 }, { temperature: 0.2 }, { temperature: 0.2 }],
    },
    {
      name: 'model only',
      overrides: { model: 'override-model' },
      expectedModels: ['override-model', 'override-model', 'override-model'],
      expectedSettings: [
        { temperature: 0.7, topP: 0.3 },
        { temperature: 0.8, topP: 0.4 },
        { temperature: 0.9, topP: 0.5 },
      ],
    },
    {
      name: 'model settings only',
      overrides: { modelSettings: { temperature: 0.2 } },
      expectedModels: ['initial-model', 'handoff-model', 'resolution-model'],
      expectedSettings: [{ temperature: 0.2 }, { temperature: 0.2 }, { temperature: 0.2 }],
    },
  ])(
    'applies $name overrides before the initial agent and its handoffs execute',
    async ({ overrides, expectedModels, expectedSettings }) => {
      const modelProvider = new RecordingModelProvider();
      setDefaultModelProvider(modelProvider);

      const resolutionAgent = new Agent({
        name: 'Resolution Agent',
        instructions: 'Resolve escalations.',
        model: 'resolution-model',
        modelSettings: { temperature: 0.9, topP: 0.5 },
      });
      const escalationAgent = new Agent({
        name: 'Escalation Agent',
        instructions: 'Handle escalations.',
        model: 'handoff-model',
        modelSettings: { temperature: 0.8, topP: 0.4 },
        handoffs: [resolutionAgent],
      });
      const onHandoff = vi.fn();
      const supportAgent = new Agent({
        name: 'Support Agent',
        instructions: 'Hand off every request.',
        model: 'initial-model',
        modelSettings: { temperature: 0.7, topP: 0.3 },
        handoffs: [
          handoff(escalationAgent, {
            toolDescriptionOverride: 'Escalate this request.',
            onHandoff,
          }),
        ],
      });
      const provider = new OpenAiAgentsProvider('support-workflow', {
        config: {
          agent: supportAgent,
          ...overrides,
        },
      });

      await expect(provider.callApi('Please escalate this request.')).resolves.toMatchObject({
        output: 'Escalated successfully.',
      });
      expect(modelProvider.modelNames).toEqual(expectedModels);
      expect(modelProvider.model.requests).toHaveLength(3);
      expect(modelProvider.model.requests[0].handoffs[0].toolDescription).toBe(
        'Escalate this request.',
      );
      expect(onHandoff).toHaveBeenCalledTimes(1);
      expect(modelProvider.model.requests.map((request) => request.modelSettings)).toEqual(
        expectedSettings,
      );
    },
  );

  it.each([
    ['model', { model: 'override-model' }],
    ['model settings', { modelSettings: { temperature: 0.2 } }],
    ['model and model settings', { model: 'override-model', modelSettings: { temperature: 0.2 } }],
  ])('refreshes callback-updated handoff graphs with %s overrides', async (_name, overrides) => {
    const modelProvider = new RecordingModelProvider();
    setDefaultModelProvider(modelProvider);

    const resolutionAgent = new Agent({
      name: 'Resolution Agent',
      instructions: 'Original resolution instructions.',
      model: 'resolution-model',
      modelSettings: { temperature: 0.8 },
    });
    const staleDestination = new Agent({ name: 'Stale Destination' });
    const target = new Agent({
      name: 'Target',
      instructions: 'Original target instructions.',
      model: 'target-model',
      modelSettings: { temperature: 0.8 },
      handoffs: [staleDestination, resolutionAgent],
    });
    let transfer = 0;
    const onHandoff = vi.fn(async () => {
      transfer += 1;
      target.instructions = `Target instructions for transfer ${transfer}.`;
      target.tools = [
        tool({
          name: `transfer_tool_${transfer}`,
          description: 'Tool selected by the handoff callback.',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
          execute: async () => 'Tool result.',
        }),
      ];
      target.handoffs = [resolutionAgent, supportAgent];
      resolutionAgent.instructions = `Resolution instructions for transfer ${transfer}.`;
    });
    const supportAgent = new Agent({
      name: 'Support Agent',
      model: 'initial-model',
      modelSettings: { temperature: 0.8 },
      handoffs: [handoff(target, { onHandoff })],
    });
    // Both the initial graph and the callback's replacement graph contain a cycle.
    target.handoffs.push(supportAgent);
    const provider = new OpenAiAgentsProvider('support-workflow', {
      config: { agent: supportAgent, ...overrides },
    });

    for (const iteration of [1, 2]) {
      await expect(provider.callApi(`Escalate request ${iteration}.`)).resolves.toMatchObject({
        output: 'Escalated successfully.',
      });
      const requests = modelProvider.model.requests.slice((iteration - 1) * 3);
      expect(requests).toHaveLength(3);
      expect(requests[1].systemInstructions).toBe(`Target instructions for transfer ${iteration}.`);
      expect(requests[1].tools.map((candidate) => candidate.name)).toEqual([
        `transfer_tool_${iteration}`,
      ]);
      expect(requests[1].handoffs.map((candidate) => candidate.toolName)).toEqual([
        'transfer_to_resolution_agent',
        'transfer_to_support_agent',
      ]);
      expect(requests[2].systemInstructions).toBe(
        `Resolution instructions for transfer ${iteration}.`,
      );
      expect(modelProvider.modelNames.slice((iteration - 1) * 3)).toEqual(
        'model' in overrides
          ? ['override-model', 'override-model', 'override-model']
          : ['initial-model', 'target-model', 'resolution-model'],
      );
      expect(requests.map((request) => request.modelSettings)).toEqual(
        Array(3).fill('modelSettings' in overrides ? { temperature: 0.2 } : { temperature: 0.8 }),
      );
    }
    expect(onHandoff).toHaveBeenCalledTimes(2);
    expect(target.model).toBe('target-model');
    expect(target.modelSettings).toEqual({ temperature: 0.8 });
  });

  it.each([
    ['model', { model: 'override-model' }],
    ['model settings', { modelSettings: { temperature: 0.2 } }],
  ])(
    'preserves lifecycle listeners across recursive %s override cloning',
    async (_name, overrides) => {
      const modelProvider = new RecordingModelProvider();
      setDefaultModelProvider(modelProvider);

      const escalationStart = vi.fn();
      const resolutionStart = vi.fn();
      const resolutionEnd = vi.fn();
      const supportStart = vi.fn();
      const supportStartOnce = vi.fn();
      const supportHandoff = vi.fn();
      const resolutionAgent = new Agent({
        name: 'Resolution Agent',
        instructions: 'Resolve escalations.',
        model: 'resolution-model',
      });
      resolutionAgent.on('agent_start', resolutionStart);
      resolutionAgent.on('agent_end', resolutionEnd);

      const escalationAgent = new Agent({
        name: 'Escalation Agent',
        instructions: 'Handle escalations.',
        model: 'handoff-model',
        handoffs: [resolutionAgent],
      });
      escalationAgent.on('agent_start', escalationStart);

      const declaredHandoffAgent = new Agent({
        name: 'Declared Handoff Agent',
        instructions: 'Declare the model-facing handoff.',
      });
      const invokeDynamicHandoff = vi.fn(async () => escalationAgent);
      const supportAgent = new Agent({
        name: 'Support Agent',
        instructions: 'Hand off every request.',
        model: 'initial-model',
        handoffs: [new Handoff(declaredHandoffAgent, invokeDynamicHandoff)],
      });
      supportAgent.on('agent_start', supportStart);
      supportAgent.once('agent_start', supportStartOnce);
      supportAgent.on('agent_handoff', supportHandoff);
      // Exercise cycle-safe cloning without changing the first handoff selected by the test model.
      escalationAgent.handoffs.push(supportAgent);

      const provider = new OpenAiAgentsProvider('support-workflow', {
        config: {
          agent: supportAgent,
          ...overrides,
        },
      });

      await expect(provider.callApi('Please escalate this request.')).resolves.toMatchObject({
        output: 'Escalated successfully.',
      });
      await expect(provider.callApi('Please escalate this request again.')).resolves.toMatchObject({
        output: 'Escalated successfully.',
      });
      expect(supportStart).toHaveBeenCalledTimes(2);
      expect(supportStartOnce).toHaveBeenCalledTimes(1);
      expect(supportHandoff).toHaveBeenCalledTimes(2);
      expect(invokeDynamicHandoff).toHaveBeenCalledTimes(2);
      expect(escalationStart).toHaveBeenCalledTimes(2);
      expect(resolutionStart).toHaveBeenCalledTimes(2);
      expect(resolutionEnd).toHaveBeenCalledTimes(2);
    },
  );
});
