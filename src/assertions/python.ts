import { runPythonCode } from '../python/wrapper';
import type { AssertionParams } from '../types';
import { type GradingResult, isGradingResult } from '../types';
import invariant from '../util/invariant';

// Recursively map snake_case keys to camelCase for Python dataclass compatibility
function mapSnakeCaseToCamelCase(obj: Record<string, any>): Record<string, any> {
  // Create a shallow copy to avoid mutating the original object
  const result = { ...obj };

  // Handle top-level mappings
  // Support both 'pass' and 'pass_' for user convenience
  if ('pass_' in result && !('pass' in result)) {
    result.pass = result.pass_;
  }
  if ('named_scores' in result && !('namedScores' in result)) {
    result.namedScores = result.named_scores;
  }
  if ('component_results' in result && !('componentResults' in result)) {
    result.componentResults = result.component_results;
  }
  if ('tokens_used' in result && !('tokensUsed' in result)) {
    result.tokensUsed = result.tokens_used;
  }

  // Recursively handle nested component results
  if (result.componentResults && Array.isArray(result.componentResults)) {
    result.componentResults = result.componentResults.map((component: any) => {
      if (typeof component === 'object' && component !== null) {
        return mapSnakeCaseToCamelCase(component);
      }
      return component;
    });
  }

  return result;
}

export const handlePython = async ({
  assertion,
  renderedValue,
  valueFromScript,
  context,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'python assertion must have a string value');
  let pass;
  let score;
  try {
    let result: string | number | boolean | object | GradingResult | undefined;
    if (typeof valueFromScript === 'undefined') {
      const isMultiline = renderedValue.includes('\n');
      let indentStyle = '    ';
      if (isMultiline) {
        // Detect the indentation style of the first indented line
        const match = renderedValue.match(/^(?!\s*$)\s+/m);
        if (match) {
          indentStyle = match[0];
        }
      }

      const pythonScript = `import json

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
      result = await runPythonCode(pythonScript, 'main', [output, context]);
    } else {
      result = valueFromScript;
    }

    if (
      (typeof result === 'boolean' && result) ||
      (typeof result === 'string' && result.toLowerCase() === 'true')
    ) {
      pass = true;
      score = 1.0;
    } else if (
      (typeof result === 'boolean' && !result) ||
      (typeof result === 'string' && result.toLowerCase() === 'false')
    ) {
      pass = false;
      score = 0.0;
    } else if (typeof result === 'string' && result.startsWith('{')) {
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch (err) {
        throw new Error(`Invalid JSON: ${err} when parsing result: ${result}`);
      }
      if (!isGradingResult(parsed)) {
        throw new Error(
          `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: ${result}`,
        );
      }
      return parsed;
    } else if (typeof result === 'object') {
      const obj: Record<string, any> = result as any;

      // Support snake_case keys from Python dataclass (recursively)
      const mappedObj = mapSnakeCaseToCamelCase(obj);

      if (!isGradingResult(mappedObj)) {
        throw new Error(
          `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead:\n${JSON.stringify(
            mappedObj,
            null,
            2,
          )}`,
        );
      }
      const pythonGradingResult = mappedObj as Omit<GradingResult, 'assertion'>;
      if (assertion.threshold && pythonGradingResult.score < assertion.threshold) {
        pythonGradingResult.pass = false;
        const scoreMessage = `Python score ${pythonGradingResult.score} is less than threshold ${assertion.threshold}`;
        pythonGradingResult.reason = pythonGradingResult.reason
          ? `${scoreMessage}: ${pythonGradingResult.reason}`
          : scoreMessage;
      }
      return {
        ...pythonGradingResult,
        assertion,
      };
    } else {
      score = Number.parseFloat(String(result));
      pass = assertion.threshold ? score >= assertion.threshold : score > 0;
      if (Number.isNaN(score)) {
        throw new Error(
          `Python assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
        );
      }
      if (typeof assertion.threshold !== 'undefined' && score < assertion.threshold) {
        pass = false;
      }
    }
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Python code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
  return {
    pass,
    score,
    reason: pass
      ? 'Assertion passed'
      : `Python code returned ${pass ? 'true' : 'false'}\n${assertion.value}`,
    assertion,
  };
};
