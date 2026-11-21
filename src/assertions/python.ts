import { runPythonCode } from '../python/wrapper';
import invariant from '../util/invariant';
import { buildScriptBody } from './scriptBody';
import { normalizeScriptResult, type ScriptAssertionResult } from './scriptResultNormalization';

import type { AssertionParams, GradingResult } from '../types/index';

export const handlePython = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  inverse,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'python assertion must have a string value');
  try {
    const result: ScriptAssertionResult =
      typeof valueFromScript === 'undefined'
        ? await runPythonCode(
            `import json

def main(output, context):
${buildScriptBody(renderedValue, '    ')}
`,
            'main',
            [output, assertionValueContext],
          )
        : valueFromScript;

    return normalizeScriptResult(
      assertion,
      result,
      inverse,
      { code: 'Python code', language: 'Python' },
      assertion.value,
    );
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Python code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
};
