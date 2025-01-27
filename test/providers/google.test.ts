import * as cache from '../../src/cache';
import { GoogleChatProvider } from '../../src/providers/google';
import * as vertexUtil from '../../src/providers/vertexUtil';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/logger');

jest.mock('../../src/providers/vertexUtil', () => ({
  maybeCoerceToGeminiFormat: jest.fn(),
}));

describe('GoogleChatProvider', () => {
  let provider: GoogleChatProvider;

  beforeEach(() => {
    provider = new GoogleChatProvider('gemini-pro', {
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('callGemini', () => {
    it('should call the Gemini API and return the response', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        output: 'response text',
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('gemini-pro:generateContent'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            '"contents":[{"role":"user","parts":[{"text":"test prompt"}]}]',
          ),
        }),
        expect.any(Number),
      );
    });

    it('should handle system messages correctly', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [
          { role: 'system' as any, parts: [{ text: 'system instruction' }] },
          { role: 'user', parts: [{ text: 'user message' }] },
        ],
        coerced: false,
        systemInstruction: undefined,
      } as any);

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        output: 'response text',
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=',
        ),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining(
            '"contents":[{"role":"system","parts":[{"text":"system instruction"}]},{"role":"user","parts":[{"text":"user message"}]}]',
          ),
        }),
        expect.any(Number),
      );
    });

    it('should handle API call errors', async () => {
      jest.mocked(cache.fetchWithCache).mockRejectedValue(new Error('API error'));

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        error: 'API call error: Error: API error',
      });
    });

    it('should handle response schema', async () => {
      provider = new GoogleChatProvider('gemini-pro', {
        config: {
          responseSchema: '{"type":"object","properties":{"name":{"type":"string"}}}',
        },
      });

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: '{"name":"John"}' }] } }],
        },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      await provider.callGemini('test prompt');
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.any(String),
        }),
        expect.any(Number),
      );
    });
  });
});
