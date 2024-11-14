import type { TestCase } from '../../../types';

export function sortTestCasesByCategory(a: TestCase, b: TestCase): number {
  const categoryComparison = (a?.metadata?.harmCategory || '').localeCompare(
    b?.metadata?.harmCategory || '',
  );
  if (categoryComparison !== 0) {
    return categoryComparison;
  }
  return JSON.stringify(a?.vars || {}).localeCompare(JSON.stringify(b?.vars || {}));
}
