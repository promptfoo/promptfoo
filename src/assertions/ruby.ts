import { runRubyCode } from '../ruby/wrapper';
import invariant from '../util/invariant';
import { normalizeScriptResult, type ScriptAssertionResult } from './scriptResultNormalization';

import type { AssertionParams, GradingResult } from '../types/index';

function buildRubyScript(renderedValue: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = '  ';
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  return `require 'json'

def main(output, context)
${
  isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `  return ${renderedValue}`
}
end
`;
}

export const handleRuby = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  inverse,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'ruby assertion must have a string value');
  try {
    const result: ScriptAssertionResult =
      typeof valueFromScript === 'undefined'
        ? await runRubyCode(buildRubyScript(renderedValue), 'main', [output, assertionValueContext])
        : valueFromScript;

    return normalizeScriptResult(
      assertion,
      result,
      inverse,
      { code: 'Ruby code', language: 'Ruby' },
      assertion.value,
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
