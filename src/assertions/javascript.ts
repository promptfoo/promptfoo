import { Parser, type TokenType, tokTypes, type YieldExpression } from 'acorn';
import { type GradingResult } from '../types/index';
import invariant from '../util/invariant';
import { getProcessShim } from '../util/processShim';
import { isSafeMode, SafeModeError } from '../util/safeMode';
import {
  appendToReason,
  asGradingResult,
  normalizeScriptAssertionResult,
} from './scriptResultNormalization';

import type { AssertionParams } from '../types/index';

/**
 * Acorn's property-name token context can misclassify following operators.
 * Treat names after . or ?. as identifiers so following operators and calls do not
 * interpret them as keywords. Assertion source and token offsets remain unchanged.
 */
const assertionParser = Parser.extend((BaseParser) => {
  const tokenizerPrototype = BaseParser.prototype as Parser & {
    updateContext(previousType: TokenType): void;
    next(ignoreEscapeSequenceInKeyword: boolean): void;
    parseYield(forInit: boolean): YieldExpression;
  };

  return class extends BaseParser {
    declare type: TokenType;
    declare exprAllowed: boolean;

    parseYield(forInit: boolean): YieldExpression {
      // Acorn's lexical context can miss async generators and generator methods.
      // The grammar has identified yield here, so its operand can start a regex.
      this.exprAllowed = true;
      return tokenizerPrototype.parseYield.call(this, forInit);
    }

    next(): void {
      // Escaped keywords are valid property names. Leave their syntax validation
      // to the unchanged Function body rather than the lexical keyword guard.
      tokenizerPrototype.next.call(this, true);
    }

    updateContext(previousType: TokenType): void {
      if (
        (previousType === tokTypes.dot || previousType === tokTypes.questionDot) &&
        (this.type.keyword || this.type === tokTypes.name)
      ) {
        this.type = tokTypes.name;
        previousType = tokTypes.dot;
      }
      tokenizerPrototype.updateContext.call(this, previousType);
    }
  };
});

function insertReturnAfterSemicolon(code: string, semicolonIndex: number): string {
  const statements = code.slice(0, semicolonIndex + 1);
  const expression = code.slice(semicolonIndex + 1).trim();
  return `${statements} return ${expression}`;
}

/**
 * Finds statement separators using JavaScript grammar so async and generator
 * expressions distinguish regular expressions from division correctly.
 */
function findLastStatementSemicolon(code: string): number {
  const prefix = 'function __assertion__() {\n';
  let depth = 0;
  let pendingSemiIndex = -1;
  let lastSemiIndex = -1;
  try {
    assertionParser.parse(prefix + code + '\n}', {
      ecmaVersion: 'latest',
      onToken(token) {
        const start = token.start - prefix.length;
        if (start < 0 || start >= code.length || token.type === tokTypes.eof) {
          return;
        }
        const label = token.type.label;
        if (label === ';' && depth === 0) {
          pendingSemiIndex = start;
          return;
        }
        lastSemiIndex = pendingSemiIndex;
        if (label === '(' || label === '[' || label === '{' || label === '${') {
          depth++;
        } else if (label === ')' || label === ']' || label === '}') {
          depth--;
        }
      },
    });
  } catch (error) {
    if (!(error instanceof SyntaxError) || lastSemiIndex === -1) {
      throw error;
    }
    // A bare final object is an expression only after return insertion. Validate
    // that one complete candidate; never drop source or retry arbitrary semicolons.
    const returnStart = lastSemiIndex + 1;
    const candidate = assertionParser.parse(
      prefix + insertReturnAfterSemicolon(code, lastSemiIndex) + '\n}',
      { ecmaVersion: 'latest' },
    );
    const declaration = candidate.body[0];
    if (declaration.type !== 'FunctionDeclaration') {
      throw error;
    }
    const statements = declaration.body.body.filter(
      (statement) => statement.type !== 'EmptyStatement',
    );
    const last = statements[statements.length - 1];
    if (
      last?.type !== 'ReturnStatement' ||
      last.start !== prefix.length + returnStart + 1 ||
      !last.argument
    ) {
      throw error;
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
      const expression = trimmed.slice(lastSemiIndex + 1).trim();
      if (expression) {
        // Inject return before the final expression
        return insertReturnAfterSemicolon(trimmed, lastSemiIndex);
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
  // A GradingResult reason is explanatory prose, including an intentional empty string.
  // Preserve it for both inverse outcomes; primitive results keep their generated reasons.
  return typeof result === 'object'
    ? { ...normalizedResult, reason: result.reason }
    : normalizedResult;
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
      if (isSafeMode()) {
        throw new SafeModeError(
          'Inline JavaScript execution is disabled in safe mode. Please use a file reference instead (e.g. "file://path/to/assertion.js").',
        );
      }
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
    if (err instanceof SafeModeError) {
      return {
        pass: false,
        score: 0,
        reason: err.message,
        assertion: normalizeResultAssertion(undefined, assertion),
      };
    }
    return {
      pass: false,
      score: 0,
      reason: appendToReason(
        `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}`,
        err instanceof JavascriptAssertionValidationError ? undefined : renderedValue,
      ),
      assertion: normalizeResultAssertion(undefined, assertion),
    };
  }
};
