import {
  createGptOssSafeguardClient,
  type GptOssSafeguardConfig,
} from '../../src/providers/gptOssSafeguard';

// Mock fetchWithRetries
jest.mock('../../src/util/fetch', () => ({
  fetchWithRetries: jest.fn(),
}));

// Mock logger
jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock envars
jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn((key: string) => {
    if (key === 'OPENROUTER_API_KEY') {
      return 'test-api-key';
    }
    return undefined;
  }),
}));

import { fetchWithRetries } from '../../src/util/fetch';

const mockFetchWithRetries = fetchWithRetries as jest.MockedFunction<typeof fetchWithRetries>;

describe('GptOssSafeguardClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Client initialization', () => {
    it('should initialize with default config', () => {
      expect(() => createGptOssSafeguardClient()).not.toThrow();
    });

    it('should initialize with custom config', () => {
      const config: GptOssSafeguardConfig = {
        model: 'openai/gpt-oss-safeguard-120b',
        reasoningLevel: 'low',
        outputFormat: 'binary',
        temperature: 0.5,
        apiKey: 'custom-key',
      };
      expect(() => createGptOssSafeguardClient(config)).not.toThrow();
    });

    it('should throw error when no API key is available', () => {
      const { getEnvString } = require('../../src/envars');
      getEnvString.mockReturnValue(undefined);

      expect(() => createGptOssSafeguardClient()).toThrow(/GPT OSS Safeguard requires an API key/);

      // Restore mock
      getEnvString.mockImplementation((key: string) => {
        if (key === 'OPENROUTER_API_KEY') {
          return 'test-api-key';
        }
        return undefined;
      });
    });
  });

  describe('classify', () => {
    it('should classify content with detailed output format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  violation: 0,
                  policy_category: null,
                  rule_ids: [],
                  confidence: 'high',
                  rationale: 'Content is safe',
                }),
                reasoning: 'Detailed chain of thought...',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'detailed',
      });

      const result = await client.classify('Test policy', 'Test content');

      expect(result.violation).toBe(0);
      expect(result.chain_of_thought).toBe('Detailed chain of thought...');
      expect(result.output.confidence).toBe('high');
      expect(result.output.rationale).toBe('Content is safe');
    });

    it('should classify content with binary output format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '1',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'binary',
      });

      const result = await client.classify('Test policy', 'Violating content');

      expect(result.violation).toBe(1);
    });

    it('should classify content with simple output format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  violation: 1,
                  policy_category: 'hate-speech',
                }),
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'simple',
      });

      const result = await client.classify('Test policy', 'Violating content');

      expect(result.violation).toBe(1);
      expect(result.output.policy_category).toBe('hate-speech');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
      });

      await expect(client.classify('Test policy', 'Test content')).rejects.toThrow(
        /GPT OSS Safeguard API error \(500\)/,
      );
    });

    it('should fail closed on invalid JSON responses (detailed format)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'invalid json {',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'detailed',
      });

      const result = await client.classify('Test policy', 'Test content');

      // Should fail closed (treat as violation) when parsing fails
      expect(result.violation).toBe(1);
      expect(result.output.violation).toBe(1);
      expect(result.output.confidence).toBe('low');
      expect(result.output.rationale).toBe('Failed to parse response');
    });

    it('should fail closed on invalid JSON responses (simple format)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'not valid json at all',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'simple',
      });

      const result = await client.classify('Test policy', 'Test content');

      // Should fail closed (treat as violation) when parsing fails
      expect(result.violation).toBe(1);
      expect(result.output.violation).toBe(1);
      expect(result.output.policy_category).toBe(null);
    });

    it('should fail closed on malformed JSON with missing fields', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"incomplete": "missing violation field"}',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'detailed',
      });

      const result = await client.classify('Test policy', 'Test content');

      // Should still parse successfully if JSON is valid, even with missing fields
      expect(result.violation).toBeUndefined(); // undefined from parsed.violation
      expect(result.output.violation).toBeUndefined();
    });

    it('should fail closed on completely invalid response format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '}{invalid syntax',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'simple',
      });

      const result = await client.classify('Test policy', 'Test content');

      // Should fail closed on syntax errors
      expect(result.violation).toBe(1);
      expect(result.output.violation).toBe(1);
    });

    it('should fail closed when JSON is valid but empty', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{}',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        outputFormat: 'detailed',
      });

      const result = await client.classify('Test policy', 'Test content');

      // Empty JSON is valid but missing violation field
      expect(result.violation).toBeUndefined();
      expect(result.output.confidence).toBe('medium'); // default value
    });

    it('should include reasoning level in policy format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '0',
              },
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const client = createGptOssSafeguardClient({
        apiKey: 'test-key',
        reasoningLevel: 'high',
        outputFormat: 'binary',
      });

      await client.classify('Test policy', 'Test content');

      // Check that fetchWithRetries was called with correct format
      const callArgs = mockFetchWithRetries.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);
      const systemMessage = requestBody.messages[0].content;

      expect(systemMessage).toContain('Reasoning: high');
    });
  });
});
