import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import * as pythonUtils from '../../src/python/pythonUtils';
import { runPython } from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';

import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types/index';

vi.mock('../../src/python/wrapper', async () => {
  const actual = await vi.importActual<typeof import('../../src/python/wrapper')>(
    '../../src/python/wrapper',
  );
  return {
    ...actual,
    runPythonCode: vi.fn(actual.runPythonCode),
  };
});

vi.mock('../../src/python/pythonUtils', async () => {
  const actual = await vi.importActual<typeof import('../../src/python/pythonUtils')>(
    '../../src/python/pythonUtils',
  );
  return {
    ...actual,
    runPython: vi.fn(actual.runPython),
  };
});

vi.mock('path', async () => {
  const actualPath = await vi.importActual<typeof import('path')>('path');
  const mocked = {
    ...actualPath,
    resolve: vi.fn(),
    extname: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

// These tests can be slow on Windows due to heavy module imports
describe('Python file references', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocked implementations to avoid test interference
    vi.mocked(runPythonCode).mockReset();
    vi.mocked(runPython).mockReset();
    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
  });

  it('should handle Python file reference with function name', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py:custom_function',
    };

    const mockOutput = true;
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockResolvedValue(mockOutput);

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPython).toHaveBeenCalledWith('/path/to/assert.py', 'custom_function', [
      output,
      expect.any(Object),
    ]);
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should correctly pass configuration to a python assert', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
      config: {
        foo: 'bar',
      },
    };

    const mockOutput = true;
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockResolvedValue(mockOutput);

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPython).toHaveBeenCalledWith('/path/to/assert.py', 'get_assert', [
      output,
      expect.objectContaining({
        config: {
          foo: 'bar',
        },
      }),
    ]);
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should use default function name for Python when none specified', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
    };

    const mockOutput = true;
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockResolvedValue(mockOutput);

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPython).toHaveBeenCalledWith('/path/to/assert.py', 'get_assert', [
      output,
      expect.any(Object),
    ]);
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should handle Python assertion errors', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py:custom_function',
    };

    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockRejectedValue(new Error('Python error'));

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'Python error',
    });
  });

  it('should handle Python returning a score', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
    };

    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockResolvedValue(0.75);

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.75,
      reason: 'Assertion passed',
    });
  });

  it('should handle output strings with both single and double quotes correctly in python assertion', async () => {
    const expectedPythonValue = '0.5';

    vi.mocked(runPythonCode).mockResolvedValueOnce(expectedPythonValue);

    const output =
      'This is a string with "double quotes"\n and \'single quotes\' \n\n and some \n\t newlines.';

    const pythonAssertion: Assertion = {
      type: 'python',
      value: expectedPythonValue,
    };

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: pythonAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPythonCode).toHaveBeenCalledTimes(1);
    expect(runPythonCode).toHaveBeenCalledWith(expect.anything(), 'main', [
      output,
      { prompt: 'Some prompt', test: {}, vars: {}, provider, providerResponse },
    ]);

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
      score: Number(expectedPythonValue),
    });
  });

  it.each([
    ['boolean', false, 0, 'Python code returned false', false, undefined],
    ['number', 0, 0, 'Python code returned false', false, undefined],
    [
      'GradingResult',
      `{"pass": false, "score": 0, "reason": "Custom error"}`,
      0,
      'Custom error',
      false,
      undefined,
    ],
    ['boolean', true, 1, 'Assertion passed', true, undefined],
    ['number', 1, 1, 'Assertion passed', true, undefined],
    [
      'GradingResult',
      // This score is less than the assertion threshold in the test
      `{"pass": true, "score": 0.4, "reason": "Foo bar"}`,
      0.4,
      'Python score 0.4 is less than threshold 0.5: Foo bar',
      false,
      0.5,
    ],
  ])('should handle inline return type %s with return value: %p', async (type, returnValue, expectedScore, expectedReason, expectedPass, threshold) => {
    const output =
      'This is a string with "double quotes"\n and \'single quotes\' \n\n and some \n\t newlines.';

    let resolvedValue;
    if (type === 'GradingResult') {
      resolvedValue = JSON.parse(returnValue as string);
    } else {
      resolvedValue = returnValue;
    }

    const pythonAssertion: Assertion = {
      type: 'python',
      value: returnValue.toString(),
      threshold,
    };

    vi.mocked(runPythonCode).mockResolvedValueOnce(resolvedValue);

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: pythonAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPythonCode).toHaveBeenCalledTimes(1);
    expect(runPythonCode).toHaveBeenCalledWith(expect.anything(), 'main', [
      output,
      { prompt: 'Some prompt', test: {}, vars: {}, provider, providerResponse },
    ]);

    expect(result).toMatchObject({
      pass: expectedPass,
      reason: expect.stringMatching(expectedReason),
      score: expectedScore,
    });
  });

  it.each([
    ['boolean', 'True', true, 'Assertion passed'],
    ['number', '0.5', true, 'Assertion passed'],
    ['boolean', true, true, 'Assertion passed'],
    ['number', 0.5, true, 'Assertion passed'],
    [
      'GradingResult',
      '{"pass": true, "score": 1, "reason": "Custom reason"}',
      true,
      'Custom reason',
    ],
    ['boolean', 'False', false, 'Python code returned false'],
    ['number', '0', false, 'Python code returned false'],
    [
      'GradingResult',
      '{"pass": false, "score": 0, "reason": "Custom reason"}',
      false,
      'Custom reason',
    ],
  ])('should handle when the file:// assertion with .py file returns a %s', async (_type, pythonOutput, expectedPass, expectedReason) => {
    const output = 'Expected output';
    vi.mocked(runPython).mockResolvedValueOnce(pythonOutput as string | object);
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');

    const fileAssertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
    };

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt that includes "double quotes" and \'single quotes\'',
      provider,
      assertion: fileAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(runPython).toHaveBeenCalledWith('/path/to/assert.py', 'get_assert', [
      output,
      {
        prompt: 'Some prompt that includes "double quotes" and \'single quotes\'',
        vars: {},
        test: {},
        provider,
        providerResponse,
      },
    ]);

    expect(result).toMatchObject({
      pass: expectedPass,
      reason: expect.stringContaining(expectedReason),
    });
    expect(runPython).toHaveBeenCalledTimes(1);
  });

  it('should handle when python file assertions throw an error', async () => {
    const output = 'Expected output';
    // Must mock path.resolve and path.extname to ensure test isolation
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockRejectedValue(
      new Error('The Python script `call_api` function must return a dict with an `output`'),
    );
    const fileAssertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
    };
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt that includes "double quotes" and \'single quotes\'',
      provider,
      assertion: fileAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });
    expect(runPython).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      assertion: {
        type: 'python',
        value: 'file:///path/to/assert.py',
      },
      pass: false,
      reason: 'The Python script `call_api` function must return a dict with an `output`',
      score: 0,
    });
  });

  it('should map snake_case keys from python dataclass to camelCase', async () => {
    const pythonResult = {
      pass_: true,
      score: 1,
      reason: 'ok',
      named_scores: { accuracy: 0.9 },
      tokens_used: { total: 100, prompt: 60, completion: 40 },
      component_results: [
        {
          pass_: true,
          score: 0.8,
          reason: 'component 1 ok',
          named_scores: { precision: 0.85 },
        },
        {
          pass_: false,
          score: 0.2,
          reason: 'component 2 failed',
          named_scores: { recall: 0.15 },
          component_results: [
            {
              pass_: true,
              score: 0.9,
              reason: 'nested component ok',
              named_scores: { f1: 0.7 },
            },
          ],
        },
      ],
    };

    // Must mock path.resolve and path.extname to ensure test isolation
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    vi.mocked(path.extname).mockReturnValue('.py');
    vi.mocked(runPython).mockResolvedValueOnce(pythonResult as any);

    const fileAssertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py',
    };
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output: 'Expected output' };

    const result: GradingResult = await runAssertion({
      prompt: 'A prompt',
      provider,
      assertion: fileAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
      reason: 'ok',
      namedScores: { accuracy: 0.9 },
      tokensUsed: { total: 100, prompt: 60, completion: 40 },
      componentResults: [
        {
          pass: true,
          score: 0.8,
          reason: 'component 1 ok',
          namedScores: { precision: 0.85 },
        },
        {
          pass: false,
          score: 0.2,
          reason: 'component 2 failed',
          namedScores: { recall: 0.15 },
          componentResults: [
            {
              pass: true,
              score: 0.9,
              reason: 'nested component ok',
              namedScores: { f1: 0.7 },
            },
          ],
        },
      ],
    });

    // Verify original object wasn't mutated
    expect(pythonResult).not.toHaveProperty('pass');
    expect(pythonResult).not.toHaveProperty('namedScores');
    expect(pythonResult).not.toHaveProperty('componentResults');
    expect(pythonResult).not.toHaveProperty('tokensUsed');
  });

  describe('Python threshold edge cases', () => {
    const baseParams = {
      prompt: 'test',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {} as AtomicTestCase,
      providerResponse: { output: '0' },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      // Reset mocked implementations to avoid test interference
      vi.mocked(runPythonCode).mockReset();
      vi.mocked(runPython).mockReset();
      // Reset Python state to avoid test interference
      pythonUtils.state.cachedPythonPath = null;
      pythonUtils.state.validationPromise = null;
    });

    it('should FAIL when score=0 and no threshold', async () => {
      vi.mocked(runPythonCode).mockResolvedValueOnce(0);

      const assertion: Assertion = {
        type: 'python',
        value: '0',
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=0 and threshold=0 (0 >= 0)', async () => {
      // With threshold=0, score=0 passes because 0 >= 0 is true
      vi.mocked(runPythonCode).mockResolvedValueOnce(0);

      const assertion: Assertion = {
        type: 'python',
        value: '0',
        threshold: 0,
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should FAIL when score=0 and threshold=0.1', async () => {
      vi.mocked(runPythonCode).mockResolvedValueOnce(0);

      const assertion: Assertion = {
        type: 'python',
        value: '0',
        threshold: 0.1,
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});
