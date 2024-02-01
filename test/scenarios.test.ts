import { addTestsFromScenarios } from '../src/scenarios';

import { describe, it, expect } from '@jest/globals';
import type { TestSuite } from '../src/types';

describe('addTestsFromScenarios', () => {
  it('should add tests from scenarios to the test suite', () => {
    const testSuite: TestSuite = {
      description: 'Test suite for scenario tests',
      providers: [],
      prompts: [],
      scenarios: [
        {
          config: [
            {
              vars: {
                key1: 'value1',
                key2: 'value2',
              },
            },
          ],
          tests: [
            {
              description: 'Test case 1',
              vars: {
                key1: 'overridden_value1',
              },
              assert: [],
            },
          ],
        },
      ],
    };

    const updatedTestSuite = addTestsFromScenarios(testSuite);
    expect(updatedTestSuite.scenarios?.[0]?.tests?.[0]?.vars?.key1).toBe('overridden_value1');
  });


  it('should handle without scenarios', () => {
    const emptyScenariosTestSuite: TestSuite = {
      description: 'Test suite without scenarios',
      providers: [],
      prompts: [],
      tests: [
        {
          vars: { var1: 'First run' },
        },
        {
          vars: { var1: 'Second run' },
        },
      ],
    };

    const updatedTestSuite = addTestsFromScenarios(emptyScenariosTestSuite);
    expect(updatedTestSuite.tests).toBeDefined();
    expect(updatedTestSuite.tests?.length).toBe(2);
  });
});
