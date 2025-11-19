import request from 'supertest';
import { createApp } from '../../../src/server/server';

import type { ApiProvider, ProviderOptions } from '../../../src/types/providers';
import type { ProviderTestResult } from '../../../src/validators/testProvider';

// Mock dependencies
jest.mock('../../../src/providers/index');
jest.mock('../../../src/validators/testProvider');

// Import after mocking
import { loadApiProvider } from '../../../src/providers/index';
import { testHTTPProviderConnectivity } from '../../../src/validators/testProvider';

const mockedLoadApiProvider = jest.mocked(loadApiProvider);
const mockedTestHTTPProviderConnectivity = jest.mocked(testHTTPProviderConnectivity);

describe('Providers Routes', () => {
  describe('POST /providers/test', () => {
    let app: ReturnType<typeof createApp>;
    let mockProvider: ApiProvider;

    beforeEach(() => {
      jest.clearAllMocks();
      app = createApp();

      // Setup mock provider
      mockProvider = {
        id: jest.fn(() => 'test-provider'),
        callApi: jest.fn(),
        config: {},
      } as any;

      // Default mock implementations
      mockedLoadApiProvider.mockResolvedValue(mockProvider);
    });

    it('should handle valid request with prompt', async () => {
      const testPrompt = 'Test prompt';
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          method: 'POST',
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Provider test successful',
        providerResponse: { output: 'Test response' },
        transformedRequest: { url: 'http://example.com/api' },
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        prompt: testPrompt,
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: true,
          message: 'Provider test successful',
          error: undefined,
          changes_needed: undefined,
          changes_needed_reason: undefined,
          changes_needed_suggestions: undefined,
        },
        providerResponse: { output: 'Test response' },
        transformedRequest: { url: 'http://example.com/api' },
      });

      expect(mockedLoadApiProvider).toHaveBeenCalledWith('http://example.com/api', {
        options: {
          ...providerOptions,
          config: {
            ...providerOptions.config,
            maxRetries: 1,
          },
        },
      });

      expect(mockedTestHTTPProviderConnectivity).toHaveBeenCalledWith(mockProvider, testPrompt);
    });

    it('should handle valid request without prompt (optional)', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Provider test successful',
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(mockedTestHTTPProviderConnectivity).toHaveBeenCalledWith(mockProvider, undefined);
    });

    it('should return 400 for missing providerOptions', async () => {
      const response = await request(app).post('/api/providers/test').send({
        prompt: 'Test prompt',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('providerOptions'),
        }),
      );
    });

    it('should throw error for missing provider id', async () => {
      const providerOptions: ProviderOptions = {
        config: {},
      };

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      // The route should catch the error and return 500
      expect(response.status).toBe(500);
    });

    it('should return 400 for malformed body with extra fields', async () => {
      const response = await request(app)
        .post('/api/providers/test')
        .send({
          providerOptions: {
            id: 'test-provider',
            unexpectedField: 'should cause validation error',
          },
          prompt: 'Test',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Unrecognized key'),
        }),
      );
    });

    it('should handle provider loading failure', async () => {
      const providerOptions: ProviderOptions = {
        id: 'invalid-provider',
        config: {},
      };

      mockedLoadApiProvider.mockRejectedValue(new Error('Failed to load provider'));

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      // The route should catch the error and return 500
      expect(response.status).toBe(500);
    });

    it('should handle connectivity test failure', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: false,
        message: 'Connection failed',
        error: 'Network timeout',
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Test',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: false,
          message: 'Connection failed',
          error: 'Network timeout',
          changes_needed: undefined,
          changes_needed_reason: undefined,
          changes_needed_suggestions: undefined,
        },
        providerResponse: undefined,
        transformedRequest: undefined,
      });
    });

    it('should handle successful test with analysis and suggestions', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Test completed with suggestions',
        providerResponse: { output: 'Response' },
        analysis: {
          changes_needed: true,
          changes_needed_reason: 'Response format is not optimal',
          changes_needed_suggestions: [
            'Add response transform to extract text field',
            'Update headers to include authentication',
          ],
        },
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Test',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: true,
          message: 'Test completed with suggestions',
          error: undefined,
          changes_needed: true,
          changes_needed_reason: 'Response format is not optimal',
          changes_needed_suggestions: [
            'Add response transform to extract text field',
            'Update headers to include authentication',
          ],
        },
        providerResponse: { output: 'Response' },
        transformedRequest: undefined,
      });
    });

    it('should properly structure response with all fields', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'All systems operational',
        error: undefined,
        providerResponse: {
          output: 'AI response text',
          metadata: { latency: 150 },
        },
        transformedRequest: {
          url: 'http://example.com/api',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: 'Comprehensive test' },
        },
        analysis: {
          changes_needed: false,
        },
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Comprehensive test',
      });

      expect(response.status).toBe(200);

      // Verify testResult structure
      expect(response.body.testResult.success).toBe(true);
      expect(response.body.testResult.message).toBe('All systems operational');
      expect(response.body.testResult.error).toBeUndefined();
      expect(response.body.testResult.changes_needed).toBe(false);
      expect(response.body.testResult.changes_needed_reason).toBeUndefined();
      expect(response.body.testResult.changes_needed_suggestions).toBeUndefined();

      // Verify providerResponse
      expect(response.body.providerResponse).toEqual({
        output: 'AI response text',
        metadata: { latency: 150 },
      });

      // Verify transformedRequest
      expect(response.body.transformedRequest).toEqual({
        url: 'http://example.com/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { prompt: 'Comprehensive test' },
      });
    });

    it('should pass maxRetries: 1 to provider config', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          maxRetries: 5, // Should be overridden to 1
          timeout: 30000,
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Success',
      };

      mockedTestHTTPProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalledWith('http://example.com/api', {
        options: {
          ...providerOptions,
          config: {
            maxRetries: 1, // Should be 1, not 5
            timeout: 30000,
          },
        },
      });
    });
  });
});
