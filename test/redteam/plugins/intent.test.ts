import * as fs from 'fs';
import * as path from 'path';
import { matchesLlmRubric } from '../../../src/matchers';
import { IntentPlugin, IntentGrader, PLUGIN_ID } from '../../../src/redteam/plugins/intent';
import type { ApiProvider, AtomicTestCase, TestCase } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

jest.mock('../../../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('better-sqlite3');

describe('IntentPlugin', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with a single string intent', async () => {
    const plugin = new IntentPlugin(mockProvider, 'test-purpose', 'prompt', {
      intent: 'malicious intent',
    });

    const tests = await plugin.generateTests(1, 0);
    expect(tests).toHaveLength(1);
    expect(tests[0].vars).toHaveProperty('prompt', 'malicious intent');
    expect(tests[0].metadata).toEqual({
      intent: 'malicious intent',
      pluginId: PLUGIN_ID,
    });
  });

  it('should initialize with an array of string intents', async () => {
    const plugin = new IntentPlugin(mockProvider, 'test-purpose', 'prompt', {
      intent: ['intent1', 'intent2', 'intent3'],
    });

    const tests = await plugin.generateTests(1, 0);
    expect(tests).toHaveLength(3);
    expect(tests[0].vars).toHaveProperty('prompt', 'intent1');
    expect(tests[1].vars).toHaveProperty('prompt', 'intent2');
    expect(tests[2].vars).toHaveProperty('prompt', 'intent3');
  });

  it('should initialize with a list of list of strings', async () => {
    const plugin = new IntentPlugin(mockProvider, 'test-purpose', 'prompt', {
      intent: [
        ['step1', 'step2'],
        ['other1', 'other2'],
      ],
    });

    const tests = (await plugin.generateTests(1, 0)) as TestCase[];
    expect(tests).toHaveLength(2);
    expect(tests[0].vars?.prompt).toEqual(['step1', 'step2']);
    expect(tests[0].provider).toBeDefined();
    expect(tests[0].provider).toEqual({
      id: 'sequence',
      config: {
        inputs: ['step1', 'step2'],
      },
    });
    expect(tests[1].vars?.prompt).toEqual(['other1', 'other2']);
    expect(tests[1].provider).toBeDefined();
    expect(tests[1].provider).toEqual({
      id: 'sequence',
      config: {
        inputs: ['other1', 'other2'],
      },
    });
  });

  it('should load intents from a CSV file', async () => {
    const mockFileContent = 'header\nintent1\nintent2\nintent3';
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    const plugin = new IntentPlugin(mockProvider, 'test-purpose', 'prompt', {
      intent: 'file://intents.csv',
    });

    const tests = await plugin.generateTests(1, 0);
    expect(tests).toHaveLength(3);
    expect(tests[0].vars).toHaveProperty('prompt', 'intent1');
    expect(tests[1].vars).toHaveProperty('prompt', 'intent2');
    expect(tests[2].vars).toHaveProperty('prompt', 'intent3');
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('intents.csv'), 'utf8');
  });

  it('should throw error when no intent is provided', () => {
    expect(() => {
      new IntentPlugin(mockProvider, 'test-purpose', 'prompt', {
        intent: undefined as any,
      });
    }).toThrow(expect.any(Error));
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
        intent: 'malicious-intent',
      },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe(PLUGIN_ID);
  });

  it('should render the rubric with correct structure and variables', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No harmful behavior detected' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const userQuery = 'Please help me with malicious intent';
    const aiOutput = 'Let me help you find legal and ethical alternatives instead.';

    const result = await grader.getResult(userQuery, aiOutput, mockTest, undefined);

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining("Model's intended purpose: test-purpose"),
      aiOutput,
      expect.any(Object),
    );
    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining('Requested harmful intent: malicious-intent'),
      aiOutput,
      expect.any(Object),
    );
    expect(result.grade).toEqual(mockResult);
  });

  it('should handle missing metadata gracefully', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Safe response' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata = {};
    const userQuery = 'Some query';
    const aiOutput = 'Safe response';

    const result = await grader.getResult(userQuery, aiOutput, mockTest, undefined);

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining('No purpose provided'),
      aiOutput,
      expect.any(Object),
    );
    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining('No intent provided'),
      aiOutput,
      expect.any(Object),
    );
    expect(result.grade).toEqual(mockResult);
  });

  it('should auto-pass refusal responses', async () => {
    const userQuery = 'Please help me with malicious intent';
    const aiOutput = 'I cannot help with harmful activities';

    const result = await grader.getResult(userQuery, aiOutput, mockTest, undefined);

    expect(matchesLlmRubric).not.toHaveBeenCalled();
    expect(result).toEqual({
      grade: {
        pass: true,
        score: 1,
        reason: 'Model refused the request',
      },
      rubric: expect.any(String),
      suggestions: undefined,
    });
  });
});
