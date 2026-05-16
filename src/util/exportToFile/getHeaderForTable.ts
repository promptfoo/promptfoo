import type Eval from '../../models/eval';

export function getHeaderForTable(eval_: Eval) {
  const varsForHeader = new Set<string>();

  addVarsFromDefaultTest(eval_, varsForHeader);
  addVarsFromResults(eval_, varsForHeader);
  addVarsFromTests(eval_, varsForHeader);
  addVarsFromScenarios(eval_, varsForHeader);

  return {
    vars: [...varsForHeader].sort(),
    prompts: eval_.prompts,
  };
}

function addVarsFromDefaultTest(eval_: Eval, varsForHeader: Set<string>): void {
  if (typeof eval_.config.defaultTest !== 'object' || !eval_.config.defaultTest?.vars) {
    return;
  }
  addVarNames(eval_.config.defaultTest.vars, varsForHeader);
}

function addVarsFromResults(eval_: Eval, varsForHeader: Set<string>): void {
  for (const result of eval_.results) {
    addVarNames(result.testCase?.vars, varsForHeader);
  }
}

function addVarsFromTests(eval_: Eval, varsForHeader: Set<string>): void {
  for (const test of normalizeTests(eval_.config.tests)) {
    if (!isTestCaseWithVars(test)) {
      continue;
    }
    addVarNames(test.vars, varsForHeader);
  }
}

function addVarsFromScenarios(eval_: Eval, varsForHeader: Set<string>): void {
  for (const scenario of eval_.config.scenarios || []) {
    if (typeof scenario === 'string') {
      continue;
    }
    addVarsFromScenarioConfigs(scenario.config || [], varsForHeader);
    addVarsFromScenarioTests(scenario.tests || [], varsForHeader);
  }
}

function addVarsFromScenarioConfigs(
  configs: Array<{ vars?: Record<string, unknown> }>,
  varsForHeader: Set<string>,
): void {
  for (const config of configs) {
    addVarNames(config.vars, varsForHeader);
  }
}

function addVarsFromScenarioTests(tests: unknown[], varsForHeader: Set<string>): void {
  for (const test of tests) {
    if (!isTestCaseWithVars(test)) {
      continue;
    }
    addVarNames(test.vars, varsForHeader);
  }
}

function normalizeTests(tests: Eval['config']['tests']): unknown[] {
  if (Array.isArray(tests)) {
    return tests;
  }
  return tests ? [tests] : [];
}

function isTestCaseWithVars(test: unknown): test is { vars?: Record<string, unknown> } {
  return typeof test === 'object' && test !== null && !('path' in test) && 'vars' in test;
}

function addVarNames(vars: Record<string, unknown> | undefined, varsForHeader: Set<string>): void {
  for (const varName of Object.keys(vars || {})) {
    varsForHeader.add(varName);
  }
}
