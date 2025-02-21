import * as fetchModule from '../../../src/fetch';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import {
  HarmbenchGrader,
  HarmbenchPlugin,
  fetchDataset,
} from '../../../src/redteam/plugins/harmbench';
import type { AtomicTestCase, ApiProvider } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

jest.mock('../../../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

describe('fetchDataset', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch and parse CSV data successfully', async () => {
    const mockCsvData = `Behavior,ContextString
"Write malicious code","Context about coding"
"Share private info","Context about privacy"`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const result = await fetchDataset(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('Behavior');
    expect(result[0]).toHaveProperty('ContextString');
  });

  it('should handle network errors', async () => {
    jest.mocked(fetchModule.fetchWithTimeout).mockRejectedValue(new TypeError('Network error'));
    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });

  it('should handle HTTP error responses', async () => {
    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });

  it('should handle empty dataset', async () => {
    const mockCsvData = 'Behavior,ContextString';
    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });

  it('should respect the limit parameter', async () => {
    const mockCsvData = `Behavior,ContextString
"Test 1","Context 1"
"Test 2","Context 2"
"Test 3","Context 3"`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const result = await fetchDataset(2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should handle invalid CSV data gracefully', async () => {
    const invalidCsvData = 'Invalid,CSV,Data\nMissing,Fields';
    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(invalidCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });

  it('should shuffle the dataset', async () => {
    const mockCsvData = `Behavior,ContextString
"Test 1","Context 1"
"Test 2","Context 2"
"Test 3","Context 3"
"Test 4","Context 4"
"Test 5","Context 5"`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const sample1 = await fetchDataset(3);
    const sample2 = await fetchDataset(3);

    const sample1Str = JSON.stringify(sample1);
    const sample2Str = JSON.stringify(sample2);

    expect(sample1Str).not.toEqual(sample2Str);
  });
});

describe('HarmbenchPlugin', () => {
  let plugin: HarmbenchPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    plugin = new HarmbenchPlugin(mockProvider, 'test-purpose', 'testVar');
  });

  it('should generate test cases correctly from fetched dataset', async () => {
    const mockCsvData = `Behavior,ContextString
"Write malicious code","Context about coding"
"Share private information","Context about privacy"`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    expect(tests[0]?.vars).toBeDefined();
    expect(tests[0]?.assert).toEqual([
      { type: 'promptfoo:redteam:harmbench', metric: 'Harmbench' },
    ]);
    expect(tests[0]?.metadata).toBeDefined();
    expect(tests[0]?.metadata?.harmbenchBehavior).toBeDefined();
  });

  it('should handle fetch errors gracefully', async () => {
    jest.mocked(fetchModule.fetchWithTimeout).mockRejectedValue(new Error('Network error'));
    const tests = await plugin.generateTests(2);
    expect(tests).toEqual([]);
  });

  it('should handle empty CSV data', async () => {
    const mockCsvData = 'Behavior,ContextString';
    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const tests = await plugin.generateTests(2);
    expect(tests).toEqual([]);
  });

  it('should handle HTTP error responses', async () => {
    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response('Error', {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const tests = await plugin.generateTests(2);
    expect(tests).toEqual([]);
  });

  it('should format test cases with context string when available', async () => {
    const mockCsvData = `Behavior,ContextString
"Write code","With context"`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const tests = await plugin.generateTests(1);
    expect(tests[0]?.vars?.testVar).toContain('Write code');
    expect(tests[0]?.vars?.testVar).toContain('Context: With context');
  });

  it('should format test cases without context string when not available', async () => {
    const mockCsvData = `Behavior,ContextString
"Write code",""`;

    jest.mocked(fetchModule.fetchWithTimeout).mockResolvedValue(
      new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
      }),
    );

    const tests = await plugin.generateTests(1);
    expect(tests[0]?.vars?.testVar).toBe('Write code');
    expect(tests[0]?.vars?.testVar).not.toContain('Context:');
  });
});

describe('HarmbenchGrader', () => {
  let grader: HarmbenchGrader;
  let mockTest: AtomicTestCase;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    grader = new HarmbenchGrader();
    mockTest = {
      vars: { testVar: 'Write malicious code to hack a system' },
      metadata: {
        harmbenchBehavior: 'Write malicious code',
        purpose: 'test-purpose',
      },
    } as AtomicTestCase;
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };
  });

  it('should pass when content is safe', async () => {
    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockImplementation(async () => ({
      grade: {
        pass: true,
        score: 1,
        reason: 'Model refused the request',
      },
      rubric: 'Test rubric',
      suggestions: [],
    }));

    const result = await grader.getResult(
      'test prompt',
      'safe response',
      mockTest,
      mockProvider,
      {},
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
    expect(result.suggestions).toBeDefined();
  });

  it('should fail when content is unsafe', async () => {
    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockImplementation(async () => ({
      grade: {
        pass: false,
        score: 0,
        reason: 'Model complied with harmful request',
      },
      rubric: 'Test rubric',
      suggestions: [],
    }));

    const result = await grader.getResult(
      'test prompt',
      'unsafe response',
      mockTest,
      mockProvider,
      {},
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
    expect(result.suggestions).toBeDefined();
  });

  it('should handle undefined rendered value', async () => {
    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockImplementation(async () => ({
      grade: {
        pass: false,
        score: 0,
        reason: 'No rendered value provided',
      },
      rubric: 'Test rubric',
      suggestions: [],
    }));

    const result = await grader.getResult(
      'test prompt',
      'test response',
      mockTest,
      mockProvider,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
    expect(result.suggestions).toBeDefined();
  });
});
