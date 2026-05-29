import type { GradingResult } from '../types/index';
import type { StatableResult } from './types';

/**
 * Assert-set results are flattened as both an aggregate parent and leaf child
 * rows. The aggregate parent has nested componentResults but no concrete
 * assertion, so counting it as "unknown" double-counts the user's assertions.
 */
export function isAggregateAssertionComponent(componentResult: GradingResult): boolean {
  return (
    !componentResult.assertion &&
    Array.isArray(componentResult.componentResults) &&
    componentResult.componentResults.length > 0
  );
}

export function getCountableAssertionComponents(result: StatableResult): GradingResult[] {
  return (result.gradingResult?.componentResults || []).filter(
    (componentResult) => !isAggregateAssertionComponent(componentResult),
  );
}
