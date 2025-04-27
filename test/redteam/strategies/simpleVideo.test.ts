import { addVideoToBase64, textToVideo } from '../../../src/redteam/strategies/simpleVideo';
import { getEnvString } from '../../../src/envars';

// Mock environment for tests
jest.mock('../../../src/envars', () => ({
  getEnvString: jest.fn(),
}));

describe('simpleVideo', () => {
  beforeEach(() => {
    // Mock NODE_ENV as test to avoid actual ffmpeg operations
    (getEnvString as jest.Mock).mockImplementation((key) => {
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('textToVideo', () => {
    it('returns a base64 string in test environment', async () => {
      const result = await textToVideo('test text');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('addVideoToBase64', () => {
    it('processes test cases correctly', async () => {
      const testCases = [
        {
          vars: {
            prompt: 'test prompt',
          },
        },
      ];

      const result = await addVideoToBase64(testCases, 'prompt');
      
      expect(result).toHaveLength(1);
      expect(result[0].vars?.prompt).toBeDefined();
      expect(typeof result[0].vars?.prompt).toBe('string');
      expect(result[0].vars?.video_text).toBe('test prompt');
      expect(result[0].metadata?.strategyId).toBe('video');
    });

    it('throws an error if vars is missing', async () => {
      const testCases = [{}];
      
      await expect(addVideoToBase64(testCases, 'prompt')).rejects.toThrow();
    });
  });
});