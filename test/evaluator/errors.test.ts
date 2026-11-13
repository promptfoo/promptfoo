import { describe, expect, it } from 'vitest';
import { EvalRunError as commandError } from '../../src/commands/eval';
import { PromptSuggestionsRejectedError as evaluatorError } from '../../src/evaluator';
import { EvalRunError, PromptSuggestionsRejectedError } from '../../src/evaluator/errors';
import {
  EvalRunError as publicRunError,
  PromptSuggestionsRejectedError as publicSuggestionsError,
} from '../../src/index';
import { EvalRunError as nodeError } from '../../src/node/doEval';

describe('evaluation error compatibility', () => {
  it('retains one class identity across source and public exports', () => {
    expect(publicRunError).toBe(EvalRunError);
    expect(nodeError).toBe(EvalRunError);
    expect(commandError).toBe(EvalRunError);
    expect(publicSuggestionsError).toBe(PromptSuggestionsRejectedError);
    expect(evaluatorError).toBe(PromptSuggestionsRejectedError);
    expect(new EvalRunError('fixture')).toBeInstanceOf(publicRunError);
  });

  it.each([0, -1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'normalizes invalid exit code %s without losing error details',
    (exitCode) => {
      const error = new EvalRunError('fixture failure', exitCode);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EvalRunError');
      expect(error.message).toBe('fixture failure');
      expect(error.exitCode).toBe(1);
      expect(error.stack).toContain('fixture failure');
    },
  );

  it.each([1, 2, 255])('preserves valid exit code %s', (exitCode) => {
    expect(new EvalRunError('fixture', exitCode).exitCode).toBe(exitCode);
  });

  it('preserves default and custom prompt-rejection messages', () => {
    expect(new PromptSuggestionsRejectedError()).toMatchObject({
      name: 'PromptSuggestionsRejectedError',
      message: 'No prompts selected. Aborting.',
    });
    expect(new PromptSuggestionsRejectedError('fixture').message).toBe('fixture');
  });
});
