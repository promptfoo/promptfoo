import logger from '../logger';
import invariant from '../util/invariant';
import { getActualPrompt } from '../util/providerResponse';
import { getTableCellMedia, getTableCellText } from './evalTableCells';

import type { EvaluateResult, EvaluateTable, EvaluateTableRow, ResultsFile } from '../types/index';

/** Historical prompt values can be structured JSON, including a literal toString field. */
export function promptText(value: unknown): string {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export function getExecutedPrompt(result: Pick<EvaluateResult, 'response' | 'metadata'>): string {
  return (
    promptText(getActualPrompt(result.response)) || promptText(result.metadata?.redteamFinalPrompt)
  );
}

/** Build display-only variables without changing stored evaluation results. */
export function getDisplayVars(
  result: Pick<EvaluateResult, 'vars' | 'response' | 'metadata'>,
  injectVar = 'prompt',
) {
  let displayVars = result.vars ? { ...result.vars } : undefined;
  const actualPrompt = getExecutedPrompt(result);
  if (displayVars && actualPrompt) {
    const keys = Object.keys(displayVars);
    const target =
      keys.length === 1
        ? keys[0]
        : [injectVar, 'prompt', 'query', 'question'].find(
            (key) => keys.includes(key) && displayVars?.[key],
          );
    if (
      target &&
      target !== 'harmCategory' &&
      displayVars[target] &&
      displayVars[target] !== '[prompt stripped]'
    ) {
      displayVars[target] = actualPrompt;
    }
  }

  // Session metadata supplies display values for single and multi-turn runs.
  if (!displayVars?.sessionId) {
    const metadataSessionIds = result.metadata?.sessionIds;
    if (Array.isArray(metadataSessionIds) && metadataSessionIds.length > 0) {
      displayVars ??= {};
      displayVars.sessionId = metadataSessionIds
        .filter((id) => id != null && id !== '')
        .map(String)
        .join('\n');
    } else if (result.metadata?.sessionId) {
      displayVars ??= {};
      displayVars.sessionId = result.metadata.sessionId;
    }
  }

  // Runtime transforms can add variables absent from the test case.
  const transformDisplayVars = result.response?.metadata?.transformDisplayVars as
    | Record<string, string>
    | undefined;
  if (transformDisplayVars) {
    displayVars ??= {};
    for (const [key, value] of Object.entries(transformDisplayVars)) {
      // Preserve existing values, including empty strings, zero, and false.
      if (!(key in displayVars)) {
        displayVars[key] = value;
      } else if (displayVars[key] !== value) {
        logger.debug(
          `[convertResultsToTable] transformDisplayVars key '${key}' collides with result.vars; preserving original value`,
        );
      }
    }
  }

  return displayVars;
}

export function getReportPrompt(result: EvaluateResult, injectVar?: string): string {
  const vars = getDisplayVars(result, injectVar);
  return (
    (injectVar && promptText(vars?.[injectVar])) ||
    promptText(vars?.query) ||
    promptText(vars?.prompt) ||
    promptText(result.prompt.raw)
  );
}

/** Convert version 4+ results to display rows and ordered variable columns. */
export function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(
    eval_.prompts,
    `Prompts are required in this version of the results file, this needs to be results file version >= 4, version: ${eval_.version}`,
  );
  const results = eval_.results;
  // Guard against malformed payloads where `vars` is present but not an array
  // (corrupt store, schema skew across server versions). Warn so the bad
  // writer is visible instead of silently rendering an alphabetized fallback.
  const rawPersistedVars = eval_.vars;
  if (rawPersistedVars !== undefined && !Array.isArray(rawPersistedVars)) {
    logger.warn(
      `[convertResultsToTable] eval.vars is ${typeof rawPersistedVars}, not string[]; falling back to alphabetical ordering`,
    );
  }
  // Dedup via Set construction. Persisted vars should already be unique
  // (Eval.setVars and the evaluator's Set guarantee this), but a corrupt
  // payload would otherwise render duplicate header columns and row cells.
  const persistedVarSet = new Set<string>(Array.isArray(rawPersistedVars) ? rawPersistedVars : []);
  const persistedVars = Array.from(persistedVarSet);
  const varsForHeader = new Set<string>(persistedVars);
  const varValuesForRow = new Map<number, Record<string, string>>();

  const rowMap: Record<number, EvaluateTableRow> = {};
  for (const result of results.results) {
    // row.vars is reassigned later from `orderedVars`; initialize empty.
    const row = rowMap[result.testIdx] || {
      description: result.description || undefined,
      outputs: [],
      vars: [],
      test: result.testCase,
    };

    const displayVars = getDisplayVars(result, eval_.config?.redteam?.injectVar);
    for (const varName of Object.keys(displayVars || {})) {
      varsForHeader.add(varName);
    }

    varValuesForRow.set(result.testIdx, displayVars as Record<string, string>);
    rowMap[result.testIdx] = row;

    // format text
    const resultText = getTableCellText(result);

    row.outputs[result.promptIdx] = {
      ...result,
      id: result.id || `${result.testIdx}-${result.promptIdx}`,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
      pass: result.success,
      failureReason: result.failureReason,
      cost: result.cost || 0,
      tokenUsage: result.tokenUsage,
      ...getTableCellMedia(result),
    };
    invariant(result.promptId, 'Prompt ID is required');

    row.testIdx = result.testIdx;
  }

  const rows = Object.values(rowMap);
  // Preserve the configured prefix and deterministically append runtime/display-only columns.
  // Legacy result payloads do not have a persisted prefix, so all columns are sorted.
  const additionalVars = [...varsForHeader].filter((name) => !persistedVarSet.has(name)).sort();
  const orderedVars =
    persistedVars.length > 0 ? [...persistedVars, ...additionalVars] : additionalVars;
  for (const row of rows) {
    row.vars = orderedVars.map((varName) => {
      const varValue = varValuesForRow.get(row.testIdx)?.[varName] ?? '';
      if (typeof varValue === 'string') {
        return varValue;
      }
      return JSON.stringify(varValue, null, 2);
    });
  }

  return {
    head: {
      prompts: eval_.prompts,
      vars: orderedVars,
    },
    body: rows,
  };
}
