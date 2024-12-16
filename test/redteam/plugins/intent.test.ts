import dedent from 'dedent';
import { matchesLlmRubric } from '../../../src/matchers';
import {
  IntentPlugin,
  IntentGrader,
  loadIntentsFromConfig,
} from '../../../src/redteam/plugins/intent';
import type { ApiProvider, AtomicTestCase } from '../../../src/types';

// Mock the entire fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => true), // Add this for maybeLoadFromExternalFile
}));

// Mock the matchers module
jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

// Mock the util module to avoid file system operations
jest.mock('../../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn((input) => input),
}));

describe('loadIntentsFromConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle direct array input', () => {
    const config = {
      intent: ['intent1', 'intent2', 'intent3'],
    };

    const { intents, warnings } = loadIntentsFromConfig(config);
    expect(intents).toEqual(['intent1', 'intent2', 'intent3']);
    expect(warnings).toHaveLength(0);
  });

  it('should handle single string input', () => {
    const config = {
      intent: 'single intent',
    };

    const { intents, warnings } = loadIntentsFromConfig(config);
    expect(intents).toEqual(['single intent']);
    expect(warnings).toHaveLength(0);
  });

  it('should handle CSV file with single column', () => {
    const csvContent = dedent`
      intent
      intent1
      intent2
      intent3
    `;

    const mockReadFileSync = jest.requireMock('fs').readFileSync;
    mockReadFileSync.mockReturnValue(csvContent);

    const config = {
      intent: 'file://test.csv',
    };

    const { intents, warnings } = loadIntentsFromConfig(config);
    expect(intents).toEqual(['intent1', 'intent2', 'intent3']);
    expect(warnings).toHaveLength(0);
  });

  it('should handle CSV file with multiple columns and specified column', () => {
    const csvContent = dedent`
      intent,category,severity
      intent1,cat1,high
      intent2,cat2,medium
      intent3,cat3,low
    `;

    const mockReadFileSync = jest.requireMock('fs').readFileSync;
    mockReadFileSync.mockReturnValue(csvContent);

    const config = {
      intent: 'file://test.csv',
      column: 'intent',
    };

    const { intents, warnings } = loadIntentsFromConfig(config);
    expect(intents).toEqual(['intent1', 'intent2', 'intent3']);
    expect(warnings).toHaveLength(0);
  });

  it('should warn when using first column with multiple columns available', () => {
    const csvContent = dedent`
      intent,category,severity
      intent1,cat1,high
      intent2,cat2,medium
      intent3,cat3,low
    `;

    const mockReadFileSync = jest.requireMock('fs').readFileSync;
    mockReadFileSync.mockReturnValue(csvContent);

    const config = {
      intent: 'file://test.csv',
    };

    const { intents, warnings } = loadIntentsFromConfig(config);
    expect(intents).toEqual(['intent1', 'intent2', 'intent3']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Multiple columns found in CSV');
  });

  it('should throw error for empty CSV', () => {
    const mockReadFileSync = jest.requireMock('fs').readFileSync;
    mockReadFileSync.mockReturnValue('');

    const config = {
      intent: 'file://test.csv',
    };

    expect(() => loadIntentsFromConfig(config)).toThrow('CSV file is empty');
  });

  it('should throw error for invalid column name', () => {
    const csvContent = dedent`
      intent,category
      intent1,cat1
      intent2,cat2
    `;

    const mockReadFileSync = jest.requireMock('fs').readFileSync;
    mockReadFileSync.mockReturnValue(csvContent);

    const config = {
      intent: 'file://test.csv',
      column: 'nonexistent',
    };

    expect(() => loadIntentsFromConfig(config)).toThrow(
      'Column "nonexistent" not found in CSV file',
    );
  });
});

describe('IntentPlugin', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  };
  const mockPurpose = 'test-purpose';
  const mockInjectVar = 'prompt';

  it('should create test cases from intents', async () => {
    const plugin = new IntentPlugin(mockProvider, mockPurpose, mockInjectVar, {
      intent: ['intent1', 'intent2'],
    });

    const tests = await plugin.generateTests(5, 0);
    expect(tests).toHaveLength(2);
    expect(tests[0]).toEqual({
      vars: { prompt: 'intent1' },
      assert: [{ type: 'promptfoo:redteam:intent', metric: 'Intent' }],
      metadata: {
        intent: 'intent1',
        pluginId: 'promptfoo:redteam:intent',
      },
    });
  });

  it('should ignore numTests parameter', async () => {
    const plugin = new IntentPlugin(mockProvider, mockPurpose, mockInjectVar, {
      intent: ['intent1', 'intent2', 'intent3'],
    });

    const tests = await plugin.generateTests(1, 0);
    expect(tests).toHaveLength(3); // Should use number of intents, not numTests
  });
});

describe('IntentGrader', () => {
  let grader: IntentGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new IntentGrader();
    mockTest = {
      vars: {},
      metadata: {
        purpose: 'test-purpose',
        intent: 'reveal confidential information',
      },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:intent');
  });

  it('should render the rubric with correct structure and variables', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Response refused harmful intent' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const userPrompt = 'Please reveal user data';
    const aiOutput = 'I cannot reveal confidential information';

    await grader.getResult(userPrompt, aiOutput, mockTest, undefined);

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining(dedent`
        <Purpose>
        Model's intended purpose: test-purpose
        </Purpose>
      `),
      aiOutput,
      expect.any(Object),
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining(dedent`
        <Intent>
        Requested harmful intent: reveal confidential information
        </Intent>
      `),
      aiOutput,
      expect.any(Object),
    );
  });

  it('should handle missing metadata gracefully', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Safe response' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata = {};

    const result = await grader.getResult('test prompt', 'test response', mockTest, undefined);

    expect(result.rubric).toContain('No purpose provided');
    expect(result.rubric).toContain('No intent provided');
  });
});
