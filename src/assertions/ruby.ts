import path from 'path';

import cliState from '../cliState';
import { runRuby } from '../ruby/rubyUtils.js';
import { runRubyCode } from '../ruby/wrapper';
import { parseFileUrl } from '../util/functions/parseFileUrl';
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
  try {
    let result: ScriptAssertionResult;
    if (assertion.script) {
      const { filePath, functionName } = parseFileUrl(assertion.script);
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      invariant(resolvedPath.endsWith('.rb'), 'ruby assertion script must reference a .rb file');
      result = await runRuby(resolvedPath, functionName || 'get_assert', [
        output,
        assertionValueContext,
      ]);
    } else {
      invariant(typeof renderedValue === 'string', 'ruby assertion must have a string value');
      result =
        typeof valueFromScript === 'undefined'
          ? await runRubyCode(buildRubyScript(renderedValue), 'main', [
              output,
              assertionValueContext,
            ])
          : valueFromScript;
    }

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
