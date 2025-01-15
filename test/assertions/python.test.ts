import * as path from 'path';
import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai';
import { runPython } from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';

jest.mock('../../src/python/wrapper', () => {
  const actual = jest.requireActual('../../src/python/wrapper');
  return {
    ...actual,
    runPythonCode: jest.fn(actual.runPythonCode),
  };
});

jest.mock('../../src/python/pythonUtils', () => {
  const actual = jest.requireActual('../../src/python/pythonUtils');
  return {
    ...actual,
    runPython: jest.fn(actual.runPython),
  };
});

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(jest.requireActual('path').resolve),
  extname: jest.fn(jest.requireActual('path').extname),
}));

describe('Python file references', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle Python file reference with function name', async () => {
    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/assert.py:custom_function',
    };

    const mockOutput = true;
    jest.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    jest.mocked(path.extname).mockReturnValue('.py');
    jest.mocked(runPython).mockResolvedValue(mockOutput);

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
    jest.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    jest.mocked(path.extname).mockReturnValue('.py');
    jest.mocked(runPython).mockResolvedValue(mockOutput);

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
    jest.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    jest.mocked(path.extname).mockReturnValue('.py');
    jest.mocked(runPython).mockResolvedValue(mockOutput);

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

    jest.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    jest.mocked(path.extname).mockReturnValue('.py');
    jest.mocked(runPython).mockRejectedValue(new Error('Python error'));

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

    jest.mocked(path.resolve).mockReturnValue('/path/to/assert.py');
    jest.mocked(path.extname).mockReturnValue('.py');
    jest.mocked(runPython).mockResolvedValue(0.75);

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

    jest.mocked(runPythonCode).mockResolvedValueOnce(expectedPythonValue);

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
      `{"pass": true, "score": 1, "reason": "Custom success"}`,
      1,
      'Custom success',
      true,
      undefined,
    ],
    [
      'GradingResult',
      // This score is less than the assertion threshold in the test
      `{"pass": true, "score": 0.4, "reason": "Foo bar"}`,
      0.4,
      'Python score 0.4 is less than threshold 0.5',
      false,
      0.5,
    ],
  ])(
    'should handle inline return type %s with return value: %p',
    async (type, returnValue, expectedScore, expectedReason, expectedPass, threshold) => {
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

      jest.mocked(runPythonCode).mockResolvedValueOnce(resolvedValue);

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
    },
  );

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
  ])(
    'should handle when the file:// assertion with .py file returns a %s',
    async (type, pythonOutput, expectedPass, expectedReason) => {
      const output = 'Expected output';
      jest.mocked(runPython).mockResolvedValueOnce(pythonOutput as string | object);

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

      expect(runPython).toHaveBeenCalledWith(path.resolve('/path/to/assert.py'), 'get_assert', [
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
    },
  );

  it('should handle when python file assertions throw an error', async () => {
    const output = 'Expected output';
    jest
      .mocked(runPython)
      .mockRejectedValue(
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
});
