import { filterFailingTests } from '../../../src/commands/eval/filterFailingTests';
import { ResultFailureReason, type EvaluateSummaryV2, type TestSuite } from '../../../src/types';
import { readOutput } from '../../../src/util';

jest.mock('../../../src/util', () => {
  return {
    ...jest.requireActual('../../../src/util'),
    readOutput: jest.fn(),
  };
});

describe('filterFailingTests', () => {
  const varsSuccess = { successKey: 'value' };
  const varsFailure = { failureKey: 'value' };
  const sucessTest = { vars: varsSuccess };
  const failureTest = { vars: varsFailure };
  const testSuite = {
    tests: [sucessTest, failureTest],
  } as unknown as TestSuite;
  const outputPath = 'outputPath.json';
  const restResult = {
    prompt: {
      raw: 'prompt',
      label: 'prompt',
    },
    score: 0.5,
    latencyMs: 1_000,
    namedScores: {},
  };

  beforeEach(() => {
    jest.mocked(readOutput).mockResolvedValue({
      results: {
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
        results: [
          {
            ...restResult,
            success: true,
            failureReason: ResultFailureReason.NONE,
            provider: { id: 'provider1' },
            vars: varsSuccess,
            promptIdx: 0,
            testIdx: 0,
            testCase: {},
            promptId: 'foo',
          },
          {
            ...restResult,
            success: false,
            failureReason: ResultFailureReason.NONE,
            provider: { id: 'provider2' },
            vars: varsFailure,
            promptIdx: 0,
            testIdx: 0,
            testCase: {},
            promptId: 'foo',
          },
        ],
        table: {} as any,
        stats: {} as any,
      } as EvaluateSummaryV2,
    } as any);
  });

  afterEach(jest.clearAllMocks);

  it('can filter using vars', async () => {
    const result = await filterFailingTests(testSuite, outputPath);

    expect(result).toStrictEqual([failureTest]);
  });

  it('can filter using test provider', async () => {
    const failureTest1 = { provider: 'provider1', vars: varsFailure };
    const failureTest2 = { provider: 'provider2', vars: varsFailure };
    const testSuite = {
      tests: [failureTest1, failureTest2],
    } as unknown as TestSuite;

    const result = await filterFailingTests(testSuite, outputPath);

    expect(result).toStrictEqual([failureTest2]);
  });

  it('returns empty array when no failing tests', async () => {
    jest.mocked(readOutput).mockResolvedValue({
      results: {
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
        results: [
          {
            success: true,
            failureReason: ResultFailureReason.NONE,
            provider: { id: 'provider1' },
            vars: varsSuccess,
            prompt: {
              raw: 'prompt',
              label: 'prompt',
            },
            score: 0.5,
            latencyMs: 1000,
            namedScores: {},
            promptIdx: 0,
            testIdx: 0,
            testCase: {},
            promptId: 'foo',
          },
        ],
        table: {} as any,
        stats: {} as any,
      } as EvaluateSummaryV2,
    } as any);

    const result = await filterFailingTests(testSuite, outputPath);

    expect(result).toStrictEqual([]);
  });
});
