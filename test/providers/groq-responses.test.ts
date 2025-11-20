import { clearCache } from '../../src/cache';
import { GroqResponsesProvider } from '../../src/providers/groq-responses';
import * as fetchModule from '../../src/util/fetch/index';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

jest.mock('../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn((x) => x),
  renderVarsInObject: jest.fn((x) => x),
}));

jest.mock('../../src/util/fetch/index.ts');

describe('GroqResponsesProvider', () => {
  const mockedFetchWithRetries = jest.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    jest.clearAllMocks();
  });

  const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});

  it('should initialize with correct model name', () => {
    expect(provider.modelName).toBe('openai/gpt-oss-120b');
  });

  it('should return correct id', () => {
    expect(provider.id()).toBe('groq-responses:openai/gpt-oss-120b');
  });

  it('should return correct string representation', () => {
    expect(provider.toString()).toBe('[Groq Responses Provider openai/gpt-oss-120b]');
  });

  it('should identify reasoning models correctly', () => {
    const gptOssProvider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
    const deepseekProvider = new GroqResponsesProvider('deepseek-r1-distill-llama-70b', {});
    const qwenProvider = new GroqResponsesProvider('qwen/qwen3-32b', {});
    const regularProvider = new GroqResponsesProvider('llama-3.3-70b-versatile', {});

    expect(gptOssProvider['isReasoningModel']()).toBe(true);
    expect(deepseekProvider['isReasoningModel']()).toBe(true);
    expect(qwenProvider['isReasoningModel']()).toBe(true);
    expect(regularProvider['isReasoningModel']()).toBe(false);
  });

  it('should handle temperature support for reasoning models', () => {
    const gptOssProvider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
    const deepseekProvider = new GroqResponsesProvider('deepseek-r1-distill-llama-70b', {});
    const qwenProvider = new GroqResponsesProvider('qwen/qwen3-32b', {});

    expect(gptOssProvider['supportsTemperature']()).toBe(true);
    expect(deepseekProvider['supportsTemperature']()).toBe(true);
    expect(qwenProvider['supportsTemperature']()).toBe(true);
  });

  it('should serialize to JSON correctly', () => {
    const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {
      config: {
        temperature: 0.7,
      },
    });

    expect(provider.toJSON()).toEqual({
      provider: 'groq-responses',
      model: 'openai/gpt-oss-120b',
      config: {
        temperature: 0.7,
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: GROQ_API_BASE,
      },
    });
  });

  it('should not include reasoning parameters in request body', () => {
    const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {
      config: {
        reasoning_format: 'parsed',
        include_reasoning: false,
      },
    });

    const { body } = provider['getOpenAiBody']('Test prompt');
    expect(body.reasoning_format).toBeUndefined();
    expect(body.include_reasoning).toBeUndefined();
  });

  describe('callApi', () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GROQ_API_KEY;
    });

    it('should call Groq Responses API endpoint', async () => {
      const mockError = {
        error: {
          message: 'Test error',
          type: 'test_error',
        },
      };

      const response = new Response(JSON.stringify(mockError), {
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });
      mockedFetchWithRetries.mockResolvedValueOnce(response);

      const result = await provider.callApi('Test prompt');

      expect(mockedFetchWithRetries).toHaveBeenCalledWith(
        `${GROQ_API_BASE}/responses`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
        expect.any(Number),
        undefined,
      );

      expect(result.error).toContain('400');
    });
  });
});
