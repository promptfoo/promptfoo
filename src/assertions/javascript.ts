import { type GradingResult, isGradingResult } from '../types/index';
import invariant from '../util/invariant';
import { getProcessShim } from '../util/processShim';

import type { AssertionParams } from '../types/index';

/**
 * Checks if a character at the given index is escaped by backslashes.
 * Handles multiple consecutive backslashes correctly (e.g., \\\\ is two escaped backslashes).
 */
function isCharEscaped(code: string, index: number): boolean {
  let backslashCount = 0;
  let i = index - 1;
  while (i >= 0 && code[i] === '\\') {
    backslashCount++;
    i--;
  }
  return backslashCount % 2 === 1;
}

/**
 * Finds the last semicolon that acts as a statement separator (not inside a string literal).
 * Tracks quote state to skip semicolons inside single quotes, double quotes, and template literals.
 *
 * @returns The index of the last statement-level semicolon, or -1 if none found.
 *
 * @remarks
 * Known limitations (use multiline format for these cases):
 * - Does not handle semicolons inside regex literals (e.g., /;/)
 * - Does not handle semicolons inside template literal expressions (e.g., `${a;b}`)
 */
function findLastStatementSemicolon(code: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let lastSemiIndex = -1;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const isEscaped = isCharEscaped(code, i);

    // Toggle quote state for unescaped quote characters
    if (!isEscaped) {
      if (char === "'" && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
      }
    }

    // Track semicolons only when outside all string contexts
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inTemplate) {
      lastSemiIndex = i;
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

const validateResult = async (result: unknown): Promise<boolean | number | GradingResult> => {
  result = await Promise.resolve(result);
  if (typeof result === 'boolean' || typeof result === 'number' || isGradingResult(result)) {
    return result;
  } else {
    throw new Error(
      `Custom function must return a boolean, number, or GradingResult object. Got type ${typeof result}: ${JSON.stringify(
        result,
      )}`,
    );
  }
};

export const handleJavascript = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  outputString,
  output,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  let pass;
  let score;
  try {
    if (typeof assertion.value === 'function') {
      let ret = assertion.value(outputString, assertionValueContext);
      ret = await validateResult(ret);
      if (!ret.assertion) {
        // Populate the assertion object if the custom function didn't return it.
        const functionString = assertion.value.toString();
        ret.assertion = {
          type: 'javascript',
          value: functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
        };
      }
      return ret;
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

    if (typeof result === 'boolean') {
      pass = result !== inverse;
      score = pass ? 1 : 0;
    } else if (typeof result === 'number') {
      pass = assertion.threshold !== undefined ? result >= assertion.threshold : result > 0;
      score = result;
    } else if (typeof result === 'object') {
      return result;
    } else {
      throw new Error('Custom function must return a boolean or number');
    }
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}
${renderedValue}`,
      assertion,
    };
  }
  return {
    pass,
    score,
    reason: pass
      ? 'Assertion passed'
      : `Custom function returned ${inverse ? 'true' : 'false'}
${renderedValue}`,
    assertion,
  };
};
