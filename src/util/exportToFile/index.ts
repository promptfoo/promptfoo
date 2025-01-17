import type Eval from '../../models/eval';
import type EvalResult from '../../models/evalResult';
import type { EvaluateTableOutput, EvaluateTableRow } from '../../types';

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

export function convertEvalResultToTableCell(result: EvalResult): EvaluateTableOutput {
  let resultText: string | undefined;
  const failReasons = (result.gradingResult?.componentResults || [])
    .filter((result) => (result ? !result.pass : false))
    .map((result) => result.reason)
    .join(' --- ');
  const outputTextDisplay = (
    typeof result.response?.output === 'object'
      ? JSON.stringify(result.response.output)
      : result.response?.output || result.error || ''
  ) as string;
  if (result.testCase.assert) {
    if (result.success) {
      resultText = `${outputTextDisplay || result.error || ''}`;
    } else {
      resultText = `${result.error || failReasons}\n---\n${outputTextDisplay}`;
    }
  } else if (result.error) {
    resultText = `${result.error}`;
  } else {
    resultText = outputTextDisplay;
  }

  return {
    ...result,
    id: result.id || `${result.testIdx}-${result.promptIdx}`,
    text: resultText || '',
    prompt: result.prompt.raw,
    provider: result.provider?.label || result.provider?.id || 'unknown provider',
    pass: result.success,
    cost: result.cost || 0,
  };
}

export function convertTestResultsToTableRow(
  results: EvalResult[],
  varsForHeader: string[],
): EvaluateTableRow {
  const row = {
    description: results[0].description || undefined,
    outputs: [] as EvaluateTableRow['outputs'],
    vars: results[0].testCase.vars
      ? Object.values(varsForHeader)
          .map((varName) => {
            const varValue = results[0].testCase.vars?.[varName] || '';
            if (typeof varValue === 'string') {
              return varValue;
            }
            return JSON.stringify(varValue);
          })
          .flat()
      : [],
    test: results[0].testCase,
  };

  for (const result of results) {
    row.outputs[result.promptIdx] = convertEvalResultToTableCell(result);
  }

  return row;
}
