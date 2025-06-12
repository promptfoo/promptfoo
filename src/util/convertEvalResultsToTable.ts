import { type EvaluateTable, type EvaluateTableRow, type ResultsFile } from '../types';
import invariant from '../util/invariant';

export function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(
    eval_.prompts,
    `Prompts are required in this version of the results file, this needs to be results file version >= 4, version: ${eval_.version}`,
  );
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();

  const rowMap: Record<number, EvaluateTableRow> = {};
  for (const result of results.results) {
    // vars
    for (const varName of Object.keys(result.vars || {})) {
      varsForHeader.add(varName);
    }

    const row = rowMap[result.testIdx] || {
      description: result.description || undefined,
      outputs: [],
      vars: result.vars
        ? Object.values(varsForHeader)
            .map((varName) => {
              const varValue = result.vars?.[varName] || '';
              if (typeof varValue === 'string') {
                return varValue;
              }
              return JSON.stringify(varValue);
            })
            .flat()
        : [],
      test: result.testCase,
    };

    if (result.vars && result.metadata?.redteamFinalPrompt) {
      const varKeys = Object.keys(result.vars);
      if (varKeys.length === 1 && varKeys[0] !== 'harmCategory') {
        result.vars[varKeys[0]] = result.metadata.redteamFinalPrompt;
      } else if (varKeys.length > 1) {
        // NOTE: This is a hack. We should use config.redteam.injectVar to determine which key to update but we don't have access to the config here
        const targetKeys = ['prompt', 'query', 'question'];
        const keyToUpdate = targetKeys.find((key) => result.vars[key]);
        if (keyToUpdate) {
          result.vars[keyToUpdate] = result.metadata.redteamFinalPrompt;
        }
      }
    }
    varValuesForRow.set(result.testIdx, result.vars as Record<string, string>);
    rowMap[result.testIdx] = row;

    // format text
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

    row.outputs[result.promptIdx] = {
      id: result.id || `${result.testIdx}-${result.promptIdx}`,
      ...result,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
      pass: result.success,
      failureReason: result.failureReason,
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
    invariant(result.promptId, 'Prompt ID is required');

    row.testIdx = result.testIdx;
  }

  const rows = Object.values(rowMap);
  const sortedVars = [...varsForHeader].sort();
  for (const row of rows) {
    row.vars = sortedVars.map((varName) => varValuesForRow.get(row.testIdx)?.[varName] || '');
  }

  return {
    head: {
      prompts: eval_.prompts,
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
