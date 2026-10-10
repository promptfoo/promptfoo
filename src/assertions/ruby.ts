import { runRubyCode } from '../ruby/wrapper';
import invariant from '../util/invariant';
import { buildScriptBody } from './scriptBody';
import { normalizeScriptResult, type ScriptAssertionResult } from './scriptResultNormalization';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleRuby = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  inverse,
  output,
}: AssertionParams): Promise<GradingResult> => {
  try {
    let result: ScriptAssertionResult;
    if (assertion.script) {
      result = valueFromScript;
    } else {
      invariant(typeof renderedValue === 'string', 'ruby assertion must have a string value');
      result =
        typeof valueFromScript === 'undefined'
          ? await runRubyCode(
              `require 'json'

def main(output, context)
${buildScriptBody(renderedValue, '  ')}
end
`,
              'main',
              [output, assertionValueContext],
            )
          : valueFromScript;
    }

    return normalizeScriptResult(
      assertion,
      result,
      inverse,
      { code: 'Ruby code', language: 'Ruby' },
      assertion.script ? undefined : assertion.value,
    );
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Ruby code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
};
