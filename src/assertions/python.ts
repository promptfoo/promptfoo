import { runPythonCode } from '../python/wrapper';
import invariant from '../util/invariant';
import { normalizeScriptResult, type ScriptAssertionResult } from './scriptResultNormalization';

import type { AssertionParams, GradingResult } from '../types/index';

function buildPythonScript(renderedValue: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = '    ';
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  return `import json

def main(output, context):
${
  isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `    return ${renderedValue}`
}
`;
}

export const handlePython = async ({
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
      invariant(typeof renderedValue === 'string', 'python assertion must have a string value');
      result =
        typeof valueFromScript === 'undefined'
          ? await runPythonCode(buildPythonScript(renderedValue), 'main', [
              output,
              assertionValueContext,
            ])
          : valueFromScript;
    }

    return normalizeScriptResult(
      assertion,
      result,
      inverse,
      { code: 'Python code', language: 'Python' },
      assertion.script ? undefined : assertion.value,
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
