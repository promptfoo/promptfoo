import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse } from '../../util/utils';

import type { MultiTurnPromptParams } from '../../../src/server/services/redteamTestCaseGenerationService';

async function getExpectedRemoteGenerationUrl() {
  const { getRemoteGenerationUrl } = await vi.importActual<
    typeof import('../../../src/redteam/remoteGeneration')
  >('../../../src/redteam/remoteGeneration');
  return getRemoteGenerationUrl();
}
const TEST_REQUEST_TIMEOUT_MS = 300000;
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
  vi.doMock('../../../src/redteam/remoteGeneration', async () => ({
    getRemoteGenerationUrl: vi.fn().mockReturnValue(await getExpectedRemoteGenerationUrl()),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
  }));
  vi.doMock('../../../src/providers/shared', () => ({
    getRequestTimeoutMs: () => TEST_REQUEST_TIMEOUT_MS,
  }));
  vi.doMock('../../../src/constants', () => ({
    VERSION: '0.0.0-test',
  }));

  return fetchWithRetries;
}

async function generatePromptForStrategy(
  strategyId: MultiTurnPromptParams['strategyId'],
  baseMetadata: Record<string, unknown> = { pluginConfig: {} },
) {
  const { generateMultiTurnPrompt } = await import(
    '../../../src/server/services/redteamTestCaseGenerationService'
  );

  return generateMultiTurnPrompt({
    pluginId: 'harmful:hate',
    strategyId,
    strategyConfigRecord: {},
    history: [],
    turn: 0,
    maxTurns: 5,
    baseMetadata,
    generatedPrompt: 'initial prompt',
    purpose: 'test purpose',
  });
}

async function expectTaskRequest(fetchWithRetries: ReturnType<typeof vi.fn>, expectedTask: string) {
  expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  const [url, request, timeout] = fetchWithRetries.mock.calls[0]!;
  const body = JSON.parse(String(request.body));

  expect(url).toBe(await getExpectedRemoteGenerationUrl());
  expect(request).toMatchObject({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(body.task).toBe(expectedTask);
  expect(timeout).toBe(TEST_REQUEST_TIMEOUT_MS);
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

      await expectTaskRequest(fetchWithRetries, 'goat');
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

      await expectTaskRequest(fetchWithRetries, 'crescendo');
    });

    it('should call fetchWithRetries with correct parameters for Hydra strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: { prompt: 'test prompt' },
      });

      await generatePromptForStrategy('jailbreak:hydra');

      await expectTaskRequest(fetchWithRetries, 'hydra-decision');
    });

    it('should call fetchWithRetries with correct parameters for Mischievous User strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: 'test prompt',
      });

      await generatePromptForStrategy('mischievous-user');

      await expectTaskRequest(fetchWithRetries, 'mischievous-user-redteam');
    });

    it.each([
      {
        strategyId: 'goat' as const,
        responseBody: {
          message: { content: 'goat prompt' },
          tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
        },
      },
      {
        strategyId: 'jailbreak:hydra' as const,
        responseBody: {
          result: { prompt: 'hydra prompt' },
          tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
        },
      },
      {
        strategyId: 'mischievous-user' as const,
        responseBody: {
          result: 'mischievous prompt',
          tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
        },
      },
    ])('should preserve $strategyId generation usage in metadata.providerTokenUsage', async ({
      strategyId,
      responseBody,
    }) => {
      mockRemoteGeneration(responseBody);

      const result = await generatePromptForStrategy(strategyId);

      expect(result.metadata.providerTokenUsage).toEqual(responseBody.tokenUsage);
    });

    it.each([
      {
        strategyId: 'goat' as const,
        responseBody: {
          message: { content: 'goat prompt' },
          tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
        },
        nestedKey: 'goat' as const,
      },
      {
        strategyId: 'jailbreak:hydra' as const,
        responseBody: {
          result: { prompt: 'hydra prompt' },
          tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
        },
        nestedKey: 'hydra' as const,
      },
      {
        strategyId: 'mischievous-user' as const,
        responseBody: {
          result: 'mischievous prompt',
          tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
        },
        nestedKey: 'mischievousUser' as const,
      },
    ])('should accumulate prior $strategyId generation usage across turns', async ({
      strategyId,
      responseBody,
      nestedKey,
    }) => {
      mockRemoteGeneration(responseBody);

      const result = await generatePromptForStrategy(strategyId, {
        pluginConfig: {},
        providerTokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
        [nestedKey]: {
          tokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
        },
      });

      expect(result.metadata.providerTokenUsage).toEqual({
        total: responseBody.tokenUsage.total + 5,
        prompt: responseBody.tokenUsage.prompt + 3,
        completion: responseBody.tokenUsage.completion + 2,
        cached: 0,
        numRequests: 2,
      });
      expect((result.metadata[nestedKey] as { tokenUsage: unknown }).tokenUsage).toEqual({
        total: responseBody.tokenUsage.total + 5,
        prompt: responseBody.tokenUsage.prompt + 3,
        completion: responseBody.tokenUsage.completion + 2,
        cached: 0,
        numRequests: 2,
      });
    });

    it.each([
      'crescendo',
      'custom',
    ] as const)('should accumulate prior %s generation usage across turns', async (strategyId) => {
      mockRemoteGeneration({
        result: {
          generatedQuestion: 'test question',
          lastResponseSummary: 'summary',
          rationaleBehindJailbreak: 'rationale',
        },
        tokenUsage: { total: 19, prompt: 12, completion: 7, numRequests: 1 },
      });

      const result = await generatePromptForStrategy(strategyId, {
        pluginConfig: {},
        providerTokenUsage: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
      });

      expect(result.metadata.providerTokenUsage).toEqual({
        total: 24,
        prompt: 15,
        completion: 9,
        cached: 0,
        numRequests: 2,
      });
    });
  });
});
