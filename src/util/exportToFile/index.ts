import type EvalResult from '../../models/evalResult';
import type { EvaluateTableOutput, EvaluateTableRow } from '../../types';

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
    audio: result.response?.audio
      ? {
          id: result.response.audio.id,
          expiresAt: result.response.audio.expiresAt,
          data: result.response.audio.data,
          transcript: result.response.audio.transcript,
          format: result.response.audio.format,
        }
      : undefined,
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
    testIdx: results[0].testIdx,
  };

  for (const result of results) {
    row.outputs[result.promptIdx] = convertEvalResultToTableCell(result);
  }

  return row;
}
