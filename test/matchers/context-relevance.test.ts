import { matchesContextRelevance } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

jest.mock('../../src/database', () => ({
  getDb: jest.fn().mockImplementation(() => {
    throw new TypeError('The "original" argument must be of type function. Received undefined');
  }),
}));
jest.mock('../../src/esm');
jest.mock('../../src/cliState');
jest.mock('../../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(true),
}));
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('better-sqlite3');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

describe('matchesContextRelevance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Reset DefaultGradingProvider mock to prevent contamination
    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foo\nbar\nbaz Insufficient Information\n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when the relevance score is above the threshold', async () => {
    const input = 'Input text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'foo\nbar\nbaz Insufficient Information\n',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Relevance 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should fail when the relevance score is below the threshold', async () => {
    const input = 'Input text';
    const context = 'Context text';
    const threshold = 0.9;

    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'foo\nbar\nbaz Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Relevance 0.67 is < 0.9',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });
});
