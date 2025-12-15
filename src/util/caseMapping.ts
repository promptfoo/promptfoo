/**
 * Recursively map snake_case keys to camelCase for Python/Ruby compatibility.
 * Python and Ruby conventionally use snake_case for identifiers, while JavaScript
 * uses camelCase. This function handles results from assertion scripts that may
 * return snake_case keys (e.g., 'named_scores' instead of 'namedScores').
 *
 * @param obj - Object with potentially snake_case keys
 * @returns Object with camelCase keys
 */
export function mapSnakeCaseToCamelCase(obj: Record<string, any>): Record<string, any> {
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
