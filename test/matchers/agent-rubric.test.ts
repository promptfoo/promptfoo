import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

const mocks = vi.hoisted(() => {
  const createProvider = (id: string): ApiProvider =>
    ({
      id: () => id,
      config: {},
      callApi: vi.fn(
        async (): Promise<ProviderResponse> => ({
          output: JSON.stringify({ pass: true, score: 1, reason: 'agent verified evidence' }),
          metadata: { toolCalls: [{ name: 'read_file' }] },
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        }),
      ),
    }) as ApiProvider;

  const codexProvider = createProvider('openai:codex-sdk');
  const claudeProvider = createProvider('anthropic:claude-agent-sdk');
  const textProvider = createProvider('openai:responses:gpt-5.5');

  return {
    claudeProvider,
    codexProvider,
    getCodexDefaultProviders: vi.fn(),
    getDefaultProviders: vi.fn(),
    loadApiProvider: vi.fn(),
    textProvider,
  };
});

vi.mock('../../src/providers/openai/codexDefaults', () => ({
  getCodexDefaultProviders: mocks.getCodexDefaultProviders,
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: mocks.getDefaultProviders,
}));

vi.mock('../../src/providers/index', () => ({
  loadApiProvider: mocks.loadApiProvider,
}));

describe('matchesAgentRubric', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const agentResponse = async (): Promise<ProviderResponse> => ({
      output: JSON.stringify({ pass: true, score: 1, reason: 'agent verified evidence' }),
      metadata: { toolCalls: [{ name: 'read_file' }] },
      tokenUsage: { total: 5, prompt: 3, completion: 2 },
    });
    mocks.codexProvider.callApi = vi.fn(agentResponse) as ApiProvider['callApi'];
    mocks.claudeProvider.callApi = vi.fn(agentResponse) as ApiProvider['callApi'];
    mocks.textProvider.callApi = vi.fn(agentResponse) as ApiProvider['callApi'];
    mocks.getCodexDefaultProviders.mockReturnValue({
      llmRubricProvider: mocks.codexProvider,
    });
    mocks.getDefaultProviders.mockResolvedValue({
      gradingJsonProvider: mocks.codexProvider,
      llmRubricProvider: mocks.codexProvider,
    });
    mocks.loadApiProvider.mockResolvedValue(mocks.claudeProvider);
  });

  it('uses the isolated Codex default provider when none is configured', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');

    const result = await matchesAgentRubric('Verify the claimed file exists', 'It exists', {});

    expect(mocks.getCodexDefaultProviders).toHaveBeenCalledTimes(1);
    expect(mocks.codexProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mocks.codexProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('untrusted evidence'),
      expect.objectContaining({
        prompt: expect.objectContaining({ label: 'agent-rubric' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 1,
        metadata: expect.objectContaining({
          agentProvider: 'openai:codex-sdk',
          toolCalls: [{ name: 'read_file' }],
        }),
      }),
    );
  });

  it('accepts an explicitly configured agent runtime', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');

    const result = await matchesAgentRubric('Inspect the artifact', 'done', {
      provider: 'anthropic:claude-agent-sdk',
    });

    expect(mocks.loadApiProvider).toHaveBeenCalledWith('anthropic:claude-agent-sdk', {
      basePath: undefined,
    });
    expect(mocks.claudeProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.metadata).toEqual(
      expect.objectContaining({ agentProvider: 'anthropic:claude-agent-sdk' }),
    );
  });

  it('rejects an explicitly configured plain text grader instead of falling back', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');
    mocks.loadApiProvider.mockResolvedValue(mocks.textProvider);

    await expect(
      matchesAgentRubric('Inspect the artifact', 'done', {
        provider: 'openai:responses:gpt-5.5',
      }),
    ).rejects.toThrow('agent-rubric assertion requires an agentic grading provider');

    expect(mocks.codexProvider.callApi).not.toHaveBeenCalled();
    expect(mocks.textProvider.callApi).not.toHaveBeenCalled();
  });

  it('applies llm-rubric threshold semantics to agent results', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');
    mocks.codexProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({
        output: JSON.stringify({ pass: true, score: 0.4, reason: 'partial evidence' }),
      }),
    ) as ApiProvider['callApi'];

    await expect(
      matchesAgentRubric(
        'Verify evidence',
        'done',
        {},
        {},
        { type: 'agent-rubric', value: 'Verify evidence', threshold: 0.5 },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.4,
        reason: 'partial evidence',
      }),
    );
  });
});
