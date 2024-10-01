import type { VisibilityState } from '@tanstack/table-core';
import { get, set, del } from 'idb-keyval';
import invariant from 'tiny-invariant';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CompletedPrompt,
  EvaluateSummary,
  EvaluateTable,
  EvaluateTableRow,
  ResultsFile,
  TokenUsage,
  UnifiedConfig,
} from './types';

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

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

interface ColumnState {
  selectedColumns: string[];
  columnVisibility: VisibilityState;
}

function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(eval_.version >= 4, 'Results file version must be 4 or higher');
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
        test: {},
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

interface TableState {
  evalId: string | null;
  setEvalId: (evalId: string) => void;

  author: string | null;
  setAuthor: (author: string | null) => void;

  table: EvaluateTable | null;
  setTable: (resultsFile: ResultsFile | null) => void;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;

  maxTextLength: number;
  setMaxTextLength: (maxTextLength: number) => void;
  wordBreak: 'break-word' | 'break-all';
  setWordBreak: (wordBreak: 'break-word' | 'break-all') => void;
  showInferenceDetails: boolean;
  setShowInferenceDetails: (showInferenceDetails: boolean) => void;
  renderMarkdown: boolean;
  setRenderMarkdown: (renderMarkdown: boolean) => void;
  prettifyJson: boolean;
  setPrettifyJson: (prettifyJson: boolean) => void;
  showPrompts: boolean;
  setShowPrompts: (showPrompts: boolean) => void;
  showPassFail: boolean;
  setShowPassFail: (showPassFail: boolean) => void;

  inComparisonMode: boolean;
  setInComparisonMode: (inComparisonMode: boolean) => void;

  columnStates: Record<string, ColumnState>;
  setColumnState: (evalId: string, state: ColumnState) => void;
}

export const useStore = create<TableState>()(
  persist(
    (set, get) => ({
      evalId: null,
      setEvalId: (evalId: string) => set(() => ({ evalId })),

      author: null,
      setAuthor: (author: string | null) => set(() => ({ author })),

      table: null,
      setTable: (resultsFile: ResultsFile | null) => {
        if (resultsFile?.version && resultsFile.version >= 4) {
          set(() => ({ table: convertResultsToTable(resultsFile) }));
        } else {
          const results = resultsFile?.results as EvaluateSummary;
          set(() => ({ table: results?.table }));
        }
      },
      config: null,
      setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),

      maxTextLength: 250,
      setMaxTextLength: (maxTextLength: number) => set(() => ({ maxTextLength })),
      wordBreak: 'break-word',
      setWordBreak: (wordBreak: 'break-word' | 'break-all') => set(() => ({ wordBreak })),
      showInferenceDetails: true,
      setShowInferenceDetails: (showInferenceDetails: boolean) =>
        set(() => ({ showInferenceDetails })),
      renderMarkdown: false,
      setRenderMarkdown: (renderMarkdown: boolean) => set(() => ({ renderMarkdown })),
      prettifyJson: false,
      setPrettifyJson: (prettifyJson: boolean) => set(() => ({ prettifyJson })),
      showPrompts: false,
      setShowPrompts: (showPrompts: boolean) => set(() => ({ showPrompts })),
      showPassFail: true,
      setShowPassFail: (showPassFail: boolean) => set(() => ({ showPassFail })),

      inComparisonMode: false,
      setInComparisonMode: (inComparisonMode: boolean) => set(() => ({ inComparisonMode })),

      columnStates: {},
      setColumnState: (evalId: string, state: ColumnState) =>
        set((prevState) => ({
          columnStates: {
            ...prevState.columnStates,
            [evalId]: state,
          },
        })),
    }),
    {
      name: 'ResultsViewStorage',
      storage: createJSONStorage(() => storage),
    },
  ),
);
