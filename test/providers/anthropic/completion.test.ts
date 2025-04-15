import { clearCache, disableCache } from '../../../src/cache';
import { AnthropicCompletionProvider } from '../../../src/providers/anthropic/completion';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('AnthropicCompletionProvider', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('callApi', () => {
    it('should return output for default behavior', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return cached output with caching enabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
      expect(cachedResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return fresh output with caching disabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();

      disableCache();

      const freshResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(freshResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest
        .spyOn(provider.anthropic.completions, 'create')
        .mockImplementation()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('Test prompt');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });
  });
});
