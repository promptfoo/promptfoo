import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentWorkspace } from '../../src/providers/agentWorkspace';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('keeps reserved output and rubric vars ahead of user vars', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');

    await matchesAgentRubric(
      'rubric from assertion',
      'output from provider',
      { rubricPrompt: 'output={{ output }}\nrubric={{ rubric }}\nextra={{ extra }}' },
      {
        output: 'vars output sentinel',
        rubric: 'vars rubric sentinel',
        extra: 'kept user var',
      },
    );

    const callApiMock = vi.mocked(mocks.codexProvider.callApi);
    const [prompt, callApiContext] = callApiMock.mock.calls[0];
    expect(prompt).toContain('output=output from provider');
    expect(prompt).toContain('rubric=rubric from assertion');
    expect(prompt).toContain('extra=kept user var');
    expect(prompt).not.toContain('vars output sentinel');
    expect(prompt).not.toContain('vars rubric sentinel');
    expect(callApiContext?.vars).toMatchObject({
      output: 'output from provider',
      rubric: 'rubric from assertion',
      extra: 'kept user var',
    });
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

  it.each(['openai:codex-security', 'openai:codex-security:gpt-5.6-sol'])(
    'rejects %s as a rubric grader instead of treating scan findings as a passing verdict',
    async (providerId) => {
      const { matchesAgentRubric } = await import('../../src/matchers/agent');
      const securityProvider = {
        id: () => providerId,
        callApi: vi.fn(async () => ({ output: JSON.stringify({ findings: [] }) })),
      } as ApiProvider;
      mocks.loadApiProvider.mockResolvedValue(securityProvider);

      await expect(
        matchesAgentRubric('Inspect the artifact', 'done', { provider: providerId }),
      ).rejects.toThrow('agent-rubric assertion requires an agentic grading provider');

      expect(securityProvider.callApi).not.toHaveBeenCalled();
      expect(mocks.codexProvider.callApi).not.toHaveBeenCalled();
    },
  );

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
  it('grades inside the workspace that the output came from', async () => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rubric-fixture-'));
    fs.writeFileSync(path.join(source, 'file.txt'), 'content');
    const workspace = await createAgentWorkspace(source, 'copy');
    try {
      await matchesAgentRubric(
        'Check the file',
        'Done',
        {},
        {},
        undefined,
        undefined,
        workspace.dir,
      );
    } finally {
      await workspace.remove();
      fs.rmSync(source, { recursive: true, force: true });
    }

    expect(mocks.codexProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        prompt: expect.objectContaining({ config: { working_dir: workspace.dir } }),
      }),
    );
  });

  it.each([
    ['a directory the target reported', os.tmpdir()],
    ['a non-string value', { dir: os.tmpdir() }],
  ])('does not grade in %s', async (_label, workingDir) => {
    const { matchesAgentRubric } = await import('../../src/matchers/agent');

    await matchesAgentRubric('Check the file', 'Done', {}, {}, undefined, undefined, workingDir);

    const [, context] = vi.mocked(mocks.codexProvider.callApi).mock.calls[0];
    expect(context?.prompt).not.toHaveProperty('config');
  });

  it.each(['deleted', 'replaced', 'replaced ancestor'])(
    'fails grading when the target workspace was %s',
    async (change) => {
      if (process.platform === 'win32') {
        return;
      }
      const { matchesAgentRubric } = await import('../../src/matchers/agent');
      const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rubric-fixture-'));
      fs.writeFileSync(path.join(source, 'passing.txt'), 'original evidence');
      const workspace = await createAgentWorkspace(source, 'copy');
      const grader: ApiProvider = {
        id: () => 'anthropic:claude-agent-sdk',
        config: { working_dir: source },
        callApi: vi.fn(async () => ({
          output: '{"pass":true,"score":1,"reason":"source exists"}',
        })),
      };
      mocks.loadApiProvider.mockResolvedValue(grader);
      const parent = path.dirname(workspace.dir);
      try {
        if (change === 'replaced ancestor') {
          fs.renameSync(parent, `${parent}-moved`);
          fs.symlinkSync(`${parent}-moved`, parent);
        } else {
          fs.rmSync(workspace.dir, { recursive: true });
          if (change === 'replaced') {
            fs.symlinkSync(source, workspace.dir);
          }
        }
        await expect(
          matchesAgentRubric(
            'Check passing.txt',
            'Done',
            { provider: 'anthropic:claude-agent-sdk' },
            {},
            undefined,
            undefined,
            workspace.dir,
          ),
        ).rejects.toThrow('workspace is no longer available');
        expect(grader.callApi).not.toHaveBeenCalled();
      } finally {
        if (change === 'replaced ancestor') {
          fs.unlinkSync(parent);
          fs.renameSync(`${parent}-moved`, parent);
        }
        await workspace.remove();
        fs.rmSync(source, { recursive: true, force: true });
      }
    },
  );
});
