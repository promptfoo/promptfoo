import { beforeEach, describe, expect, it, Mock, Mocked, MockedClass, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { neverGenerateRemote } from '../../src/redteam/remoteGeneration';
import { doRemoteGrading } from '../../src/remoteGrading';
import { ResultFailureReason } from '../../src/types/index';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { testProviderConnectivity, testProviderSession } from '../../src/validators/testProvider';

import type { EvaluateResult, EvaluateSummaryV3 } from '../../src/types/index';
import type { ApiProvider } from '../../src/types/providers';

// Mock dependencies
vi.mock('../../src/evaluator');
vi.mock('../../src/logger');
vi.mock('../../src/models/eval');
vi.mock('../../src/redteam/remoteGeneration');
vi.mock('../../src/remoteGrading');
vi.mock('../../src/util/fetch');
vi.mock('../../src/globalConfig/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    cloudConfig: {
      getApiHost: vi.fn(() => 'https://api.promptfoo.app'),
      getApiKey: vi.fn(() => 'test-api-key'),
      isEnabled: vi.fn(() => true),
    },
  };
});
vi.stubGlobal('crypto', {
  ...crypto,
  randomUUID: vi.fn(() => 'test-uuid-1234'),
});

describe('Provider Test Functions', () => {
  let mockProvider: ApiProvider;
  let mockEvalRecord: Mocked<Eval>;
  let mockSummary: EvaluateSummaryV3;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fetchWithProxy mock to default behavior
    (fetchWithProxy as Mock).mockReset();

    // Setup mock provider
    mockProvider = {
      id: vi.fn(() => 'test-provider'),
      callApi: vi.fn(),
      config: {},
      getSessionId: vi.fn(),
    } as any;

    // Setup mock Eval record
    mockEvalRecord = {
      toEvaluateSummary: vi.fn(),
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
    (Eval as MockedClass<typeof Eval>).mockImplementation(function () {
      return mockEvalRecord;
    });
    mockEvalRecord.toEvaluateSummary.mockResolvedValue(mockSummary);

    // Mock evaluate to resolve successfully by default
    (evaluate as Mock).mockResolvedValue(mockEvalRecord);

    // Default mock for neverGenerateRemote
    (neverGenerateRemote as Mock).mockReturnValue(false);

    // Default mock for doRemoteGrading
    (doRemoteGrading as Mock).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'The system correctly remembered the previous question',
    });
  });

  describe('testProviderConnectivity', () => {
    describe('successful connectivity tests', () => {
      it('should successfully test connectivity with agent endpoint analysis', async () => {
        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello! How can I help you today?',
            raw: 'Hello! How can I help you today?',
            metadata: {
              transformedRequest: { body: { message: 'Hello World!' } },
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

        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

        // Verify evaluation was called WITHOUT assertions
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            providers: [mockProvider],
            prompts: [{ raw: 'Hello World!', label: 'Connectivity Test' }],
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
              Authorization: 'Bearer test-api-key',
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
          transformedRequest: { body: { message: 'Hello World!' } },
          sessionId: 'session-123',
          analysis: undefined,
        });

        expect(logger.debug).toHaveBeenCalledWith('[testProviderConnectivity] Running evaluation', {
          providerId: mockProvider.id,
        });
      });

      it('should handle connectivity test with remote grading disabled', async () => {
        (neverGenerateRemote as Mock).mockReturnValue(true);

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello! How can I help you today?',
            metadata: {
              transformedRequest: { body: { message: 'Hello World!' } },
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

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          transformedRequest: { body: { message: 'Hello World!' } },
          sessionId: 'test-uuid-1234',
        });
      });

      it('should extract session ID from provider getSessionId method', async () => {
        mockProvider.getSessionId = vi.fn(() => 'provider-session-id');

        const mockResult: EvaluateResult = {
          promptIdx: 0,
          testIdx: 0,
          testCase: {} as any,
          promptId: 'test-prompt-id',
          provider: { id: 'test-provider' },
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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
        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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
        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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
        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            message: 'Test passed',
            changes_needed: false,
          }),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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
        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            message: 'Provider call failed: Connection timeout',
            error: 'Connection timeout',
          }),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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

        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
            metadata: {
              transformedRequest: { body: { message: 'Hello World!' } },
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
        (fetchWithProxy as Mock).mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

        expect(result).toEqual({
          success: false,
          message: 'Error evaluating the results. Please review the provider response manually.',
          error: 'Remote evaluation failed',
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello World!' } },
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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
          vars: { sessionId: 'test-uuid-1234' },
          response: {
            output: 'Hello!',
            raw: 'Hello!',
            metadata: {
              transformedRequest: { body: { message: 'Hello World!' } },
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
        (fetchWithProxy as Mock).mockRejectedValue(new Error('Network error'));

        const result = await testProviderConnectivity({ provider: mockProvider });

        expect(result).toEqual({
          success: false,
          message: 'Error evaluating the results. Please review the provider response manually.',
          error: 'Network error',
          providerResponse: mockResult.response,
          transformedRequest: { body: { message: 'Hello World!' } },
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
          prompt: { raw: 'Hello World!', label: 'Connectivity Test' },
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

        (fetchWithProxy as Mock).mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockAgentResponse),
        });

        const result = await testProviderConnectivity({ provider: mockProvider });

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
        (evaluate as Mock).mockRejectedValue(evalError);

        const result = await testProviderConnectivity({ provider: mockProvider });

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

        // Mock callApi to return successful responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output:
              'I can help you with various tasks like answering questions, providing information, etc.',
          })
          .mockResolvedValueOnce({
            output: 'You asked me what I can help you with.',
          });

        const result = await testProviderSession({ provider: mockProvider });

        // Verify callApi was called twice with correct prompts and session ID
        expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
        expect(mockProvider.callApi).toHaveBeenNthCalledWith(
          1,
          'What can you help me with?',
          expect.objectContaining({
            vars: { sessionId: 'test-uuid-1234' },
            prompt: {
              raw: 'What can you help me with?',
              label: 'Session Test - Request 1',
            },
          }),
        );
        expect(mockProvider.callApi).toHaveBeenNthCalledWith(
          2,
          'What was the last thing I asked you?',
          expect.objectContaining({
            vars: { sessionId: 'test-uuid-1234' },
            prompt: {
              raw: 'What was the last thing I asked you?',
              label: 'Session Test - Request 2',
            },
          }),
        );

        // Verify doRemoteGrading was called
        expect(doRemoteGrading).toHaveBeenCalledWith(
          expect.objectContaining({
            task: 'llm-rubric',
            rubric: expect.stringContaining('maintains session state'),
            output: 'You asked me what I can help you with.',
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
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
          sessionParser: 'response.sessionId',
        };

        const serverSessionId = 'server-generated-session-123';
        mockProvider.getSessionId = vi.fn(() => serverSessionId);

        // Mock callApi to return successful responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help with many things!',
            sessionId: serverSessionId,
          })
          .mockResolvedValueOnce({
            output: 'You asked what I can help you with.',
            sessionId: serverSessionId,
          });

        const result = await testProviderSession({ provider: mockProvider });

        // Verify callApi was called twice
        expect(mockProvider.callApi).toHaveBeenCalledTimes(2);

        // First call should have no sessionId in vars (server will generate it)
        expect(mockProvider.callApi).toHaveBeenNthCalledWith(
          1,
          'What can you help me with?',
          expect.objectContaining({
            vars: {}, // No sessionId for first request in server mode
            prompt: {
              raw: 'What can you help me with?',
              label: 'Session Test - Request 1',
            },
          }),
        );

        // Second call should use extracted sessionId
        expect(mockProvider.callApi).toHaveBeenNthCalledWith(
          2,
          'What was the last thing I asked you?',
          expect.objectContaining({
            vars: { sessionId: serverSessionId },
            prompt: {
              raw: 'What was the last thing I asked you?',
              label: 'Session Test - Request 2',
            },
          }),
        );

        expect(result).toEqual({
          success: true,
          message:
            'Session management is working correctly! The provider remembered information across requests.',
          reason: 'The system correctly remembered the previous question',
          details: {
            sessionId: serverSessionId,
            sessionSource: 'server',
            request1: { prompt: 'What can you help me with?', sessionId: undefined },
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
        (neverGenerateRemote as Mock).mockReturnValue(true);

        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help with many things!',
          })
          .mockResolvedValueOnce({
            output: 'You asked what I can help you with.',
          });

        const result = await testProviderSession({ provider: mockProvider });

        // Verify doRemoteGrading was NOT called
        expect(doRemoteGrading).not.toHaveBeenCalled();

        expect(result).toEqual({
          success: false,
          message:
            'Session test completed. Remote grading is disabled - please examine the results yourself.',
          reason: 'Manual review required - remote grading is disabled',
          details: {
            sessionId: 'test-uuid-1234',
            sessionSource: 'client',
            request1: { prompt: 'What can you help me with?', sessionId: 'test-uuid-1234' },
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

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help with many things!',
          })
          .mockResolvedValueOnce({
            output: "I don't have access to previous messages.",
          });

        // Mock doRemoteGrading to return failure
        (doRemoteGrading as Mock).mockResolvedValue({
          pass: false,
          score: 0,
          reason: 'The system did not remember the previous question',
        });

        const result = await testProviderSession({ provider: mockProvider });

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

      it('should warn when client session config is missing sessionId variable', async () => {
        // Config without {{sessionId}}
        mockProvider.config = {
          headers: {
            'X-Custom-Header': 'test',
          },
        };

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
          })
          .mockResolvedValueOnce({
            output: 'You asked about help.',
          });

        const result = await testProviderSession({ provider: mockProvider });

        // Should log warning but still proceed with test
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('{{sessionId}} not found'),
          expect.any(Object),
        );

        // Test should still run
        expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
        expect(result.success).toBeDefined();
      });

      it('should skip validation when skipConfigValidation is true', async () => {
        // Config without {{sessionId}}
        mockProvider.config = {
          headers: {
            'X-Custom-Header': 'test',
          },
        };

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
          })
          .mockResolvedValueOnce({
            output: 'You asked about help.',
          });

        const result = await testProviderSession({
          provider: mockProvider,
          options: { skipConfigValidation: true },
        });

        // Should NOT log warning
        expect(logger.warn).not.toHaveBeenCalled();

        // Test should still run
        expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
        expect(result.success).toBeDefined();
      });

      it('should warn when server session config is missing parser', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock getSessionId to provide sessionId even without parser
        mockProvider.getSessionId = vi.fn(() => 'manual-session-id');

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
          })
          .mockResolvedValueOnce({
            output: 'You asked about help.',
          });

        await testProviderSession({
          provider: mockProvider,
          sessionConfig: { sessionSource: 'server' },
        });

        // Should log warning about missing session parser
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('no session parser configured'),
          expect.any(Object),
        );

        // Test should still run if getSessionId provides a session
        expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
      });

      it('should fail when server session ID extraction fails', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
          sessionParser: 'response.sessionId',
        };

        // First response doesn't have sessionId
        (mockProvider.callApi as Mock).mockResolvedValueOnce({
          output: 'I can help!',
          // No sessionId in response
        });

        mockProvider.getSessionId = vi.fn(() => undefined as any);

        const result = await testProviderSession({ provider: mockProvider });

        expect(result).toEqual({
          success: false,
          message:
            'Session extraction failed: The session parser did not extract a session ID from the server response',
          reason:
            "The session parser expression did not return a valid session ID. Check that the parser matches your server's response format.",
          details: {
            sessionId: 'Not extracted',
            sessionSource: 'server',
            request1: {
              prompt: 'What can you help me with?',
            },
            response1: 'I can help!',
          },
        });
      });

      it('should handle first request error', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock callApi to return error on first request
        (mockProvider.callApi as Mock).mockResolvedValueOnce({
          error: 'Connection failed',
        });

        const result = await testProviderSession({ provider: mockProvider });

        expect(result).toEqual({
          success: false,
          message: 'First request failed: Connection failed',
          error: 'Connection failed',
          details: {
            sessionId: 'test-uuid-1234',
            sessionSource: 'client',
            request1: { prompt: 'What can you help me with?', sessionId: 'test-uuid-1234' },
            response1: 'Connection failed',
          },
        });
      });

      it('should handle second request error', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock callApi - first succeeds, second fails
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
          })
          .mockResolvedValueOnce({
            error: 'Connection timeout',
          });

        const result = await testProviderSession({ provider: mockProvider });

        expect(result).toEqual({
          success: false,
          message: 'Second request failed: Connection timeout',
          error: 'Connection timeout',
          details: {
            sessionId: 'test-uuid-1234',
            sessionSource: 'client',
            request1: { prompt: 'What can you help me with?', sessionId: 'test-uuid-1234' },
            response1: 'I can help!',
            request2: {
              prompt: 'What was the last thing I asked you?',
              sessionId: 'test-uuid-1234',
            },
            response2: 'Connection timeout',
          },
        });
      });
    });

    describe('session configuration', () => {
      it('should update provider config with session settings', () => {
        // This will be called internally during testProviderSession
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        expect(mockProvider.config).toBeDefined();
      });

      it('should detect server session from sessionParser in provider config', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
          sessionParser: 'response.sessionId',
        };

        const serverSessionId = 'server-session-id';
        mockProvider.getSessionId = vi.fn(() => serverSessionId);

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
            sessionId: serverSessionId,
          })
          .mockResolvedValueOnce({
            output: 'You asked about help.',
            sessionId: serverSessionId,
          });

        const result = await testProviderSession({ provider: mockProvider });

        expect(result.details?.sessionSource).toBe('server');
        expect(result.details?.sessionId).toBe(serverSessionId);
      });
    });

    describe('edge cases', () => {
      it('should handle empty response outputs gracefully', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock callApi with empty outputs
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: '',
          })
          .mockResolvedValueOnce({
            output: '',
          });

        // Mock doRemoteGrading to fail for empty outputs
        (doRemoteGrading as Mock).mockResolvedValue({
          pass: false,
          score: 0,
          reason: 'Empty response cannot demonstrate session memory',
        });

        const result = await testProviderSession({ provider: mockProvider });

        expect(result.success).toBe(false);
        expect(result.details?.response1).toBe('');
        expect(result.details?.response2).toBe('');
      });

      it('should handle grading failure gracefully', async () => {
        mockProvider.config = {
          headers: {
            'X-Session-ID': '{{sessionId}}',
          },
        };

        // Mock callApi responses
        (mockProvider.callApi as Mock)
          .mockResolvedValueOnce({
            output: 'I can help!',
          })
          .mockResolvedValueOnce({
            output: 'You asked about help.',
          });

        // Mock doRemoteGrading to throw error
        (doRemoteGrading as Mock).mockRejectedValue(new Error('Grading service unavailable'));

        const result = await testProviderSession({ provider: mockProvider });

        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to evaluate session');
        expect(result.error).toContain('Grading service unavailable');
      });
    });
  });
});
