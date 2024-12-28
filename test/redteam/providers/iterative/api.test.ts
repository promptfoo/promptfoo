import {
  getRedteamResponse,
  checkIfOnTopic,
  getJudgeScore,
} from '../../../../src/redteam/providers/iterative/api';
import type { ApiProvider } from '../../../../src/types';

describe('Iterative API Functions', () => {
  const mockProvider: ApiProvider = {
    id: () => 'mock-provider',
    callApi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRedteamResponse', () => {
    it('should handle successful response', async () => {
      const mockResponse = {
        output: '{"improvement": "test", "prompt": "test prompt"}',
        tokenUsage: { total: 100 },
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getRedteamResponse(mockProvider, []);
      expect(result).toEqual(mockResponse);
    });

    it('should throw on provider error', async () => {
      jest.mocked(mockProvider.callApi).mockResolvedValue({ error: 'test error' });

      await expect(getRedteamResponse(mockProvider, [])).rejects.toThrow(
        'Error from redteam provider',
      );
    });
  });

  describe('checkIfOnTopic', () => {
    it('should parse on-topic response', async () => {
      jest.mocked(mockProvider.callApi).mockResolvedValue({
        output: '{"onTopic": true}',
        tokenUsage: { total: 100 },
      });

      const result = await checkIfOnTopic(mockProvider, 'system prompt', 'target prompt');
      expect(result).toEqual({
        isOnTopic: true,
        tokenUsage: { total: 100 },
      });
    });

    it('should handle parsing errors', async () => {
      jest.mocked(mockProvider.callApi).mockResolvedValue({
        output: 'invalid json',
      });

      const result = await checkIfOnTopic(mockProvider, 'system prompt', 'target prompt');
      expect(result).toEqual({
        isOnTopic: false,
        tokenUsage: undefined,
      });
    });
  });

  describe('getJudgeScore', () => {
    it('should parse judge response', async () => {
      jest.mocked(mockProvider.callApi).mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'good' },
          previousBestResponse: { rating: 7, explanation: 'ok' },
        }),
        tokenUsage: { total: 100 },
      });

      const result = await getJudgeScore(mockProvider, 'system prompt', 'current', 'best');
      expect(result).toEqual({
        currentScore: 8,
        previousScore: 7,
        explanation: 'good',
        tokenUsage: { total: 100 },
      });
    });

    it('should handle parsing errors', async () => {
      jest.mocked(mockProvider.callApi).mockResolvedValue({
        output: 'invalid json',
      });

      const result = await getJudgeScore(mockProvider, 'system prompt', 'current', 'best');
      expect(result).toEqual({
        currentScore: 1,
        previousScore: 0,
        explanation: '',
        tokenUsage: undefined,
      });
    });
  });
});
