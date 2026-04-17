import { beforeEach, describe, expect, it, vi } from 'vitest';

// Helper to create mock Response
function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as Response;
}

describe('redteamTestCaseGenerationService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('multi-turn strategy handlers use fetchWithRetries', () => {
    it('should call fetchWithRetries with correct parameters for GOAT strategy', async () => {
      // Re-setup mocks after module reset
      const mockFetchWithRetries = vi.fn();
      vi.doMock('../../../src/util/fetch/index', () => ({
        fetchWithRetries: mockFetchWithRetries,
      }));
      vi.doMock('../../../src/redteam/remoteGeneration', () => ({
        getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
        neverGenerateRemote: vi.fn().mockReturnValue(false),
      }));
      vi.doMock('../../../src/providers/shared', () => ({
        REQUEST_TIMEOUT_MS: 300000,
      }));
      vi.doMock('../../../src/constants', () => ({
        VERSION: '0.0.0-test',
      }));

      const mockResponse = createMockResponse({
        message: { content: 'test prompt' },
        tokenUsage: { total: 100 },
      });
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const { generateMultiTurnPrompt } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      await generateMultiTurnPrompt({
        pluginId: 'harmful:hate',
        strategyId: 'goat',
        strategyConfigRecord: {},
        history: [],
        turn: 0,
        maxTurns: 5,
        baseMetadata: { pluginConfig: {} },
        generatedPrompt: 'initial prompt',
        purpose: 'test purpose',
      });

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/v1/task',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"task":"goat"'),
        }),
        300000,
      );
    });

    it('should call fetchWithRetries with correct parameters for Crescendo strategy', async () => {
      const mockFetchWithRetries = vi.fn();
      vi.doMock('../../../src/util/fetch/index', () => ({
        fetchWithRetries: mockFetchWithRetries,
      }));
      vi.doMock('../../../src/redteam/remoteGeneration', () => ({
        getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
        neverGenerateRemote: vi.fn().mockReturnValue(false),
      }));
      vi.doMock('../../../src/providers/shared', () => ({
        REQUEST_TIMEOUT_MS: 300000,
      }));
      vi.doMock('../../../src/constants', () => ({
        VERSION: '0.0.0-test',
      }));

      const mockResponse = createMockResponse({
        result: {
          generatedQuestion: 'test question',
          lastResponseSummary: 'summary',
          rationaleBehindJailbreak: 'rationale',
        },
      });
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const { generateMultiTurnPrompt } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      await generateMultiTurnPrompt({
        pluginId: 'harmful:hate',
        strategyId: 'crescendo',
        strategyConfigRecord: {},
        history: [],
        turn: 0,
        maxTurns: 5,
        baseMetadata: { pluginConfig: {} },
        generatedPrompt: 'initial prompt',
        purpose: 'test purpose',
      });

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/v1/task',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"task":"crescendo"'),
        }),
        300000,
      );
    });

    it('should call fetchWithRetries with correct parameters for Hydra strategy', async () => {
      const mockFetchWithRetries = vi.fn();
      vi.doMock('../../../src/util/fetch/index', () => ({
        fetchWithRetries: mockFetchWithRetries,
      }));
      vi.doMock('../../../src/redteam/remoteGeneration', () => ({
        getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
        neverGenerateRemote: vi.fn().mockReturnValue(false),
      }));
      vi.doMock('../../../src/providers/shared', () => ({
        REQUEST_TIMEOUT_MS: 300000,
      }));
      vi.doMock('../../../src/constants', () => ({
        VERSION: '0.0.0-test',
      }));

      const mockResponse = createMockResponse({
        result: { prompt: 'test prompt' },
      });
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const { generateMultiTurnPrompt } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      await generateMultiTurnPrompt({
        pluginId: 'harmful:hate',
        strategyId: 'jailbreak:hydra',
        strategyConfigRecord: {},
        history: [],
        turn: 0,
        maxTurns: 5,
        baseMetadata: { pluginConfig: {} },
        generatedPrompt: 'initial prompt',
        purpose: 'test purpose',
      });

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/v1/task',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"task":"hydra-decision"'),
        }),
        300000,
      );
    });

    it('should call fetchWithRetries with correct parameters for Mischievous User strategy', async () => {
      const mockFetchWithRetries = vi.fn();
      vi.doMock('../../../src/util/fetch/index', () => ({
        fetchWithRetries: mockFetchWithRetries,
      }));
      vi.doMock('../../../src/redteam/remoteGeneration', () => ({
        getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
        neverGenerateRemote: vi.fn().mockReturnValue(false),
      }));
      vi.doMock('../../../src/providers/shared', () => ({
        REQUEST_TIMEOUT_MS: 300000,
      }));
      vi.doMock('../../../src/constants', () => ({
        VERSION: '0.0.0-test',
      }));

      const mockResponse = createMockResponse({
        result: 'test prompt',
      });
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const { generateMultiTurnPrompt } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      await generateMultiTurnPrompt({
        pluginId: 'harmful:hate',
        strategyId: 'mischievous-user',
        strategyConfigRecord: {},
        history: [],
        turn: 0,
        maxTurns: 5,
        baseMetadata: { pluginConfig: {} },
        generatedPrompt: 'initial prompt',
        purpose: 'test purpose',
      });

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/v1/task',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"task":"mischievous-user-redteam"'),
        }),
        300000,
      );
    });
  });
});
