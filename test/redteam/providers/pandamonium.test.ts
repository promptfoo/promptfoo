// We are mocking the dynamic import of runEval inside callTarget.
import { runEval } from '../../../src/evaluator';
import { fetchWithRetries } from '../../../src/fetch';
import RedteamPandamoniumProvider from '../../../src/redteam/providers/pandamonium';
import type { AtomicTestCase, RunEvalOptions } from '../../../src/types';

jest.mock('../../../src/evaluator', () => ({
  runEval: jest.fn(),
}));
jest.mock('../../../src/fetch', () => ({
  fetchWithRetries: jest.fn(),
}));
// Dummy target provider stub
const dummyTargetProvider = { id: jest.fn(), callApi: jest.fn() };

describe('RedteamPandamoniumProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should terminate loop when no test cases returned from /next endpoint', async () => {
    // Create a minimal dummy test
    const dummyTest: AtomicTestCase = {
      vars: { example: 'dummy prompt', harmCateogry: 'dummy' },
      metadata: { pluginId: 'dummyPlugin' },
    };

    // Construct a dummy RunEvalOptions object with all required properties.
    const allTests: RunEvalOptions[] = [
      {
        test: dummyTest,
        provider: dummyTargetProvider, // Required field
        prompt: { raw: 'dummy prompt', label: 'dummy prompt' },
        delay: 0, // Required field (set delay to 0 for testing)
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: true,
      },
    ];

    // Instantiate the provider
    const provider = new RedteamPandamoniumProvider({ injectVar: 'example' });

    // For runPandamonium, we expect two calls to fetchWithRetries:
    // 1. /start endpoint
    // 2. /next endpoint (which returns no test cases so that the loop breaks)
    const startResponse = {
      ok: true,
      json: async () => ({
        id: 'run123',
        iteration: 0,
        pendingPlugins: [],
        version: 1,
      }),
    };

    const nextResponse = {
      ok: true,
      json: async () => ({
        id: 'run123',
        iteration: 1,
        pendingPlugins: [],
        testCases: [],
      }),
    };

    jest
      .mocked(fetchWithRetries)
      .mockResolvedValueOnce(startResponse as any) // for /start
      .mockResolvedValueOnce(nextResponse as any); // for /next

    const results = await provider.runPandamonium(dummyTargetProvider, dummyTest, allTests);
    expect(results).toEqual([]);

    // Verify that /start and /next endpoints were called.
    const calls = jest.mocked(fetchWithRetries).mock.calls;
    expect(calls.some((call) => (call[0] as string).includes('/start'))).toBe(true);
    expect(calls.some((call) => (call[0] as string).includes('/next'))).toBe(true);
  });

  it('should call target provider with test cases and aggregate results, triggering success', async () => {
    const dummyTest: AtomicTestCase = {
      vars: { example: 'dummy prompt', harmCateogry: 'dummy' },
      metadata: { pluginId: 'dummyPlugin' },
    };

    const allTests: RunEvalOptions[] = [
      {
        test: dummyTest,
        provider: dummyTargetProvider,
        prompt: { raw: 'dummy prompt', label: 'dummy prompt' },
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: true,
      },
    ];

    // Set maxTurns to 2 to limit the iterations of the pandamonium loop.
    const provider = new RedteamPandamoniumProvider({ injectVar: 'example', maxTurns: 2 });

    // Set up sequential mocked responses for the network calls via fetchWithRetries:
    // 1. For the /start endpoint.
    // 2. First call to /next returns a test case.
    // 3. The /success endpoint call.
    // 4. Second call to /next returns no test cases, breaking the loop.
    const startResponse = {
      ok: true,
      json: async () => ({
        id: 'run123',
        iteration: 0,
        pendingPlugins: ['dummyPlugin'],
        version: 1,
      }),
    };

    const nextResponse1 = {
      ok: true,
      json: async () => ({
        id: 'run123',
        iteration: 1,
        pendingPlugins: [],
        testCases: [
          {
            pluginId: 'dummyPlugin',
            prompt: 'dummy prompt',
            program: 'dummy program',
            testIdx: 0,
          },
        ],
      }),
    };

    const successResponse = {
      ok: true,
      json: async () => ({}),
    };

    const nextResponse2 = {
      ok: true,
      json: async () => ({
        id: 'run123',
        iteration: 2,
        pendingPlugins: [],
        testCases: [],
      }),
    };

    jest
      .mocked(fetchWithRetries)
      .mockResolvedValueOnce(startResponse as any) // /start
      .mockResolvedValueOnce(nextResponse1 as any) // first /next call
      .mockResolvedValueOnce(successResponse as any) // /success
      .mockResolvedValueOnce(nextResponse2 as any); // second /next call

    // Mock runEval to simulate evaluation.
    // The provider's callTarget function expects runEval to return an array with an EvaluateResult.
    jest.mocked(runEval).mockResolvedValue([
      {
        success: false,
        prompt: { raw: 'result prompt', label: 'result prompt' },
        gradingResult: { pass: false, score: 0, reason: 'dummy reason' },
        promptIdx: 0,
        testIdx: 0,
        testCase: dummyTest,
        promptId: 'dummyPlugin',
        score: 0,
        isRedteam: true,
      } as any,
    ]);

    const results = await provider.runPandamonium(dummyTargetProvider, dummyTest, allTests);

    // Updated expectation: the function returns the full EvaluateResult object as returned by runEval.
    expect(results).toEqual([
      {
        success: false,
        prompt: { raw: 'result prompt', label: 'result prompt' },
        gradingResult: { pass: false, score: 0, reason: 'dummy reason' },
        promptIdx: 0,
        testIdx: 0,
        testCase: dummyTest,
        promptId: 'dummyPlugin',
        score: 0,
        isRedteam: true,
      },
    ]);

    // Verify that runEval was invoked with the test provider and result prompt
    expect(runEval).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: dummyTargetProvider,
        prompt: { raw: 'dummy prompt', label: 'dummy prompt' },
      }),
    );

    // Confirm that /start, /next, and /success endpoints were called.
    const calls = jest.mocked(fetchWithRetries).mock.calls;
    expect(calls.some((call) => (call[0] as string).includes('/start'))).toBe(true);
    expect(calls.some((call) => (call[0] as string).includes('/next'))).toBe(true);
    expect(calls.some((call) => (call[0] as string).includes('/success'))).toBe(true);
  });

  it('should handle error during pandamonium run gracefully', async () => {
    const dummyTest: AtomicTestCase = {
      vars: { example: 'dummy prompt', harmCateogry: 'dummy' },
      metadata: { pluginId: 'dummyPlugin' },
    };
    const allTests: RunEvalOptions[] = [
      {
        test: dummyTest,
        provider: dummyTargetProvider,
        prompt: { raw: 'dummy prompt', label: 'dummy prompt' },
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: true,
      },
    ];

    const provider = new RedteamPandamoniumProvider({ injectVar: 'example' });

    // Simulate a network error during the /start endpoint.
    jest.mocked(fetchWithRetries).mockRejectedValueOnce(new Error('Network error'));

    const results = await provider.runPandamonium(dummyTargetProvider, dummyTest, allTests);
    // On error, an empty result array should be returned.
    expect(results).toEqual([]);
  });
});
