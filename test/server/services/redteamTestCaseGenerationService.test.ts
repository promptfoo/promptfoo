import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse } from '../../util/utils';

import type { MultiTurnPromptParams } from '../../../src/server/services/redteamTestCaseGenerationService';

const REMOTE_GENERATION_URL = 'https://api.promptfoo.app/api/v1/task';
const REQUEST_TIMEOUT_MS = 300000;
const MOCKED_MODULES = [
  '../../../src/util/fetch/index',
  '../../../src/redteam/remoteGeneration',
  '../../../src/providers/shared',
  '../../../src/constants',
];

function mockRemoteGeneration(responseBody: unknown, rejectWith?: Error) {
  const fetchWithRetries = rejectWith
    ? vi.fn().mockRejectedValueOnce(rejectWith)
    : vi.fn().mockResolvedValueOnce(
        createMockResponse({
          body: responseBody,
        }),
      );

  vi.doMock('../../../src/util/fetch/index', () => ({
    fetchWithRetries,
  }));
  vi.doMock('../../../src/redteam/remoteGeneration', () => ({
    getRemoteGenerationUrl: vi.fn().mockReturnValue(REMOTE_GENERATION_URL),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
  }));
  vi.doMock('../../../src/providers/shared', () => ({
    REQUEST_TIMEOUT_MS,
  }));
  vi.doMock('../../../src/constants', () => ({
    VERSION: '0.0.0-test',
  }));

  return fetchWithRetries;
}

async function generatePromptForStrategy(strategyId: MultiTurnPromptParams['strategyId']) {
  const { generateMultiTurnPrompt } = await import(
    '../../../src/server/services/redteamTestCaseGenerationService'
  );

  await generateMultiTurnPrompt({
    pluginId: 'harmful:hate',
    strategyId,
    strategyConfigRecord: {},
    history: [],
    turn: 0,
    maxTurns: 5,
    baseMetadata: { pluginConfig: {} },
    generatedPrompt: 'initial prompt',
    purpose: 'test purpose',
  });
}

function expectTaskRequest(fetchWithRetries: ReturnType<typeof vi.fn>, expectedTask: string) {
  expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  const [url, request, timeout] = fetchWithRetries.mock.calls[0]!;
  const body = JSON.parse(String(request.body));

  expect(url).toBe(REMOTE_GENERATION_URL);
  expect(request).toMatchObject({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(body.task).toBe(expectedTask);
  expect(timeout).toBe(REQUEST_TIMEOUT_MS);
}

describe('redteamTestCaseGenerationService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
    for (const modulePath of MOCKED_MODULES) {
      vi.doUnmock(modulePath);
    }
    vi.resetModules();
  });

  describe('multi-turn strategy handlers use fetchWithRetries', () => {
    it('should call fetchWithRetries with correct parameters for GOAT strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        message: { content: 'test prompt' },
        tokenUsage: { total: 100 },
      });

      await generatePromptForStrategy('goat');

      expectTaskRequest(fetchWithRetries, 'goat');
    });

    it('should propagate remote generation failures', async () => {
      const remoteError = new Error('remote generation failed');
      const fetchWithRetries = mockRemoteGeneration(undefined, remoteError);

      await expect(generatePromptForStrategy('goat')).rejects.toThrow('remote generation failed');
      expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should call fetchWithRetries with correct parameters for Crescendo strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: {
          generatedQuestion: 'test question',
          lastResponseSummary: 'summary',
          rationaleBehindJailbreak: 'rationale',
        },
      });

      await generatePromptForStrategy('crescendo');

      expectTaskRequest(fetchWithRetries, 'crescendo');
    });

    it('should call fetchWithRetries with correct parameters for Hydra strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: { prompt: 'test prompt' },
      });

      await generatePromptForStrategy('jailbreak:hydra');

      expectTaskRequest(fetchWithRetries, 'hydra-decision');
    });

    it('should call fetchWithRetries with correct parameters for Mischievous User strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: 'test prompt',
      });

      await generatePromptForStrategy('mischievous-user');

      expectTaskRequest(fetchWithRetries, 'mischievous-user-redteam');
    });
  });
});
