import type { TestCase } from '../../types';

export function addPersona(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:persona',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Persona`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: 'persona',
    },
  }));
} 