import { isScenarioConfigValuesRef, type TestCase } from '../../types/index';

import type Eval from '../../models/eval';

function getInlineScenarioTests(tests: unknown): TestCase[] {
  const entries = Array.isArray(tests) ? tests : tests ? [tests] : [];
  return entries.filter((test): test is TestCase =>
    Boolean(test && typeof test === 'object' && !Array.isArray(test) && !('path' in test)),
  );
}

export function getHeaderForTable(eval_: Eval) {
  const varsForHeader = new Set<string>();

  if (typeof eval_.config.defaultTest === 'object' && eval_.config.defaultTest?.vars) {
    for (const varName of Object.keys(eval_.config.defaultTest.vars || {})) {
      varsForHeader.add(varName);
    }
  }

  // Collect vars from actual evaluation results
  for (const result of eval_.results) {
    if (result.testCase?.vars) {
      for (const varName of Object.keys(result.testCase.vars)) {
        varsForHeader.add(varName);
      }
    }
  }

  // Handle the union type for tests (string | TestGeneratorConfig | Array<...>)
  const tests = eval_.config.tests;
  let testsArray: any[] = [];
  if (Array.isArray(tests)) {
    testsArray = tests;
  } else if (tests) {
    testsArray = [tests];
  }

  for (const test of testsArray) {
    if (typeof test === 'string') {
      continue;
    }
    // Skip TestGeneratorConfig objects as they don't have vars directly
    if (test && typeof test === 'object' && 'path' in test) {
      continue;
    }
    // Only process actual test cases with vars
    if (test && 'vars' in test) {
      for (const varName of Object.keys(test.vars || {})) {
        varsForHeader.add(varName);
      }
    }
  }

  for (const scenario of eval_.config.scenarios || []) {
    if (typeof scenario === 'string') {
      continue;
    }
    for (const config of scenario.config || []) {
      if (isScenarioConfigValuesRef(config)) {
        continue;
      }
      for (const varName of Object.keys(config.vars || {})) {
        varsForHeader.add(varName);
      }
    }
    for (const test of getInlineScenarioTests(scenario.tests)) {
      for (const varName of Object.keys(test.vars || {})) {
        varsForHeader.add(varName);
      }
    }
  }
  return {
    vars: [...varsForHeader].sort(),
    prompts: eval_.prompts,
  };
}
