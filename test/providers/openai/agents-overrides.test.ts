import { Agent, handoff, OpenAIProvider, setDefaultModelProvider, Usage } from '@openai/agents';
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

describe('OpenAiAgentsProvider execution overrides', () => {
  afterEach(() => {
    setDefaultModelProvider(new OpenAIProvider({ cacheResponsesWebSocketModels: false }));
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
  ])('applies $name overrides before the initial agent and its handoffs execute', async ({
    overrides,
    expectedModels,
    expectedSettings,
  }) => {
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
  });
});
