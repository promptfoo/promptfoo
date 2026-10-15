import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { runRuby } from '../../src/ruby/rubyUtils.js';
import { runRubyCode } from '../../src/ruby/wrapper';
import { createScriptAssertionParams } from '../factories/literalFixtures';

import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types/index';

const { createPathFactory } = await vi.hoisted(() => import('../factories/moduleMocks'));

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

vi.mock('path', createPathFactory());

describe('Ruby assertions', () => {
  const resetRubyMocks = () => {
    vi.clearAllMocks();
    vi.mocked(path.resolve).mockReset();
    vi.mocked(path.extname).mockReset();
    vi.mocked(runRubyCode).mockReset();
    vi.mocked(runRuby).mockReset();
  };

  beforeEach(() => {
    resetRubyMocks();
  });

  afterEach(() => {
    resetRubyMocks();
  });

  it('accepts the result shapes earlier releases recorded from Ruby graders', async () => {
    vi.mocked(runRubyCode).mockResolvedValueOnce({
      pass_: true,
      score: 1,
      reason: 'ok',
      named_scores: { exact_match: true, has_citation: false, skipped: null, relevance: '0.5' },
      component_results: [{ pass_: true, score: 0.75 }, { pass_: false }],
    });

    const result = await runAssertion({
      assertion: { type: 'ruby', value: 'unused' },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
      reason: 'ok',
      namedScores: { exact_match: 1, has_citation: 0, skipped: 0, relevance: 0.5 },
      componentResults: [
        { pass: true, score: 0.75, reason: '' },
        { pass: false, score: 0, reason: '' },
      ],
    });
  });

  it('omits rejected object payloads from validation errors', async () => {
    vi.mocked(runRubyCode).mockResolvedValueOnce({
      pass_: true,
      score: 1,
      reason: 'Custom grade',
      named_scores: { quality: 'high' },
      metadata: { http: { requestHeaders: { authorization: 'diagnostic-placeholder' } } },
    });

    const result = await runAssertion({
      assertion: { type: 'ruby', value: 'unused' },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite scores and weights. Got type object.');
    expect(result.reason).not.toContain('diagnostic-placeholder');
    expect(result.reason).not.toContain('requestHeaders');
    expect(result.metadata).toBeUndefined();
  });

  it.each([
    ['namedScores', 'namedScores'],
    ['named_scores', 'namedScores'],
    ['namedScoreWeights', 'namedScoreWeights'],
    ['named_score_weights', 'namedScoreWeights'],
  ])(
    'accepts nullable %s maps and component lists, including nested results',
    async (field, mappedField) => {
      const scriptResult = {
        pass_: true,
        score: 1,
        reason: 'ok',
        [field]: null,
        component_results: [
          { pass_: true, score: 0.75, reason: 'nested', [field]: null, component_results: null },
        ],
      };
      vi.mocked(runRubyCode).mockResolvedValueOnce(scriptResult);

      const result = await runAssertion(createScriptAssertionParams('ruby'));

      expect(result).toMatchObject({ pass: true, score: 1, reason: 'ok' });
      expect(result).toHaveProperty(mappedField, null);
      expect(result.componentResults?.[0]).toMatchObject({
        pass: true,
        score: 0.75,
        [mappedField]: null,
        componentResults: null,
      });
      expect(scriptResult[field]).toBeNull();
      expect(scriptResult.component_results[0][field]).toBeNull();
    },
  );

  it.each([2, Number.POSITIVE_INFINITY])(
    'validates snake_case weights in nested script results: %s',
    async (weight) => {
      const scriptResult = {
        pass_: true,
        score: 1,
        reason: 'ok',
        named_scores: { quality: 0.5 },
        named_score_weights: { quality: 3 },
        component_results: [
          {
            pass_: true,
            score: 0.75,
            reason: 'nested',
            named_scores: { quality: 0.75 },
            named_score_weights: { quality: weight },
          },
        ],
      };
      vi.mocked(runRubyCode).mockResolvedValueOnce(scriptResult);

      const result = await runAssertion(createScriptAssertionParams('ruby'));

      if (Number.isFinite(weight)) {
        expect(result.namedScoreWeights).toEqual({ quality: 3 });
        expect(result.componentResults?.[0].namedScoreWeights).toEqual({ quality: weight });
      } else {
        expect(result).toMatchObject({ pass: false, score: 0 });
        expect(result.componentResults).toBeUndefined();
      }
      expect(scriptResult).not.toHaveProperty('namedScoreWeights');
      expect(scriptResult.component_results[0]).not.toHaveProperty('namedScoreWeights');
    },
  );

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
      'Custom reason',
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
      'Custom reason',
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
