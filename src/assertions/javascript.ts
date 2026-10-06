import { tokenizer } from 'acorn';
import { type GradingResult } from '../types/index';
import invariant from '../util/invariant';
import { getProcessShim } from '../util/processShim';
import { asGradingResult, normalizeScriptAssertionResult } from './scriptResultNormalization';

import type { AssertionParams } from '../types/index';

/**
 * Finds the last top-level semicolon followed by code. Tokenization keeps comment,
 * string, regex, and template contents from becoming statement separators.
 */
function findLastStatementSemicolon(code: string): number {
  let depth = 0;
  let pendingSemiIndex = -1;
  let lastSemiIndex = -1;

  for (const token of tokenizer(code, { ecmaVersion: 'latest' })) {
    const label = token.type.label;
    if (label === 'eof') {
      break;
    }
    if (label === ';' && depth === 0) {
      // Wait for another token so terminal semicolons and trailing comments do
      // not displace the separator before the final expression.
      pendingSemiIndex = token.start;
      continue;
    }
    lastSemiIndex = pendingSemiIndex;
    if (label === '(' || label === '[' || label === '{' || label === '${') {
      depth++;
    } else if (label === ')' || label === ']' || label === '}') {
      depth--;
    }
  }

  return lastSemiIndex;
}

/**
 * Builds a function body from a single-line JavaScript assertion.
 *
 * Handles the case where assertions start with variable declarations (const/let/var).
 * For these, we inject `return` before the final expression instead of prepending it,
 * which would create invalid syntax like `return const x = 1`.
 *
 * @example
 * // Simple expression - prepend return
 * "output === 'test'" → "return output === 'test'"
 *
 * @example
 * // Declaration with final expression - inject return before expression
 * "const s = JSON.parse(output).score; s > 0.5" → "const s = JSON.parse(output).score; return s > 0.5"
 *
 * @example
 * // Semicolons in strings are handled correctly
 * "const s = output; s === 'a;b'" → "const s = output; return s === 'a;b'"
 */
export function buildFunctionBody(code: string): string {
  // Remove trailing semicolons and whitespace for consistent handling
  const trimmed = code.trim().replace(/;+\s*$/, '');

  // Check if the assertion starts with a variable declaration
  if (/^(const|let|var)\s/.test(trimmed)) {
    // Find the last semicolon that's actually a statement separator (not inside a string)
    const lastSemiIndex = findLastStatementSemicolon(trimmed);
    if (lastSemiIndex !== -1) {
      const statements = trimmed.slice(0, lastSemiIndex + 1);
      const expression = trimmed.slice(lastSemiIndex + 1).trim();
      if (expression) {
        // Inject return before the final expression
        return `${statements} return ${expression}`;
      }
    }
    // No semicolon or no final expression - use as-is (will likely error or return undefined)
    return trimmed;
  }

  // Simple expression - prepend return
  return `return ${trimmed}`;
}

class JavascriptAssertionValidationError extends Error {}

const validateResult = async (result: unknown): Promise<boolean | number | GradingResult> => {
  result = await Promise.resolve(result);
  if (typeof result === 'boolean' || (typeof result === 'number' && Number.isFinite(result))) {
    return result;
  }
  const gradingResult = asGradingResult(result);
  if (gradingResult) {
    return gradingResult;
  }
  throw new JavascriptAssertionValidationError(
    `Custom function must return a boolean, a finite number, or a GradingResult object with finite scores and weights. Got type ${typeof result}.`,
  );
};

function serializeFunctionAssertion(assertion: AssertionParams['assertion']) {
  invariant(
    typeof assertion.value === 'function',
    `function-valued javascript assertion (type: ${assertion.type}) must have a function value`,
  );
  const functionString = assertion.value.toString();
  return {
    ...assertion,
    value: functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
  };
}

function normalizeResultAssertion(
  assertion: GradingResult['assertion'],
  fallbackAssertion: AssertionParams['assertion'],
) {
  const assertionToNormalize = assertion ?? fallbackAssertion;

  if (typeof assertionToNormalize.value === 'function') {
    return serializeFunctionAssertion(assertionToNormalize);
  }

  return assertionToNormalize;
}

function appendRenderedValueToReason(
  reason: string,
  renderedValue?: AssertionParams['renderedValue'],
): string {
  return typeof renderedValue === 'string' && renderedValue
    ? `${reason}\n${renderedValue}`
    : reason;
}

function normalizeJavascriptAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
  renderedValue?: string,
): GradingResult {
  // Preserve metadata getter ordering while grading against the original assertion.
  const normalizedAssertion = normalizeResultAssertion(undefined, assertion);
  const normalizedScriptResult = normalizeScriptAssertionResult(
    assertion,
    result,
    inverse,
    { code: 'Custom function', language: 'JavaScript' },
    renderedValue,
  );
  const normalizedResult = {
    ...normalizedScriptResult,
    assertion:
      typeof result === 'object'
        ? normalizeResultAssertion(normalizedScriptResult.assertion, assertion)
        : normalizedAssertion,
  };
  if (!Number.isFinite(normalizedResult.score)) {
    throw new JavascriptAssertionValidationError(
      'Custom function must return a GradingResult object with a finite score.',
    );
  }
  return normalizedResult;
}

export const handleJavascript = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  outputString,
  output,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  try {
    if (typeof assertion.value === 'function') {
      const result = await validateResult(assertion.value(outputString, assertionValueContext));
      return normalizeJavascriptAssertionResult(assertion, result, inverse);
    }
    invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');

    /**
     * Removes trailing newline from the rendered value.
     * This is necessary for handling multi-line string literals in YAML
     * that are defined on a single line in the YAML file.
     *
     * @example
     * value: |
     *   output === 'true'
     */
    renderedValue = renderedValue.trimEnd();

    let result: boolean | number | GradingResult;
    if (typeof valueFromScript === 'undefined') {
      // Multiline assertions use the value as-is (user controls returns)
      // Single-line assertions get processed to handle variable declarations
      const functionBody = renderedValue.includes('\n')
        ? renderedValue
        : buildFunctionBody(renderedValue);
      // Pass process shim for ESM compatibility - allows process.mainModule.require to work
      const customFunction = new Function('output', 'context', 'process', functionBody);
      result = await validateResult(
        customFunction(output, assertionValueContext, getProcessShim()),
      );
    } else {
      invariant(
        typeof valueFromScript === 'boolean' ||
          typeof valueFromScript === 'number' ||
          typeof valueFromScript === 'object',
        `Javascript assertion script must return a boolean, number, or object (${assertion.value})`,
      );
      result = await validateResult(valueFromScript);
    }

    return normalizeJavascriptAssertionResult(assertion, result, inverse, renderedValue);
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: appendRenderedValueToReason(
        `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}`,
        err instanceof JavascriptAssertionValidationError ? undefined : renderedValue,
      ),
      assertion: normalizeResultAssertion(undefined, assertion),
    };
  }
};
