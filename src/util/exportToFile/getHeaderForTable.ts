import type Eval from '../../models/eval';

export function getHeaderForTable(eval_: Eval) {
  const varsForHeader = new Set<string>();

  if (eval_.config.defaultTest?.vars) {
    for (const varName of Object.keys(eval_.config.defaultTest.vars || {})) {
      varsForHeader.add(varName);
    }
  }

  for (const test of eval_.config.tests || []) {
    if (typeof test === 'string') {
      continue;
    }
    for (const varName of Object.keys(test.vars || {})) {
      varsForHeader.add(varName);
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
