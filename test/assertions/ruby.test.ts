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
  ])('should honor inverse mode for inline not-ruby assertions with %s results', async (_type, assertionValue, rubyOutput, threshold, expectedPass, expectedScore, expectedReason) => {
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
  });

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
  ])('should honor inverse mode when a file:// not-ruby assertion returns a %s', async (_type, rubyOutput, threshold, expectedPass, expectedScore, expectedReason) => {
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
