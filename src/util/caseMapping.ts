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
  for (const [snake, camel] of [
    ['pass_', 'pass'],
    ['named_scores', 'namedScores'],
    ['named_score_weights', 'namedScoreWeights'],
    ['component_results', 'componentResults'],
    ['tokens_used', 'tokensUsed'],
  ]) {
    if (snake in result && !(camel in result)) {
      result[camel] = result[snake];
    }
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
