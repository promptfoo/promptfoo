import type { TestCase } from '../../..';

export function sortTestCasesByHarmCategory(testCases: TestCase[]): TestCase[] {
  return testCases.sort((a, b) => {
    const categoryComparison = (a?.metadata?.harmCategory || '').localeCompare(
      b?.metadata?.harmCategory || '',
    );
    if (categoryComparison !== 0) {
      return categoryComparison;
    }
    return JSON.stringify(a?.vars || {}).localeCompare(JSON.stringify(b?.vars || {}));
  });
}
