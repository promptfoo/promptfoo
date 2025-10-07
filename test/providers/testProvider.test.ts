import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { neverGenerateRemote } from '../../src/redteam/remoteGeneration';
import { ResultFailureReason } from '../../src/types';
import { fetchWithProxy } from '../../src/util/fetch';
import {
  testHTTPProviderConnectivity,
  testProviderSession,
} from '../../src/validators/testProvider';

import type { EvaluateResult, EvaluateSummaryV3 } from '../../src/types';
import type { ApiProvider } from '../../src/types/providers';

// Mock dependencies
jest.mock('../../src/evaluator');
jest.mock('../../src/logger');
jest.mock('../../src/models/eval');
jest.mock('../../src/redteam/remoteGeneration');
jest.mock('../../src/util/fetch');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('Provider Test Functions', () => {
  let mockProvider: ApiProvider;
  let mockEvalRecord: jest.Mocked<Eval>;
  let mockSummary: EvaluateSummaryV3;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset fetchWithProxy mock to default behavior
    (fetchWithProxy as jest.Mock).mockReset();

    // Setup mock provider
    mockProvider = {
      id: jest.fn(() => 'test-provider'),
      callApi: jest.fn(),
      config: {},
      getSessionId: jest.fn(),
    } as any;

    // Setup mock Eval record
    mockEvalRecord = {
      toEvaluateSummary: jest.fn(),
    } as any;

    // Setup default mock summary
    mockSummary = {
      results: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
          assertions: {
            prompt: 0,
            completion: 0,
            total: 0,
            numRequests: 0,
          },
        },
      },
      prompts: [],
      timestamp: new Date().toISOString(),
      version: 3,
    };

    // Mock Eval.constructor
    (Eval as jest.MockedClass<typeof Eval>).mockImplementation(() => mockEvalRecord);
    mockEvalRecord.toEvaluateSummary.mockResolvedValue(mockSummary);

    // Mock evaluate to resolve successfully by default
    (evaluate as jest.Mock).mockResolvedValue(mockEvalRecord);

    // Default mock for neverGenerateRemote
    (neverGenerateRemote as jest.Mock).mockReturnValue(false);
  });

  describe('testHTTPProviderConnectivity', () => {
    describe('successful connectivity tests', () => {
      it('should successfully test connectivity with agent endpoint analysis', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello! How can I help you today?',
            raw: 'Hello! How can I help you today?',
            metadata: {
              transformedRequest: { body: { message: 'Hello, world!' } },
              http: {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
              },
            },
            sessionId: 'session-123',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null, // No grading result since we don't use assertions
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock successful agent endpoint response
        const mockAgentResponse = {
          message: 'Provider is working correctly',
          changes_needed: false,
        };

        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        // Verify evaluation was called WITHOUT assertions
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            providers: [mockProvider],
            prompts: [{ raw: 'Hello, world!', label: 'Connectivity Test' }],
            tests: [
              expect.objectContaining({
                vars: { sessionId: 'test-uuid-1234' },
              }),
            ],
          }),
          mockEvalRecord,
          expect.objectContaining({
            maxConcurrency: 1,
            showProgressBar: false,
          }),
        );

        // Verify agent endpoint was called with correct payload
        expect(fetchWithProxy).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/providers/test'),
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              config: mockProvider.config,
              providerResponse: mockResult.response!.raw,
              parsedResponse: mockResult.response!.output,
              error: null,
              headers: { 'content-type': 'application/json' },
            }),
          }),
        );

        // Verify result structure
        expect(result).toEqual({
          success: true,
          message: 'Provider is working correctly',
          error: undefined,
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello, world!' } },
          sessionId: 'session-123',
          analysis: undefined,
        });

        expect(logger.debug).toHaveBeenCalledWith('[testProviderConnectivity] Running evaluation', {
          providerId: mockProvider.id,
        });
      });

      it('should handle connectivity test with remote grading disabled', async () => {
        (neverGenerateRemote as jest.Mock).mockReturnValue(true);

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello! How can I help you today?',
            metadata: {
              transformedRequest: { body: { message: 'Hello, world!' } },
            },
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];

        const result = await testHTTPProviderConnectivity(mockProvider);

        // Verify evaluation was called without assertions
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: [
              expect.objectContaining({
                vars: { sessionId: 'test-uuid-1234' },
              }),
            ],
          }),
          mockEvalRecord,
          expect.any(Object),
        );

        // Verify fetchWithProxy was NOT called when remote grading is disabled
        expect(fetchWithProxy).not.toHaveBeenCalled();

        // Verify result for disabled remote grading
        expect(result).toEqual({
          success: true,
          message:
            'Provider test completed. Remote grading disabled - please review the response manually.',
          error: undefined,
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello, world!' } },
          sessionId: 'test-uuid-1234',
        });
      });

      it('should extract session ID from provider getSessionId method', async () => {
        mockProvider.getSessionId = jest.fn(() => 'provider-session-id');

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock successful agent response
        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result.sessionId).toBe('provider-session-id');
      });

      it('should extract session ID from response if provider method not available', async () => {
        mockProvider.getSessionId = undefined;

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
            sessionId: 'response-session-id',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock successful agent response
        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result.sessionId).toBe('response-session-id');
      });

      it('should fall back to generated session ID if not found elsewhere', async () => {
        mockProvider.getSessionId = undefined;

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock successful agent response
        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result.sessionId).toBe('test-uuid-1234');
      });
    });

    describe('failed connectivity tests', () => {
      it('should handle provider call failure', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            error: 'Connection timeout',
            metadata: {
              transformedRequest: { url: 'http://example.com' },
            },
          },
          error: 'Connection timeout',
          failureReason: ResultFailureReason.ERROR,
          success: false,
          score: 0,
          latencyMs: 5000,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.failures = 1;

        // Mock agent endpoint response for error case
        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            message: 'Provider call failed: Connection timeout',
            error: 'Connection timeout',
          }),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        // Should call agent endpoint even when there's an error for analysis
        expect(fetchWithProxy).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/providers/test'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              config: mockProvider.config,
              providerResponse: undefined,
              parsedResponse: undefined,
              error: 'Connection timeout',
              headers: undefined,
            }),
          }),
        );

        expect(result).toEqual({
          success: false,
          message: 'Provider call failed: Connection timeout',
          error: 'Connection timeout',
          providerResponse: mockResult.response,
          transformedRequest: { url: 'http://example.com' },
          sessionId: 'test-uuid-1234',
          analysis: undefined,
        });
      });

      it('should handle agent endpoint failure with analysis', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Error: Internal server error',
            raw: 'Error: Internal server error',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock agent response with changes needed
        const mockAgentResponse = {
          message: 'Provider returned an error message instead of a valid response',
          changes_needed: true,
          changes_needed_reason: 'Provider returned an error message instead of a valid response',
          changes_needed_suggestions: [
            'Check your API configuration and ensure the endpoint is working',
          ],
        };

        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Provider returned an error message instead of a valid response',
          error: undefined,
          providerResponse: mockResult.response,
          transformedRequest: undefined,
          sessionId: 'test-uuid-1234',
          analysis: {
            changes_needed: true,
            changes_needed_reason: 'Provider returned an error message instead of a valid response',
            changes_needed_suggestions: [
              'Check your API configuration and ensure the endpoint is working',
            ],
          },
        });
      });

      it('should handle agent endpoint returning error status', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
            metadata: {
              transformedRequest: { body: { message: 'Hello, world!' } },
            },
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock agent endpoint returning error status
        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Error evaluating the results. Please review the provider response manually.',
          error: 'Remote evaluation failed',
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello, world!' } },
          sessionId: 'test-uuid-1234',
        });

        expect(logger.error).toHaveBeenCalledWith(
          '[testProviderConnectivity] Error calling agent helper',
          {
            error: 'Internal Server Error',
            providerId: mockProvider.id,
          },
        );
      });

      it('should handle agent endpoint throwing an exception', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
            metadata: {
              transformedRequest: { body: { message: 'Hello, world!' } },
            },
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock agent endpoint throwing exception
        (fetchWithProxy as jest.Mock).mockRejectedValue(new Error('Network error'));

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Error evaluating the results. Please review the provider response manually.',
          error: 'Network error',
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello, world!' } },
          sessionId: 'test-uuid-1234',
        });

        expect(logger.error).toHaveBeenCalledWith(
          '[testProviderConnectivity] Error calling agent helper',
          {
            error: 'Network error',
            providerId: mockProvider.id,
          },
        );
      });

      it('should handle agent endpoint returning error in response', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello, world!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [mockResult];
        mockSummary.stats.successes = 1;

        // Mock agent response with error field
        const mockAgentResponse = {
          error: 'Unable to analyze the provider response',
          message: 'Analysis failed',
        };

        (fetchWithProxy as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Analysis failed',
          error: 'Unable to analyze the provider response',
          providerResponse: mockResult.response,
          transformedRequest: undefined,
          sessionId: 'test-uuid-1234',
          analysis: undefined,
        });
      });

      it('should handle evaluation throwing an error', async () => {
        const evalError = new Error('Evaluation failed');
        (evaluate as jest.Mock).mockRejectedValue(evalError);

        const result = await testHTTPProviderConnectivity(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Error evaluating the provider. Please review the error details.',
          error: 'Evaluation failed',
        });

        expect(logger.error).toHaveBeenCalledWith(
          '[testProviderConnectivity] Error during evaluation',
          {
            error: 'Evaluation failed',
            providerId: mockProvider.id,
          },
        );
      });
    });
  });

  describe('testProviderSession', () => {
    describe('successful session tests', () => {
      it('should successfully test session with client-side session ID', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output:
              'I can help you with various tasks like answering questions, providing information, etc.',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'You asked me what I can help you with.',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'The system correctly remembered the previous question',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;

        const result = await testProviderSession(mockProvider);

        // Verify evaluation was called with two prompts and sequential tests
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            providers: [mockProvider],
            prompts: [{ raw: '{{input}}', label: 'Session Test' }],
            tests: [
              expect.objectContaining({
                vars: { input: 'What can you help me with?', sessionId: 'test-uuid-1234' },
              }),
              expect.objectContaining({
                vars: {
                  input: 'What was the last thing I asked you?',
                  sessionId: 'test-uuid-1234',
                },
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'llm-rubric',
                    value: expect.stringContaining('maintains session state'),
                  }),
                ]),
              }),
            ],
          }),
          mockEvalRecord,
          expect.objectContaining({
            maxConcurrency: 1,
            showProgressBar: false,
          }),
        );

        // Verify successful result
        expect(result).toEqual(
          expect.objectContaining({
            success: true,
            message: expect.any(String),
            reason: 'The system correctly remembered the previous question',
            details: {
              sessionId: 'test-uuid-1234',
              sessionSource: 'client',
              request1: {
                prompt: 'What can you help me with?',
                sessionId: 'test-uuid-1234',
              },
              response1:
                'I can help you with various tasks like answering questions, providing information, etc.',
              request2: {
                prompt: 'What was the last thing I asked you?',
                sessionId: 'test-uuid-1234',
              },
              response2: 'You asked me what I can help you with.',
            },
          }),
        );
      });

      it('should successfully test session with server-side session ID', async () => {
        mockProvider.config = {
          sessionParser: 'response.sessionId',
        };

        const serverSessionId = 'server-generated-session-123';
        mockProvider.getSessionId = jest.fn(() => serverSessionId);

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'I can help with many things!',
            sessionId: serverSessionId,
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: serverSessionId },
          response: {
            output: 'You asked what I can help you with.',
            sessionId: serverSessionId,
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Session memory working correctly',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;

        const result = await testProviderSession(mockProvider);

        expect(result).toEqual({
          success: true,
          message:
            'Session management is working correctly! The provider remembered information across requests.',
          reason: 'Session memory working correctly',
          details: {
            sessionId: serverSessionId,
            sessionSource: 'server',
            request1: {
              prompt: 'What can you help me with?',
              sessionId: 'test-uuid-1234',
            },
            response1: 'I can help with many things!',
            request2: {
              prompt: 'What was the last thing I asked you?',
              sessionId: serverSessionId,
            },
            response2: 'You asked what I can help you with.',
          },
        });
      });

      it('should handle session test with remote grading disabled', async () => {
        (neverGenerateRemote as jest.Mock).mockReturnValue(true);

        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'I can help with many things!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'You asked what I can help you with.',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];

        const result = await testProviderSession(mockProvider);

        // Verify no assertions were added for second test
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: [
              expect.any(Object),
              expect.objectContaining({
                assert: [],
              }),
            ],
          }),
          mockEvalRecord,
          expect.any(Object),
        );

        expect(result).toEqual({
          success: false,
          message:
            'Session test completed. Remote grading is disabled - please examine the results yourself.',
          reason: 'Manual review required - remote grading is disabled',
          details: {
            sessionId: 'test-uuid-1234',
            sessionSource: 'client',
            request1: {
              prompt: 'What can you help me with?',
              sessionId: 'test-uuid-1234',
            },
            response1: 'I can help with many things!',
            request2: {
              prompt: 'What was the last thing I asked you?',
              sessionId: 'test-uuid-1234',
            },
            response2: 'You asked what I can help you with.',
          },
        });
      });
    });

    describe('failed session tests', () => {
      it('should fail when session memory is not working', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'I can help with many things!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: "I don't have access to previous messages.",
          },
          error: null,
          failureReason: ResultFailureReason.ASSERT,
          success: false,
          score: 0,
          latencyMs: 120,
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'The system did not remember the previous question',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.failures = 1;

        const result = await testProviderSession(mockProvider);

        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            message: expect.any(String),
            reason: 'The system did not remember the previous question',
            details: {
              sessionId: 'test-uuid-1234',
              sessionSource: 'client',
              request1: {
                prompt: 'What can you help me with?',
                sessionId: 'test-uuid-1234',
              },
              response1: 'I can help with many things!',
              request2: {
                prompt: 'What was the last thing I asked you?',
                sessionId: 'test-uuid-1234',
              },
              response2: "I don't have access to previous messages.",
            },
          }),
        );
      });

      it('should fail validation when client session config is missing sessionId variable', async () => {
        mockProvider.config = {
          headers: {
            Authorization: 'Bearer token',
          },
          sessionSource: 'client',
        };

        const result = await testProviderSession(mockProvider);

        expect(result).toEqual({
          success: false,
          message:
            'Session configuration error: {{sessionId}} variable is not used in the provider configuration',
          reason:
            'When using client-side sessions, you must include {{sessionId}} in your request headers or body.',
          details: {
            sessionSource: 'client',
          },
        });

        expect(evaluate).not.toHaveBeenCalled();
      });

      it('should skip validation when skipConfigValidation is true', async () => {
        mockProvider.config = {
          headers: {
            Authorization: 'Bearer token',
          },
          sessionSource: 'client',
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'I can help!' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'You asked what I can help with.' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;

        const result = await testProviderSession(mockProvider, undefined, {
          skipConfigValidation: true,
        });

        expect(evaluate).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should fail validation when server session config is missing parser', async () => {
        mockProvider.config = {
          sessionSource: 'server',
        };

        const result = await testProviderSession(mockProvider, {
          sessionSource: 'server',
        });

        expect(result).toEqual({
          success: false,
          message:
            'Session configuration error: No session parser configured for server-generated sessions',
          reason:
            'When using server-side sessions, you must configure a session parser to extract the session ID from the response.',
          details: {
            sessionSource: 'server',
          },
        });

        expect(evaluate).not.toHaveBeenCalled();
      });

      it('should fail when server session ID extraction fails', async () => {
        mockProvider.config = {
          sessionParser: 'response.sessionId',
        };
        mockProvider.getSessionId = jest.fn(() => '');

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'I can help!',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Test response',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: null,
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];

        const result = await testProviderSession(mockProvider, {
          sessionSource: 'server',
          sessionParser: 'response.sessionId',
        });

        expect(result).toEqual({
          success: false,
          message:
            'Session extraction failed: The session parser did not extract a session ID from the server response',
          reason:
            "The session parser expression did not return a valid session ID. Check that the parser matches your server's response format.",
          details: {
            sessionSource: 'server',
            sessionId: 'Not extracted',
            request1: {
              prompt: 'What can you help me with?',
            },
            response1: 'I can help!',
          },
        });
      });

      it('should handle evaluation throwing an error', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const evalError = new Error('Evaluation failed during session test');
        (evaluate as jest.Mock).mockRejectedValue(evalError);

        const result = await testProviderSession(mockProvider);

        expect(result).toEqual({
          success: false,
          message: 'Failed to test session: Evaluation failed during session test',
          error: 'Evaluation failed during session test',
        });

        expect(logger.error).toHaveBeenCalledWith('[testProviderSession] Error testing session', {
          error: 'Evaluation failed during session test',
          providerId: mockProvider.id,
        });
      });
    });

    describe('session configuration', () => {
      it('should update provider config with session settings', async () => {
        const sessionConfig = {
          sessionSource: 'server',
          sessionParser: 'headers["session-id"]',
        };

        mockProvider.config = {
          url: 'http://example.com',
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'I can help!', sessionId: 'server-123' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'server-123' },
          response: { output: 'You asked what I can help with.', sessionId: 'server-123' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;
        mockProvider.getSessionId = jest.fn(() => 'server-123');

        await testProviderSession(mockProvider, sessionConfig);

        // Verify provider config was updated
        expect(mockProvider.config).toEqual({
          url: 'http://example.com',
          sessionSource: 'server',
          sessionParser: 'headers["session-id"]',
        });
      });

      it('should detect server session from sessionParser in provider config', async () => {
        mockProvider.config = {
          sessionParser: 'response.sessionId',
        };
        mockProvider.getSessionId = jest.fn(() => 'server-session-id');

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'I can help!', sessionId: 'server-session-id' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'server-session-id' },
          response: { output: 'You asked what I can help with.', sessionId: 'server-session-id' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Session working',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;

        const result = await testProviderSession(mockProvider);

        expect(result.details?.sessionSource).toBe('server');
        expect(result.details?.sessionId).toBe('server-session-id');
      });
    });

    describe('edge cases', () => {
      it('should handle empty response outputs gracefully', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: '',
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: '',
          },
          error: null,
          failureReason: ResultFailureReason.ASSERT,
          success: false,
          score: 0,
          latencyMs: 120,
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'Empty response received',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];

        const result = await testProviderSession(mockProvider);

        expect(result.success).toBe(false);
        expect(result.details?.response1).toBe('');
        expect(result.details?.response2).toBe('');
      });

      it('should handle missing evaluation results gracefully', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Return empty results array
        mockSummary.results = [];

        const result = await testProviderSession(mockProvider);

        // Should handle gracefully without crashing
        expect(result.details?.response1).toBeUndefined();
        expect(result.details?.response2).toBeUndefined();
      });

      it('should use {{__outputs.0.output}} reference in llm-rubric for second test', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        const firstResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-1',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What can you help me with?', label: 'First Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'I can help!' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: null,
          namedScores: {},
        };

        const secondResult: EvaluateResult = {
          promptIdx: 1,
          testIdx: 1,
          testCase: {} as any,
          promptId: 'test-prompt-2',
          provider: { id: 'test-provider' },
          prompt: { raw: 'What was the last thing I asked you?', label: 'Second Request' },
          vars: { sessionId: 'test-uuid-1234' },
          response: { output: 'You asked what I can help with.' },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 120,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            componentResults: [],
          },
          namedScores: {},
        };

        mockSummary.results = [firstResult, secondResult];
        mockSummary.stats.successes = 2;

        await testProviderSession(mockProvider);

        // Verify the llm-rubric assertion uses {{firstResponse}} to reference first response
        // and that first test uses storeOutputAs
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: [
              expect.objectContaining({
                options: expect.objectContaining({
                  storeOutputAs: 'firstResponse',
                }),
              }),
              expect.objectContaining({
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'llm-rubric',
                    value: expect.stringContaining('{{firstResponse}}'),
                  }),
                ]),
              }),
            ],
          }),
          mockEvalRecord,
          expect.any(Object),
        );
      });
    });
  });
});
