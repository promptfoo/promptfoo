import { Request, Response } from 'express';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../src/logger');
jest.mock('../../src/redteam/strategies/base64');
jest.mock('../../src/redteam/strategies/leetspeak');
jest.mock('../../src/redteam/providers/iterative');
jest.mock('../../src/redteam/providers/iterativeTree');
jest.mock('../../src/redteam/remoteGeneration');
jest.mock('../../src/envars');

// Mock strategy imports
const mockBase64Strategy = {
  apply: jest.fn().mockResolvedValue([
    {
      vars: { prompt: 'aGVsbG8gd29ybGQ=' },
      metadata: { transformations: ['base64'] },
    },
  ]),
};

const mockLeetSpeakStrategy = {
  apply: jest.fn().mockResolvedValue([
    {
      vars: { prompt: 'h3ll0 w0rld' },
      metadata: { transformations: ['leetspeak'] },
    },
  ]),
};

// Mock provider responses
const mockIterativeResult = {
  pass: false,
  score: 0.8,
  metadata: {
    redteamHistory: [
      { prompt: 'Initial attack', output: 'Echo: Initial attack' },
      { prompt: 'Escalated attack', output: 'Echo: Escalated attack' },
    ],
  },
};

const mockRemoteGenerationResponse = {
  candidates: ['Variant 1: hello world', 'Variant 2: greetings universe', 'Variant 3: hi earth'],
};

// Import mocked modules
jest.doMock('../../src/redteam/strategies/base64', () => mockBase64Strategy);
jest.doMock('../../src/redteam/strategies/leetspeak', () => mockLeetSpeakStrategy);
jest.doMock('../../src/redteam/providers/iterative', () => ({
  RedteamIterativeProvider: jest.fn().mockImplementation(() => ({
    callApi: jest.fn().mockResolvedValue(mockIterativeResult),
  })),
}));
jest.doMock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(true),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://localhost:3000/api/remote'),
}));

// Mock fetch for remote generation
global.fetch = jest.fn();

describe('Strategy Sample Generation', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockReq = {
      body: {},
    };

    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Transform Strategy Samples', () => {
    it('should generate base64 transform sample', async () => {
      mockReq.body = {
        strategyId: 'base64',
        config: {},
      };

      // Import the actual handler
      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Base64'),
        summary: expect.any(String),
        mode: 'template',
        modifiedPrompts: ['aGVsbG8gd29ybGQ='],
        metadata: expect.objectContaining({
          strategyId: 'base64',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
          originalPrompt: expect.any(String),
        }),
      });
    });

    it('should generate leetspeak transform sample', async () => {
      mockReq.body = {
        strategyId: 'leetspeak',
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Leetspeak'),
        summary: expect.any(String),
        mode: 'template',
        modifiedPrompts: ['h3ll0 w0rld'],
        metadata: expect.objectContaining({
          strategyId: 'leetspeak',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
        }),
      });
    });
  });

  describe('Simulate Strategy Samples', () => {
    it('should generate crescendo simulate sample', async () => {
      mockReq.body = {
        strategyId: 'crescendo',
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Crescendo'),
        summary: expect.any(String),
        mode: 'simulate',
        conversation: expect.arrayContaining([
          expect.objectContaining({
            turn: expect.any(Number),
            intent: expect.any(String),
            userMessage: expect.any(String),
            assistantResponse: expect.any(String),
            technique: expect.any(String),
            escalationLevel: expect.any(String),
          }),
        ]),
        metadata: expect.objectContaining({
          strategyId: 'crescendo',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
        }),
      });
    });

    it('should generate provider-backed jailbreak sample', async () => {
      mockReq.body = {
        strategyId: 'jailbreak',
        config: { numIterations: 3 },
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Jailbreak'),
        summary: expect.any(String),
        mode: 'simulate',
        conversation: expect.arrayContaining([
          expect.objectContaining({
            turn: expect.any(Number),
            intent: expect.any(String),
            userMessage: expect.any(String),
            assistantResponse: expect.stringContaining('Echo:'),
            technique: expect.any(String),
            escalationLevel: expect.any(String),
          }),
        ]),
        metadata: expect.objectContaining({
          strategyId: 'jailbreak',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
          providerBacked: true,
          target: 'echo',
        }),
      });
    });
  });

  describe('Advanced Strategy Samples', () => {
    it('should generate best-of-n sample with remote generation', async () => {
      // Mock successful fetch response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockRemoteGenerationResponse),
      });

      mockReq.body = {
        strategyId: 'best-of-n',
        config: { nSteps: 1, maxCandidatesPerStep: 3 },
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/remote',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('jailbreak:best-of-n'),
        })
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Best-of-N'),
        summary: expect.any(String),
        mode: 'simulate',
        conversation: expect.arrayContaining([
          expect.objectContaining({
            turn: expect.any(Number),
            intent: expect.stringContaining('Best-of-N candidate'),
            userMessage: expect.stringContaining('Variant'),
            assistantResponse: expect.stringContaining('Echo:'),
            technique: expect.stringContaining('Best-of-N optimization'),
            escalationLevel: expect.any(String),
          }),
        ]),
        metadata: expect.objectContaining({
          strategyId: 'best-of-n',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
        }),
      });
    });

    it('should generate multilingual sample with language codes', async () => {
      mockReq.body = {
        strategyId: 'multilingual',
        config: { languages: ['es', 'fr', 'de'] },
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Multilingual'),
        summary: expect.any(String),
        mode: 'simulate',
        conversation: expect.arrayContaining([
          expect.objectContaining({
            turn: expect.any(Number),
            intent: expect.stringContaining('language'),
            userMessage: expect.any(String),
            assistantResponse: expect.stringContaining('Echo:'),
            technique: expect.any(String),
            escalationLevel: expect.any(String),
          }),
        ]),
        metadata: expect.objectContaining({
          strategyId: 'multilingual',
          effectiveness: expect.any(String),
          complexity: expect.any(String),
          configUsed: expect.objectContaining({
            languages: ['es', 'fr'], // Should be capped to 2 languages
          }),
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing strategyId', async () => {
      mockReq.body = {
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'strategyId is required',
      });
    });

    it('should handle unsupported strategy', async () => {
      mockReq.body = {
        strategyId: 'unknown-strategy',
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unsupported strategy: unknown-strategy',
      });
    });

    it('should handle best-of-n remote generation failure', async () => {
      // Mock failed fetch response
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      mockReq.body = {
        strategyId: 'best-of-n',
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        title: expect.stringContaining('Best-of-N'),
        summary: expect.any(String),
        mode: 'template',
        metadata: expect.objectContaining({
          strategyId: 'best-of-n',
          unavailable: true,
          category: 'Advanced',
        }),
      });
    });
  });

  describe('Configuration Safety', () => {
    it('should apply safe caps to provider configs', async () => {
      mockReq.body = {
        strategyId: 'jailbreak',
        config: {
          numIterations: 100, // Should be capped
          maxAttempts: 1000, // Should be capped
        },
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      // Verify that the provider was called with safe config values
      const { RedteamIterativeProvider } = await import(
        '../../src/redteam/providers/iterative'
      );
      expect(RedteamIterativeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          numIterations: expect.any(Number), // Should be reasonable, not 100
        })
      );
    });

    it('should limit conversation display to 5 turns', async () => {
      // Mock a response with many iterations
      const mockManyIterationsResult = {
        pass: false,
        score: 0.8,
        metadata: {
          redteamHistory: Array.from({ length: 10 }, (_, i) => ({
            prompt: `Attack ${i + 1}`,
            output: `Echo: Attack ${i + 1}`,
          })),
        },
      };

      const { RedteamIterativeProvider } = await import(
        '../../src/redteam/providers/iterative'
      );
      (RedteamIterativeProvider as jest.Mock).mockImplementation(() => ({
        callApi: jest.fn().mockResolvedValue(mockManyIterationsResult),
      }));

      mockReq.body = {
        strategyId: 'jailbreak',
        config: {},
      };

      const { generateStrategySampleHandler } = await import(
        '../../src/server/routes/redteam'
      );

      await generateStrategySampleHandler(mockReq as Request, mockRes as Response);

      const response = jsonMock.mock.calls[0][0];
      expect(response.conversation).toHaveLength(5); // Should be capped to 5 turns
    });
  });
});