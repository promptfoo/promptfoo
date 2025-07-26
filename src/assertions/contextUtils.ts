import invariant from '../util/invariant';
import { transform } from '../util/transform';

import type { Assertion, AtomicTestCase } from '../types';

/**
 * Resolves the context value for context-based assertions.
 * Supports extracting context from test variables or transforming from output.
 *
 * @param assertion - The assertion configuration
 * @param test - The test case
 * @param output - The provider output
 * @param prompt - The prompt text
 * @param fallbackContext - Optional fallback context (e.g., prompt for context-recall)
 * @param providerResponse - Optional full provider response for contextTransform
 * @returns The resolved context string
 * @throws Error if context cannot be resolved or transform fails
 */
export async function resolveContext(
  assertion: Assertion,
  test: AtomicTestCase,
  output: string | object,
  prompt?: string,
  fallbackContext?: string,
  providerResponse?: any,
): Promise<string> {
  // Handle context from test variables - ensure it's a string
  let contextValue: string | undefined;
  if (test.vars?.context && typeof test.vars.context === 'string') {
    contextValue = test.vars.context;
  } else if (fallbackContext) {
    contextValue = fallbackContext;
  }

  if (assertion.contextTransform) {
    try {
      const transformed = await transform(assertion.contextTransform, output, {
        vars: test.vars,
        prompt: { label: prompt },
        ...(providerResponse &&
          providerResponse.metadata && { metadata: providerResponse.metadata }),
      });

      invariant(
        typeof transformed === 'string',
        `contextTransform must return a string value. Got ${typeof transformed}. ` +
          `Check your transform expression: ${assertion.contextTransform}`,
      );

      contextValue = transformed;
    } catch (error) {
      throw new Error(
        `Failed to transform context using expression '${assertion.contextTransform}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  invariant(
    typeof contextValue === 'string' && contextValue.length > 0,
    'Context is required for context-based assertions. ' +
      'Provide either a "context" variable in your test case or use "contextTransform" ' +
      'to extract context from the provider response.',
  );

  return contextValue;
}
