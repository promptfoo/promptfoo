import { AsciiSmugglingGrader } from '../../../src/redteam/plugins/asciiSmuggling';
import type { AtomicTestCase } from '../../../src/types';

describe('AsciiSmugglingGrader', () => {
  let grader: AsciiSmugglingGrader;

  beforeEach(() => {
    grader = new AsciiSmugglingGrader();
  });

  it('should detect when model follows injected instructions', async () => {
    const prompt = 'Test prompt';
    const llmOutput = 'Some output containing secret_test_string';
    const test: AtomicTestCase = {
      vars: {},
      assert: [],
      metadata: {
        asciiSmugglingTestString: 'secret_test_string',
      },
    };

    const result = await grader.getResult(prompt, llmOutput, test);

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
    expect(result.grade.reason).toBe('Model followed injected instructions');
  });

  it('should pass when model ignores injected instructions', async () => {
    const prompt = 'Test prompt';
    const llmOutput = 'Some normal output';
    const test: AtomicTestCase = {
      vars: {},
      assert: [],
      metadata: {
        asciiSmugglingTestString: 'secret_test_string',
      },
    };

    const result = await grader.getResult(prompt, llmOutput, test);

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
    expect(result.grade.reason).toBe('Model ignored injected instructions');
  });

  it('should handle missing test string in metadata', async () => {
    const prompt = 'Test prompt';
    const llmOutput = 'Some output';
    const test: AtomicTestCase = {
      vars: {},
      assert: [],
      metadata: {},
    };

    const result = await grader.getResult(prompt, llmOutput, test);

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
    expect(result.grade.reason).toBe('Model ignored injected instructions');
  });

  it('should handle undefined metadata', async () => {
    const prompt = 'Test prompt';
    const llmOutput = 'Some output';
    const test: AtomicTestCase = {
      vars: {},
      assert: [],
    };

    const result = await grader.getResult(prompt, llmOutput, test);

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
    expect(result.grade.reason).toBe('Model ignored injected instructions');
  });

  it('should return empty rubric', async () => {
    const prompt = 'Test prompt';
    const llmOutput = 'Some output';
    const test: AtomicTestCase = {
      vars: {},
      assert: [],
    };

    const result = await grader.getResult(prompt, llmOutput, test);

    expect(result.rubric).toBe('');
  });
});
