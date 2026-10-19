import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  hasResponsesReasoningConfig,
  isResponsesReasoningCleared,
  resolveChatReasoningEffort,
  resolveResponsesReasoning,
} from '../../../src/providers/openai/reasoning';

import type { AzureResponsesOptions } from '../../../src/providers/azure/types';
import type {
  GPT5Reasoning,
  GPT5ReasoningEffort,
  OpenAiCompletionOptions,
  Reasoning,
  ReasoningEffort,
} from '../../../src/providers/openai/types';

const identity = (value: unknown) => value;

describe('reasoning configuration', () => {
  it('shares reasoning types across APIs and retains the old type names', () => {
    expectTypeOf<OpenAiCompletionOptions['reasoning_effort']>().toEqualTypeOf<
      ReasoningEffort | undefined
    >();
    expectTypeOf<AzureResponsesOptions['reasoning_effort']>().toEqualTypeOf<
      ReasoningEffort | undefined
    >();
    expectTypeOf<AzureResponsesOptions['reasoning']>().toEqualTypeOf<
      Reasoning | null | undefined
    >();
    expectTypeOf<GPT5ReasoningEffort>().toExtend<ReasoningEffort>();
    expectTypeOf<GPT5Reasoning>().toExtend<Reasoning>();
  });

  it.each([null, '', 'none', 'low', 'future-effort'])(
    'uses an explicit prompt effort %j before provider settings',
    (effort) => {
      const render = vi.fn(identity);
      expect(
        resolveChatReasoningEffort(
          { reasoning_effort: 'high', passthrough: { reasoning_effort: 'medium' } },
          { reasoning_effort: effort, passthrough: { reasoning_effort: 'low' } },
          render,
        ),
      ).toBe(effort);
      expect(render).toHaveBeenCalledExactlyOnceWith(effort);
    },
  );

  it('falls back after a template resolves to undefined', () => {
    const render = (value: unknown) => (value === 'missing' ? undefined : value);
    expect(
      resolveChatReasoningEffort(
        { reasoning_effort: 'high' },
        { reasoning_effort: 'missing', passthrough: { reasoning_effort: 'low' } },
        render,
      ),
    ).toBe('low');
    expect(
      resolveChatReasoningEffort(
        { passthrough: { reasoning_effort: 'medium' } },
        undefined,
        render,
      ),
    ).toBe('medium');
    expect(resolveChatReasoningEffort({ passthrough: [] }, undefined, render)).toBeUndefined();
  });

  it('merges Responses options while giving prompt effort precedence across both spellings', () => {
    const provider = {
      reasoning: { effort: 'high', summary: 'auto' },
      passthrough: { reasoning: { context: 'all_turns' } },
    };
    const prompt = { reasoning_effort: 'low', reasoning: { summary: 'detailed' } };
    expect(resolveResponsesReasoning(provider, prompt, identity)).toEqual({
      effort: 'low',
      summary: 'detailed',
      context: 'all_turns',
    });
    expect(provider.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect(prompt.reasoning).toEqual({ summary: 'detailed' });
  });

  it.each([null, ''])(
    'clears an inherited effort with %j without removing other options',
    (effort) => {
      expect(
        resolveResponsesReasoning(
          { reasoning: { effort: 'high', summary: 'auto' } },
          { reasoning_effort: effort },
          identity,
        ),
      ).toEqual({ summary: 'auto' });
      expect(
        resolveResponsesReasoning(
          { reasoning_effort: 'high' },
          { reasoning: { effort } },
          identity,
        ),
      ).toBeUndefined();
    },
  );

  it('clears inherited Responses options with an explicit null object', () => {
    expect(
      resolveResponsesReasoning(
        { reasoning: { effort: 'high', summary: 'auto' } },
        { reasoning: null },
        identity,
      ),
    ).toBeUndefined();
    expect(
      resolveResponsesReasoning(
        { reasoning: { effort: 'high' } },
        { passthrough: { reasoning: null } },
        identity,
      ),
    ).toBeUndefined();
  });

  it('lets a named full clear suppress same-scope passthrough without evaluating it', () => {
    const ignored = vi.fn(() => {
      throw new Error('cleared');
    });
    const render = (value: unknown) => (typeof value === 'function' ? value() : value);
    const cleared = { reasoning: null, passthrough: { reasoning: ignored } };
    expect(resolveResponsesReasoning(cleared, undefined, render)).toBeUndefined();
    expect(
      resolveResponsesReasoning({ reasoning: { effort: 'high' } }, cleared, render),
    ).toBeUndefined();
    expect(ignored).not.toHaveBeenCalled();
    expect(
      resolveResponsesReasoning(
        { reasoning: null, passthrough: { reasoning: { summary: 'auto' } } },
        undefined,
        identity,
      ),
    ).toBeUndefined();
  });

  it('gives nested fields priority within a config', () => {
    expect(
      resolveResponsesReasoning(
        {
          reasoning_effort: 'high',
          passthrough: { reasoning: { effort: 'medium', summary: 'auto' } },
          reasoning: { effort: 'low' },
        },
        undefined,
        identity,
      ),
    ).toEqual({ effort: 'low', summary: 'auto' });
    expect(
      resolveResponsesReasoning(
        { reasoning_effort: 'high', passthrough: { reasoning: { effort: 'medium' } } },
        undefined,
        identity,
      ),
    ).toEqual({ effort: 'medium' });
  });

  it('does not evaluate an overridden provider effort', () => {
    const render = (value: unknown): unknown => {
      if (typeof value === 'function') {
        return value();
      }
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item)]));
      }
      return value;
    };
    const overridden = vi.fn(() => {
      throw new Error('overridden');
    });
    expect(
      resolveResponsesReasoning(
        { reasoning: () => ({ effort: overridden, summary: 'auto' }) },
        { reasoning_effort: 'low' },
        render,
      ),
    ).toEqual({ effort: 'low', summary: 'auto' });
    expect(overridden).not.toHaveBeenCalled();
  });

  it.each(['low', 2, true, []])(
    'rejects a malformed Responses reasoning object %j',
    (reasoning) => {
      expect(() => resolveResponsesReasoning({ reasoning }, undefined, identity)).toThrow(
        'Responses reasoning must be an object or null',
      );
      expect(() =>
        resolveResponsesReasoning({ passthrough: { reasoning } }, undefined, identity),
      ).toThrow('Responses reasoning must be an object or null');
    },
  );
});

describe('full reasoning clears without typed model support', () => {
  it.each([
    [{}, undefined, false],
    [{ reasoning: null }, undefined, true],
    [{ passthrough: { reasoning: null } }, undefined, true],
    [{}, { reasoning: null, passthrough: { reasoning: { summary: 'auto' } } }, true],
    [
      { passthrough: { reasoning: { summary: 'auto' } } },
      { passthrough: { reasoning: null } },
      true,
    ],
    [{ reasoning: null }, { passthrough: { reasoning: { summary: 'auto' } } }, false],
    [{}, { passthrough: null }, false],
    [{ passthrough: [] }, { passthrough: 'invalid' }, false],
  ])('detects literal clears for %j and %j', (provider, prompt, expected) => {
    expect(isResponsesReasoningCleared(provider, prompt)).toBe(expected);
  });
});

describe('reasoning settings before passthrough merging', () => {
  it.each([
    [{}, undefined, false],
    [{ reasoning: null }, undefined, true],
    [{}, { reasoning_effort: null }, true],
    [{ passthrough: { reasoning: null } }, { passthrough: { unrelated: true } }, true],
    [{ passthrough: { reasoning: { effort: null } } }, { passthrough: {} }, true],
    [{ passthrough: [] }, { passthrough: { unrelated: true } }, false],
  ])('detects explicit settings in %j and %j', (provider, prompt, expected) => {
    expect(hasResponsesReasoningConfig(provider, prompt)).toBe(expected);
  });
});
