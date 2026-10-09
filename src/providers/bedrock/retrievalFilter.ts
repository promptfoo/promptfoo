/**
 * Check operator shapes before the SDK silently drops unknown filter keys.
 */
export function isValidBedrockRetrievalFilter(filter: unknown): boolean {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return false;
  }
  const entries = Object.entries(filter).filter(([, value]) => value !== undefined);
  if (entries.length !== 1) {
    return false;
  }
  const [operator, operand] = entries[0];
  if (operator === 'andAll' || operator === 'orAll') {
    return (
      Array.isArray(operand) &&
      operand.length >= 2 &&
      operand.every((child) => isValidBedrockRetrievalFilter(child))
    );
  }
  // Preserve the SDK's explicit escape hatch for a newer union member.
  if (operator === '$unknown') {
    return (
      Array.isArray(operand) &&
      operand.length === 2 &&
      typeof operand[0] === 'string' &&
      operand[1] !== undefined
    );
  }
  return (
    [
      'equals',
      'notEquals',
      'greaterThan',
      'greaterThanOrEquals',
      'lessThan',
      'lessThanOrEquals',
      'in',
      'notIn',
      'startsWith',
      'listContains',
      'stringContains',
    ].includes(operator) &&
    operand !== null &&
    typeof operand === 'object' &&
    !Array.isArray(operand) &&
    typeof operand.key === 'string' &&
    operand.value !== undefined
  );
}
