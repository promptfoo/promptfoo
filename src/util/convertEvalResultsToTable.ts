import invariant from 'tiny-invariant';
import type {
  CompletedPrompt,
  EvaluateTable,
  EvaluateTableRow,
  ResultsFile,
  TokenUsage,
} from '../types';

class PromptMetrics {
  score: number;
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  tokenUsage: TokenUsage;
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  cost: number;

  constructor() {
    this.score = 0;
    this.testPassCount = 0;
    this.testFailCount = 0;
    this.assertPassCount = 0;
    this.assertFailCount = 0;
    this.totalLatencyMs = 0;
    this.tokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
    };
    this.namedScores = {};
    this.namedScoresCount = {};
    this.cost = 0;
  }
}

export function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(
    eval_.prompts,
    `Prompts are required in this version of the results file, this needs to be results file version >= 4, version: ${eval_.version}`,
  );
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const rows: EvaluateTableRow[] = [];
  const completedPrompts: Record<string, CompletedPrompt> = {};
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();
  for (const result of results.results) {
    // vars
    for (const varName of Object.keys(result.vars || {})) {
      varsForHeader.add(varName);
    }
    let row = rows[result.testCaseIdx];
    if (!row) {
      rows[result.testCaseIdx] = {
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
      varValuesForRow.set(result.testCaseIdx, result.vars as Record<string, string>);
      row = rows[result.testCaseIdx];
    }

    // format text
    let resultText: string | undefined;
    const outputTextDisplay = (
      typeof result.response?.output === 'object'
        ? JSON.stringify(result.response.output)
        : result.response?.output || result.error || ''
    ) as string;
    if (result.testCase.assert) {
      if (result.success) {
        resultText = `${outputTextDisplay || result.error || ''}`;
      } else {
        resultText = `${result.error}\n---\n${outputTextDisplay}`;
      }
    } else if (result.error) {
      resultText = `${result.error}`;
    } else {
      resultText = outputTextDisplay;
    }

    row.outputs[result.promptIdx] = {
      id: `${result.testCaseIdx}-${result.promptIdx}`,
      ...result,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
      pass: result.success,
      cost: result.cost || 0,
    };
    invariant(result.promptId, 'Prompt ID is required');
    const completedPromptId = `${result.promptId}-${JSON.stringify(result.provider)}`;
    if (!completedPrompts[completedPromptId]) {
      completedPrompts[completedPromptId] = {
        ...result.prompt,
        provider: result.provider?.label || result.provider?.id || 'unknown provider',
        metrics: new PromptMetrics(),
      };
    }
    const prompt = completedPrompts[completedPromptId];
    invariant(prompt.metrics, 'Prompt metrics are required');
    prompt.metrics.score += result.score;
    prompt.metrics.testPassCount += result.success ? 1 : 0;
    prompt.metrics.testFailCount += result.success ? 0 : 1;
    prompt.metrics.assertPassCount +=
      result.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
    prompt.metrics.assertFailCount +=
      result.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
    prompt.metrics.totalLatencyMs += result.latencyMs || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.cached += result.providerResponse?.tokenUsage?.cached || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.completion += result.providerResponse?.tokenUsage?.completion || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.prompt += result.providerResponse?.tokenUsage?.prompt || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.total += result.providerResponse?.tokenUsage?.total || 0;
    prompt.metrics.cost += result.cost || 0;
    prompt.metrics.namedScores = eval_.prompts[result.promptIdx]?.metrics?.namedScores || {};
    prompt.metrics.namedScoresCount =
      eval_.prompts[result.promptIdx]?.metrics?.namedScoresCount || {};
  }

  const sortedVars = [...varsForHeader].sort();
  for (const [rowIdx, row] of rows.entries()) {
    row.vars = sortedVars.map((varName) => varValuesForRow.get(rowIdx)?.[varName] || '');
  }
  return {
    head: {
      prompts: Object.values(completedPrompts),
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
