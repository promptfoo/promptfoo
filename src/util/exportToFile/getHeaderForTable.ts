import type Eval from '../../models/eval';

function addVarsFromObject(varsForHeader: Set<string>, obj: Record<string, any> | undefined): void {
  for (const varName of Object.keys(obj || {})) {
    varsForHeader.add(varName);
  }
}

function addVarsFromDefaultTest(varsForHeader: Set<string>, eval_: Eval): void {
  if (typeof eval_.config.defaultTest !== 'object' || !eval_.config.defaultTest?.vars) {
    return;
  }
  addVarsFromObject(varsForHeader, eval_.config.defaultTest.vars as Record<string, any>);
}

function addVarsFromResults(varsForHeader: Set<string>, eval_: Eval): void {
  for (const result of eval_.results) {
    if (result.testCase?.vars) {
      addVarsFromObject(varsForHeader, result.testCase.vars as Record<string, any>);
    }
  }
}

function addVarsFromTests(varsForHeader: Set<string>, eval_: Eval): void {
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
      addVarsFromObject(varsForHeader, test.vars || {});
    }
  }
}

function addVarsFromScenarios(varsForHeader: Set<string>, eval_: Eval): void {
  for (const scenario of eval_.config.scenarios || []) {
    if (typeof scenario === 'string') {
      continue;
    }
    for (const config of scenario.config || []) {
      addVarsFromObject(varsForHeader, config.vars || {});
    }
    for (const test of scenario.tests || []) {
      if (typeof test === 'string') {
        continue;
      }
      addVarsFromObject(varsForHeader, test.vars || {});
    }
  }
}

export function getHeaderForTable(eval_: Eval) {
  const varsForHeader = new Set<string>();

  addVarsFromDefaultTest(varsForHeader, eval_);
  addVarsFromResults(varsForHeader, eval_);
  addVarsFromTests(varsForHeader, eval_);
  addVarsFromScenarios(varsForHeader, eval_);

  return {
    vars: [...varsForHeader].sort(),
    prompts: eval_.prompts,
  };
}
