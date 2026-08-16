import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import * as rubyUtils from '../../src/ruby/rubyUtils.js';
import { runRuby } from '../../src/ruby/rubyUtils.js';
import { runRubyCode } from '../../src/ruby/wrapper';

import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types/index';

vi.mock('../../src/ruby/wrapper', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/ruby/wrapper')>('../../src/ruby/wrapper');
  return {
    ...actual,
    runRubyCode: vi.fn(actual.runRubyCode),
  };
});

vi.mock('../../src/ruby/rubyUtils.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/ruby/rubyUtils.js')>(
    '../../src/ruby/rubyUtils.js',
  );
  return {
    ...actual,
    runRuby: vi.fn(actual.runRuby),
  };
});

vi.mock('path', async () => {
  const actualPath = await vi.importActual<typeof import('path')>('path');
  const mocked = {
    ...actualPath,
    extname: vi.fn(),
    resolve: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

describe('Ruby assertions', () => {
  const resetRubyMocks = () => {
    vi.clearAllMocks();
    vi.mocked(path.resolve).mockReset();
    vi.mocked(path.extname).mockReset();
    vi.mocked(runRubyCode).mockReset();
    vi.mocked(runRuby).mockReset();
    rubyUtils.state.cachedRubyPath = null;
    rubyUtils.state.validationPromise = null;
    rubyUtils.state.validatingPath = null;
  };

  beforeEach(() => {
    resetRubyMocks();
  });

  afterEach(() => {
    resetRubyMocks();
  });

  it('should run a Windows script field with a namespaced function and call-site value', async () => {
    const assertion: Assertion = {
      type: 'ruby',
      script: 'file://C:\\checks\\assert.rb:Checks::check_value',
      value: 7,
    };

    vi.mocked(path.resolve).mockReturnValue('C:\\checks\\assert.rb');
    vi.mocked(runRuby).mockResolvedValueOnce(true);

    const result = await runAssertion({
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'Expected output' },
    });

    expect(runRuby).toHaveBeenCalledWith('C:\\checks\\assert.rb', 'Checks.check_value', [
      'Expected output',
      expect.objectContaining({ value: 7 }),
    ]);
    expect(result.pass).toBe(true);
  });

  it.each([
    {
      family: 'bare method',
      functionName: 'check_value',
      wrapperMethod: 'check_value',
    },
    {
      family: 'dot-free namespace',
      functionName: 'Checks::check_value',
      wrapperMethod: 'Checks.check_value',
    },
    {
      family: 'dotted nested namespace',
      functionName: 'Validators::Format.check_length',
      wrapperMethod: 'Validators::Format.check_length',
    },
  ])(
    'should pass $family Ruby script references to the wrapper as $wrapperMethod',
    async ({ functionName, wrapperMethod }) => {
      vi.mocked(path.resolve).mockReturnValue('/base/path/checks/assert.rb');
      vi.mocked(runRuby).mockResolvedValueOnce(true);

      const result = await runAssertion({
        assertion: {
          type: 'ruby',
          script: `file://checks/assert.rb:${functionName}`,
        },
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Expected output' },
      });

      expect(runRuby).toHaveBeenCalledWith('/base/path/checks/assert.rb', wrapperMethod, [
        'Expected output',
        expect.any(Object),
      ]);
      expect(result.pass).toBe(true);
    },
  );

  it('should report Ruby script field execution errors in the handler result', async () => {
    vi.mocked(path.resolve).mockReturnValue('/base/path/checks/assert.rb');
    vi.mocked(runRuby).mockRejectedValue(new Error('Ruby script failed'));

    const result = await runAssertion({
      assertion: { type: 'ruby', script: 'file://checks/assert.rb' },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'Expected output' },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'Ruby code execution failed: Ruby script failed',
    });
  });

  it('should keep rendered script parameters out of failure reasons', async () => {
    const fakeSecret = 'FAKE-SECRET-SENTINEL';
    vi.mocked(path.resolve).mockReturnValue('/base/path/checks/assert.rb');
    vi.mocked(runRuby).mockResolvedValue(false);

    const result = await runAssertion({
      assertion: {
        type: 'ruby',
        script: 'file://checks/assert.rb',
        value: '{{ fakeSecret }}',
      },
      test: { vars: { fakeSecret } } as AtomicTestCase,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.reason).toBe('Ruby code returned false');
    expect(result.reason).not.toContain(fakeSecret);
  });

  it('should preserve the detected indentation for multiline inline assertions', async () => {
    vi.mocked(runRubyCode).mockResolvedValue(true);

    const result = await runAssertion({
      assertion: {
        type: 'ruby',
        value: 'if output\n  return true\nend',
      },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'Expected output' },
    });

    expect(runRubyCode).toHaveBeenCalledWith(
      expect.stringContaining('  if output\n    return true\n  end'),
      'main',
      expect.any(Array),
    );
    expect(result.pass).toBe(true);
  });

  it.each([
    [
      'boolean',
      'output == "Expected output"',
      true,
      undefined,
      false,
      0,
      'Ruby code returned true',
    ],
    ['number', '0.25', 0.25, 0.5, true, 0.25, 'Assertion passed'],
    [
      'snake_case GradingResult object',
      "{ pass_: true, score: 0.6, reason: 'Custom reason' }",
      {
        pass_: true,
        score: 0.6,
        reason: 'Custom reason',
      },
      undefined,
      false,
      0.6,
      'Ruby code returned true',
    ],
    [
      'JSON-stringified GradingResult below threshold',
      '\'{"pass": true, "score": 0.25, "reason": "Custom reason"}\'',
      '{"pass": true, "score": 0.25, "reason": "Custom reason"}',
      0.5,
      true,
      0.25,
      'Assertion passed',
    ],
  ])(
    'should honor inverse mode for inline not-ruby assertions with %s results',
    async (_type, assertionValue, rubyOutput, threshold, expectedPass, expectedScore, expectedReason) => {
      vi.mocked(runRubyCode).mockResolvedValueOnce(rubyOutput);

      const assertion: Assertion = {
        type: 'not-ruby',
        value: assertionValue,
        threshold,
      };
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Expected output' },
      });

      expect(runRubyCode).toHaveBeenCalledWith(expect.any(String), 'main', [
        'Expected output',
        {
          prompt: 'Some prompt',
          test: {},
          vars: {},
          provider,
          providerResponse: { output: 'Expected output' },
        },
      ]);
      expect(result).toMatchObject({
        assertion,
        pass: expectedPass,
        reason: expect.stringContaining(expectedReason),
        score: expectedScore,
      });
    },
  );

  it.each([
    ['boolean', true, undefined, false, 0, 'Ruby code returned true'],
    ['number', 0.25, 0.5, true, 0.25, 'Assertion passed'],
    [
      'snake_case GradingResult object',
      {
        pass_: true,
        score: 0.75,
        reason: 'Custom reason',
      },
      undefined,
      false,
      0.75,
      'Ruby code returned true',
    ],
  ])(
    'should honor inverse mode when a file:// not-ruby assertion returns a %s',
    async (_type, rubyOutput, threshold, expectedPass, expectedScore, expectedReason) => {
      vi.mocked(path.resolve).mockReturnValue('/path/to/assert.rb');
      vi.mocked(path.extname).mockReturnValue('.rb');
      vi.mocked(runRuby).mockResolvedValueOnce(rubyOutput);

      const assertion: Assertion = {
        type: 'not-ruby',
        value: 'file:///path/to/assert.rb',
        threshold,
      };
      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Expected output' },
      });

      expect(runRuby).toHaveBeenCalledWith('/path/to/assert.rb', 'get_assert', [
        'Expected output',
        {
          prompt: 'Some prompt',
          test: {},
          vars: {},
          provider,
          providerResponse: { output: 'Expected output' },
        },
      ]);
      expect(result).toMatchObject({
        assertion,
        pass: expectedPass,
        reason: expect.stringContaining(expectedReason),
        score: expectedScore,
      });
    },
  );

  it('should pass provider metadata shortcut to a ruby assert', async () => {
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.rb');
    vi.mocked(path.extname).mockReturnValue('.rb');
    vi.mocked(runRuby).mockResolvedValueOnce(true);

    const metadata = { http: { status: 200, statusText: 'OK' }, customField: 5 };
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: { type: 'ruby', value: 'file:///path/to/assert.rb' },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'Expected output', metadata },
    });

    expect(runRuby).toHaveBeenCalledWith('/path/to/assert.rb', 'get_assert', [
      'Expected output',
      expect.objectContaining({
        metadata,
        providerResponse: expect.objectContaining({ metadata }),
      }),
    ]);
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should not leak rendered template variables in failed inline ruby assertion reasons', async () => {
    vi.mocked(runRubyCode).mockResolvedValueOnce(false);

    const assertion: Assertion = {
      type: 'ruby',
      value: "output.include?('{{secret}}')",
    };
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {
        vars: {
          secret: 'sk-test-secret-123',
        },
      } as AtomicTestCase,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("output.include?('{{secret}}')");
    expect(result.reason).not.toContain('sk-test-secret-123');
  });
});
