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
 * @returns The resolved context string
 * @throws Error if context cannot be resolved or transform fails
 */
export async function resolveContext(
  assertion: Assertion,
  test: AtomicTestCase,
  output: string | object,
  prompt?: string,
  fallbackContext?: string,
): Promise<string> {
  let contextValue: string | undefined = test.vars?.context || fallbackContext;

  if (assertion.contextTransform) {
    try {
      const transformed = await transform(assertion.contextTransform, output, {
        vars: test.vars,
        prompt: { label: prompt },
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