import cliState from '../../src/cliState';
import { matchesResearchRubric } from '../../src/matchers';
import type { ApiProvider, Assertion, GradingConfig } from '../../src/types';
import * as providers from '../../src/providers';
import * as remoteGrading from '../../src/remoteGrading';
import { getDefaultProviders } from '../../src/providers/defaults';

jest.mock('../../src/cliState');
jest.mock('../../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));
jest.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn(),
}));

const mockGetDefaultProviders = jest.mocked(getDefaultProviders);
const mockLoadApiProvider = jest.mocked(providers.loadApiProvider);
const mockDoRemoteGrading = jest.mocked(remoteGrading.doRemoteGrading);

describe('matchesResearchRubric', () => {
  const createMockProvider = (config?: any): ApiProvider => ({
    id: jest.fn().mockReturnValue('mock-provider'),
    callApi: jest.fn(),
    config,
  });

  const createMockWebSearchProvider = (id: string, response: any): ApiProvider => {
    const provider = createMockProvider();
    (provider.id as jest.Mock).mockReturnValue(id);
    (provider.callApi as jest.Mock).mockResolvedValue({
      output: JSON.stringify(response),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    return provider;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (cliState as any).config = {};

    // Set up default providers mock
    mockGetDefaultProviders.mockResolvedValue({
      embeddingProvider: createMockProvider(),
      gradingJsonProvider: createMockProvider(),
      gradingProvider: createMockProvider(),
      moderationProvider: createMockProvider(),
      suggestionsProvider: createMockProvider(),
      synthesizeProvider: createMockProvider(),
    });

    mockDoRemoteGrading.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Remote grading passed',
    });
  });

  describe('Provider Web Search Capability Detection', () => {
    it('should detect Perplexity as having web search', async () => {
      const perplexityProvider = createMockWebSearchProvider('perplexity:sonar', {
        pass: true,
        score: 1,
        reason: 'Verified',
        verifiedClaims: ['Claim 1'],
        failedClaims: [],
      });

      const grading: GradingConfig = {
        provider: perplexityProvider,
      };

      const result = await matchesResearchRubric('Verify this claim', 'The sky is blue', grading);

      expect(result.pass).toBe(true);
      expect(result.metadata?.hasWebSearch).toBe(true);
      expect(perplexityProvider.callApi).toHaveBeenCalled();
    });

    it('should detect Google/Gemini with search tools', async () => {
      const googleProvider = createMockProvider({
        tools: [{ googleSearch: {} }],
      });
      (googleProvider.id as jest.Mock).mockReturnValue('google:gemini-2.0-flash');
      (googleProvider.callApi as jest.Mock).mockResolvedValue({
        output: JSON.stringify({
          pass: true,
          score: 0.9,
          reason: 'Verified with Google search',
          verifiedClaims: ['Temperature is 72°F'],
          failedClaims: [],
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      const grading: GradingConfig = {
        provider: googleProvider,
      };

      const result = await matchesResearchRubric(
        'Temperature must be accurate',
        'The temperature is 72°F',
        grading,
      );

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.9);
      expect(result.metadata?.hasWebSearch).toBe(true);
    });

    it('should detect xAI with search parameters', async () => {
      const xaiProvider = createMockProvider({
        search_parameters: { mode: 'on' },
      });
      (xaiProvider.id as jest.Mock).mockReturnValue('xai:grok-2');
      (xaiProvider.callApi as jest.Mock).mockResolvedValue({
        output: JSON.stringify({
          pass: false,
          score: 0.3,
          reason: 'Citation not found',
          verifiedClaims: [],
          failedClaims: ['Smith et al. (2023) does not exist'],
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      const grading: GradingConfig = {
        provider: xaiProvider,
      };

      const result = await matchesResearchRubric(
        'All citations must exist',
        'According to Smith et al. (2023)...',
        grading,
      );

      expect(result.pass).toBe(false);
      expect(result.metadata?.failedClaims).toContain('Smith et al. (2023) does not exist');
    });

    it('should detect OpenAI responses API with web_search tool', async () => {
      const openaiProvider = createMockProvider({
        tools: [{ type: 'web_search' }],
      });
      (openaiProvider.id as jest.Mock).mockReturnValue('openai:responses:gpt-4o');
      (openaiProvider.callApi as jest.Mock).mockResolvedValue({
        output: JSON.stringify({
          pass: true,
          score: 1,
          reason: 'All facts verified',
          verifiedClaims: ['AAPL stock price is $175.23'],
          failedClaims: [],
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      const grading: GradingConfig = {
        provider: openaiProvider,
      };

      const result = await matchesResearchRubric(
        'Stock price must be current',
        'AAPL is trading at $175.23',
        grading,
      );

      expect(result.pass).toBe(true);
      expect(result.metadata?.gradingProvider).toBe('openai:responses:gpt-4o');
    });
  });

  describe('Fallback Provider Loading', () => {
    it('should load OpenAI responses provider if no research provider available', async () => {
      const mockOpenAiProvider = createMockWebSearchProvider('openai:responses:gpt-4o', {
        pass: true,
        score: 1,
        reason: 'Verified',
        verifiedClaims: ['Fact verified'],
        failedClaims: [],
      });
      mockOpenAiProvider.config = { tools: [{ type: 'web_search' }] };

      mockGetDefaultProviders.mockResolvedValue({
        embeddingProvider: createMockProvider(),
        gradingJsonProvider: createMockProvider(),
        gradingProvider: createMockProvider(),
        moderationProvider: createMockProvider(),
        suggestionsProvider: createMockProvider(),
        synthesizeProvider: createMockProvider(),
        researchProvider: undefined,
      });

      mockLoadApiProvider.mockResolvedValue(mockOpenAiProvider);

      const grading: GradingConfig = {};

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(mockLoadApiProvider).toHaveBeenCalledWith('openai:responses:gpt-4o', {
        options: {
          config: { tools: [{ type: 'web_search' }] },
        },
      });
      expect(result.pass).toBe(true);
    });

    it('should try multiple providers in order until one works', async () => {
      mockGetDefaultProviders.mockResolvedValue({
        embeddingProvider: createMockProvider(),
        gradingJsonProvider: createMockProvider(),
        gradingProvider: createMockProvider(),
        moderationProvider: createMockProvider(),
        suggestionsProvider: createMockProvider(),
        synthesizeProvider: createMockProvider(),
        researchProvider: undefined,
      });

      // Create a properly configured Google provider
      const googleProvider = createMockWebSearchProvider('google:gemini-2.0-flash', {
        pass: true,
        score: 0.8,
        reason: 'Google search verified',
        verifiedClaims: ['Verified'],
        failedClaims: [],
      });
      // Add the config for Google providers
      googleProvider.config = { tools: [{ googleSearch: {} }] };

      // Mock loadApiProvider to fail for first two attempts, succeed on third
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockRejectedValueOnce(new Error('Perplexity failed'))
        .mockResolvedValueOnce(googleProvider);

      const grading: GradingConfig = {};

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(mockLoadApiProvider).toHaveBeenCalledTimes(3);
      expect(result.score).toBe(0.8);
    });

    it('should throw error if no provider with web search is available', async () => {
      mockGetDefaultProviders.mockResolvedValue({
        embeddingProvider: createMockProvider(),
        gradingJsonProvider: createMockProvider(),
        gradingProvider: createMockProvider(),
        moderationProvider: createMockProvider(),
        suggestionsProvider: createMockProvider(),
        synthesizeProvider: createMockProvider(),
        researchProvider: undefined,
      });

      // All provider loading attempts fail
      mockLoadApiProvider.mockRejectedValue(new Error('No provider available'));

      const grading: GradingConfig = {};

      await expect(matchesResearchRubric('Verify this', 'Test output', grading)).rejects.toThrow(
        'research-rubric requires a grading provider with web search capabilities',
      );
    });
  });

  describe('Research Rubric Functionality', () => {
    it('should pass when all claims are verified', async () => {
      const provider = createMockWebSearchProvider('perplexity:sonar', {
        pass: true,
        score: 1,
        reason: 'All claims verified successfully',
        verifiedClaims: [
          'Temperature in NYC is 45°F',
          'It is currently snowing',
          'Wind speed is 15 mph',
        ],
        failedClaims: [],
      });

      const grading: GradingConfig = {
        provider,
      };

      const result = await matchesResearchRubric(
        'Weather data must be accurate',
        'NYC temperature is 45°F with snow and 15 mph winds',
        grading,
      );

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'All claims verified successfully',
        tokensUsed: { total: 10, prompt: 5, completion: 5 },
        assertion: undefined,
        metadata: {
          verifiedClaims: [
            'Temperature in NYC is 45°F',
            'It is currently snowing',
            'Wind speed is 15 mph',
          ],
          failedClaims: [],
          gradingProvider: 'perplexity:sonar',
          hasWebSearch: true,
        },
      });
    });

    it('should fail when claims cannot be verified', async () => {
      const provider = createMockWebSearchProvider('google:gemini-2.0-flash', {
        pass: false,
        score: 0.2,
        reason: 'Multiple claims could not be verified',
        verifiedClaims: ['Paris is in France'],
        failedClaims: [
          'Population of Paris is 5 million (actual: 2.1 million)',
          'Eiffel Tower built in 1900 (actual: 1889)',
        ],
      });
      // Add config for Google provider to be recognized as having web search
      provider.config = { tools: [{ googleSearch: {} }] };

      const grading: GradingConfig = {
        provider,
      };

      const result = await matchesResearchRubric(
        'All facts must be accurate',
        'Paris has 5 million people, Eiffel Tower built in 1900',
        grading,
      );

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0.2);
      expect(result.metadata?.failedClaims).toHaveLength(2);
    });

    it('should handle threshold correctly', async () => {
      const provider = createMockWebSearchProvider('perplexity:sonar', {
        pass: true,
        score: 0.7,
        reason: 'Most claims verified',
        verifiedClaims: ['Claim 1', 'Claim 2'],
        failedClaims: ['Claim 3'],
      });

      const grading: GradingConfig = {
        provider,
      };

      const assertion: Assertion = {
        type: 'research-rubric',
        value: 'Verify claims',
        threshold: 0.8,
      };

      const result = await matchesResearchRubric(
        'Verify claims',
        'Multiple claims here',
        grading,
        {},
        assertion,
      );

      expect(result.pass).toBe(false); // Score 0.7 is below threshold 0.8
      expect(result.score).toBe(0.7);
      expect(result.assertion).toBe(assertion);
    });

    it('should include prompt in evaluation when provided', async () => {
      const provider = createMockProvider();
      (provider.id as jest.Mock).mockReturnValue('perplexity:sonar');

      let capturedPrompt = '';
      (provider.callApi as jest.Mock).mockImplementation(async (prompt: string) => {
        capturedPrompt = prompt;
        return {
          output: JSON.stringify({
            pass: true,
            score: 1,
            reason: 'Verified',
            verifiedClaims: ['Test claim'],
            failedClaims: [],
          }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        };
      });

      const grading: GradingConfig = {
        provider,
      };

      await matchesResearchRubric(
        'Verify output',
        'Test output',
        grading,
        {},
        null,
        null,
        'Original prompt that generated the output',
      );

      expect(capturedPrompt).toContain('Original prompt that generated the output');
    });
  });

  describe('Error Handling', () => {
    it('should handle provider API errors gracefully', async () => {
      const provider = createMockProvider();
      (provider.id as jest.Mock).mockReturnValue('perplexity:sonar');
      (provider.callApi as jest.Mock).mockResolvedValue({
        error: 'API rate limit exceeded',
        output: null,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
      });

      const grading: GradingConfig = {
        provider,
      };

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Grading failed: API rate limit exceeded',
        tokensUsed: { total: 0, prompt: 0, completion: 0 },
        assertion: undefined,
      });
    });

    it('should handle malformed JSON responses', async () => {
      const provider = createMockProvider();
      (provider.id as jest.Mock).mockReturnValue('perplexity:sonar');
      (provider.callApi as jest.Mock).mockResolvedValue({
        output: 'This is not JSON',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      const grading: GradingConfig = {
        provider,
      };

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('This is not JSON');
    });

    it('should handle partial JSON responses', async () => {
      const provider = createMockProvider();
      (provider.id as jest.Mock).mockReturnValue('perplexity:sonar');
      (provider.callApi as jest.Mock).mockResolvedValue({
        output: 'Some text before {"pass":true} and after',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      const grading: GradingConfig = {
        provider,
      };

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should throw error when no grading config provided', async () => {
      await expect(matchesResearchRubric('Verify this', 'Test output')).rejects.toThrow(
        'Cannot grade output without grading config',
      );
    });
  });

  describe('Remote Grading', () => {
    it('should use remote grading when enabled and no rubric prompt override', async () => {
      (cliState as any).config = { redteam: {} };

      const { shouldGenerateRemote } = jest.requireMock('../../src/redteam/remoteGeneration');
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      mockDoRemoteGrading.mockResolvedValue({
        pass: true,
        score: 0.95,
        reason: 'Remote verification successful',
      });

      const grading: GradingConfig = {
        provider: createMockProvider(),
      };

      const result = await matchesResearchRubric(
        'Verify facts',
        'Test output with facts',
        grading,
        { testVar: 'value' },
      );

      expect(mockDoRemoteGrading).toHaveBeenCalledWith({
        task: 'research-rubric',
        rubric: 'Verify facts',
        output: 'Test output with facts',
        vars: { testVar: 'value' },
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.95);
    });

    it('should not use remote grading when rubric prompt is overridden', async () => {
      (cliState as any).config = { redteam: {} };

      const { shouldGenerateRemote } = jest.requireMock('../../src/redteam/remoteGeneration');
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      const provider = createMockWebSearchProvider('perplexity:sonar', {
        pass: true,
        score: 1,
        reason: 'Local verification',
        verifiedClaims: ['Test'],
        failedClaims: [],
      });

      const grading: GradingConfig = {
        rubricPrompt: 'Custom rubric prompt',
        provider,
      };

      await matchesResearchRubric('Verify facts', 'Test output', grading);

      expect(mockDoRemoteGrading).not.toHaveBeenCalled();
      expect(provider.callApi).toHaveBeenCalled();
    });
  });

  describe('Default Provider Usage', () => {
    it('should use research provider from defaults when available', async () => {
      const researchProvider = createMockWebSearchProvider('google:gemini-2.0-flash', {
        pass: true,
        score: 0.9,
        reason: 'Research provider used',
        verifiedClaims: ['Verified'],
        failedClaims: [],
      });
      researchProvider.config = { tools: [{ googleSearch: {} }] };

      mockGetDefaultProviders.mockResolvedValue({
        embeddingProvider: createMockProvider(),
        gradingJsonProvider: createMockProvider(),
        gradingProvider: createMockProvider(),
        moderationProvider: createMockProvider(),
        suggestionsProvider: createMockProvider(),
        synthesizeProvider: createMockProvider(),
        researchProvider,
      });

      const grading: GradingConfig = {};

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(result.metadata?.gradingProvider).toBe('google:gemini-2.0-flash');
      expect(mockLoadApiProvider).not.toHaveBeenCalled();
    });

    it('should fall back to llmRubricProvider if no research provider', async () => {
      const llmRubricProvider = createMockWebSearchProvider('perplexity:sonar', {
        pass: true,
        score: 1,
        reason: 'LLM rubric provider used',
        verifiedClaims: ['Test'],
        failedClaims: [],
      });

      mockGetDefaultProviders.mockResolvedValue({
        embeddingProvider: createMockProvider(),
        gradingJsonProvider: createMockProvider(),
        gradingProvider: createMockProvider(),
        llmRubricProvider,
        moderationProvider: createMockProvider(),
        suggestionsProvider: createMockProvider(),
        synthesizeProvider: createMockProvider(),
        researchProvider: undefined,
      });

      const grading: GradingConfig = {};

      const result = await matchesResearchRubric('Verify this', 'Test output', grading);

      expect(result.reason).toBe('LLM rubric provider used');
    });
  });
});
