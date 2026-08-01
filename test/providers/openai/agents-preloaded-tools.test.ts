import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@openai/agents';

describe('OpenAiAgentsProvider preloaded agent tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies provider overrides to agent tools created before the provider loads', async () => {
    const agents = await import('@openai/agents');
    const childAgent = new agents.Agent({
      name: 'Child Agent',
      instructions: 'Handle delegated work.',
      model: 'gpt-5.4-mini',
      modelSettings: { temperature: 0.9 },
    });
    const childTool = childAgent.asTool({ toolName: 'delegate_to_child' });

    const { OpenAiAgentsProvider } = await import('../../../src/providers/openai/agents');
    const executedAgents: Agent<any, any>[] = [];
    const executedSettings: Array<Pick<Agent<any, any>, 'model' | 'modelSettings'>> = [];
    vi.spyOn(agents.Runner.prototype, 'run').mockImplementation(async (agent: any) => {
      executedAgents.push(agent);
      executedSettings.push({ model: agent.model, modelSettings: agent.modelSettings });
      return {
        finalOutput: 'Agent answer',
        usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
        newItems: [],
      } as any;
    });

    const provider = new OpenAiAgentsProvider('support-agent', {
      config: {
        agent: new agents.Agent({
          name: 'Root Agent',
          instructions: 'Delegate work.',
          tools: [childTool],
        }),
        model: 'gpt-5.6-terra',
        modelSettings: { temperature: 0.2 },
      },
    });

    await provider.callApi('Delegate this request.');
    expect(executedAgents[0].tools[0]).not.toBe(childTool);
    await (executedAgents[0].tools[0] as any).invoke({}, JSON.stringify({ input: 'Do the work.' }));

    expect(executedSettings[1]).toMatchObject({
      model: 'gpt-5.6-terra',
      modelSettings: { temperature: 0.2 },
    });
    expect(childAgent).toMatchObject({
      model: 'gpt-5.4-mini',
      modelSettings: { temperature: 0.9 },
    });
  });
});
