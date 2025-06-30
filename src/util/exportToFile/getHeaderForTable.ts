import type Eval from '../../models/eval';

export function getHeaderForTable(eval_: Eval) {
  const varsForHeader = new Set<string>();

  if (eval_.config.defaultTest?.vars) {
    for (const varName of Object.keys(eval_.config.defaultTest.vars || {})) {
      varsForHeader.add(varName);
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
      for (const varName of Object.keys(config.vars || {})) {
        varsForHeader.add(varName);
      }
    }
    for (const test of scenario.tests || []) {
      if (typeof test === 'string') {
        continue;
      }
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
