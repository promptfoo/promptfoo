import { getHeaderForTable } from '../../../src/util/exportToFile/getHeaderForTable';

import type Eval from '../../../src/models/eval';
import type { TestCase } from '../../../src/types';

describe('getHeaderForTable', () => {
  let mockEval: Eval;

  beforeEach(() => {
    mockEval = {
      config: {
        defaultTest: undefined,
      },
      results: [],
    } as any;
  });

  it('should handle object defaultTest with vars', () => {
    mockEval.config.defaultTest = {
      vars: {
        defaultVar1: 'value1',
        defaultVar2: 'value2',
      },
    };

    mockEval.results = [
      {
        testCase: {
          vars: {
            testVar1: 'test1',
            defaultVar1: 'override1',
          },
        } as TestCase,
      },
      {
        testCase: {
          vars: {
            testVar2: 'test2',
            testVar3: 'test3',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    // Should include all unique var names from defaultTest and test cases
    expect(header.vars).toContain('defaultVar1');
    expect(header.vars).toContain('defaultVar2');
    expect(header.vars).toContain('testVar1');
    expect(header.vars).toContain('testVar2');
    expect(header.vars).toContain('testVar3');
  });

  it('should handle string defaultTest', () => {
    mockEval.config.defaultTest = 'file://path/to/defaultTest.yaml';

    mockEval.results = [
      {
        testCase: {
          vars: {
            var1: 'value1',
            var2: 'value2',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    // Should only include vars from test cases when defaultTest is a string
    expect(header.vars).toContain('var1');
    expect(header.vars).toContain('var2');
  });

  it('should handle undefined defaultTest', () => {
    mockEval.config.defaultTest = undefined;

    mockEval.results = [
      {
        testCase: {
          vars: {
            var1: 'value1',
            var2: 'value2',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    expect(header.vars).toContain('var1');
    expect(header.vars).toContain('var2');
  });

  it('should handle empty vars in defaultTest', () => {
    mockEval.config.defaultTest = {
      vars: {},
      assert: [{ type: 'equals', value: 'test' }],
    };

    mockEval.results = [
      {
        testCase: {
          vars: {
            var1: 'value1',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    expect(header.vars).toContain('var1');
  });

  it('should handle defaultTest with no vars property', () => {
    mockEval.config.defaultTest = {
      assert: [{ type: 'equals', value: 'test' }],
      options: { provider: 'openai:gpt-4' },
    };

    mockEval.results = [
      {
        testCase: {
          vars: {
            var1: 'value1',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    expect(header.vars).toContain('var1');
  });

  it('should deduplicate var names', () => {
    mockEval.config.defaultTest = {
      vars: {
        commonVar: 'default',
        defaultOnly: 'value',
      },
    };

    mockEval.results = [
      {
        testCase: {
          vars: {
            commonVar: 'override1',
            test1Var: 'value1',
          },
        } as TestCase,
      },
      {
        testCase: {
          vars: {
            commonVar: 'override2',
            test2Var: 'value2',
          },
        } as TestCase,
      },
    ] as any;

    const header = getHeaderForTable(mockEval);

    // Count occurrences of commonVar
    const commonVarCount = header.vars.filter((name) => name === 'commonVar').length;
    expect(commonVarCount).toBe(1);

    // All vars should be present
    expect(header.vars).toContain('commonVar');
    expect(header.vars).toContain('defaultOnly');
    expect(header.vars).toContain('test1Var');
    expect(header.vars).toContain('test2Var');
  });
});
