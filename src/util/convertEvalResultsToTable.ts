import logger from '../logger';
import {
  type EvaluateResult,
  type EvaluateTable,
  type EvaluateTableRow,
  type ResultsFile,
} from '../types/index';
import invariant from '../util/invariant';
import { getActualPrompt } from '../util/providerResponse';
import { convertEvalResultToTableCell } from './exportToFile/index';

/** Build display-only variables without changing stored evaluation results. */
export function getDisplayVars(result: Pick<EvaluateResult, 'vars' | 'response' | 'metadata'>) {
  let displayVars = result.vars ? { ...result.vars } : undefined;

  // Get the actual prompt from response.prompt (provider-reported) or legacy redteamFinalPrompt
  // Check both result.response.metadata and result.metadata for legacy compatibility
  const actualPrompt =
    getActualPrompt(result.response) || (result.metadata?.redteamFinalPrompt as string);

  if (displayVars && actualPrompt) {
    const varKeys = Object.keys(displayVars);
    if (varKeys.length === 1 && varKeys[0] !== 'harmCategory') {
      displayVars[varKeys[0]] = actualPrompt;
    } else if (varKeys.length > 1) {
      // NOTE: This is a hack. We should use config.redteam.injectVar to determine which key to update but we don't have access to the config here
      const targetKeys = ['prompt', 'query', 'question'];
      const keyToUpdate = targetKeys.find((key) => displayVars?.[key]);
      if (keyToUpdate) {
        displayVars[keyToUpdate] = actualPrompt;
      }
    }
  }

  // Copy sessionId from metadata to vars for display if not already present
  // Multi-turn strategies (IterativeMeta, Crescendo, etc.) store multiple sessionIds in metadata.sessionIds array
  // Single-turn strategies store a single sessionId in metadata.sessionId
  if (!displayVars?.sessionId) {
    const metadataSessionIds = result.metadata?.sessionIds;
    if (Array.isArray(metadataSessionIds) && metadataSessionIds.length > 0) {
      displayVars = displayVars || {};
      displayVars.sessionId = metadataSessionIds
        .filter((id) => id != null && id !== '')
        .map(String)
        .join('\n');
    } else if (result.metadata?.sessionId) {
      displayVars = displayVars || {};
      displayVars.sessionId = result.metadata.sessionId;
    }
  }

  // Copy transformDisplayVars from response metadata to vars for display
  // This handles layer mode where embeddedInjection is set at runtime, not in test case vars
  const transformDisplayVars = result.response?.metadata?.transformDisplayVars as
    | Record<string, string>
    | undefined;
  if (transformDisplayVars) {
    displayVars = displayVars || {};
    for (const [key, value] of Object.entries(transformDisplayVars)) {
      // Use `key in` so a legitimate falsy value (empty string, 0, false)
      // is not silently overwritten by the transform display value.
      if (!(key in displayVars)) {
        displayVars[key] = value;
      } else if (displayVars[key] !== value) {
        // Leave a breadcrumb for users debugging a "missing" display var.
        logger.debug(
          `[convertResultsToTable] transformDisplayVars key '${key}' collides with result.vars; preserving original value`,
        );
      }
    }
  }

  return displayVars;
}

/**
 * Converts evaluation results from a ResultsFile into a table format for display.
 * Processes test results, formats variables (including pretty-printing objects/arrays as JSON),
 * handles redteam prompts, and structures data for console table and HTML output.
 *
 * @param eval_ - The results file containing evaluation data (requires version >= 4)
 * @returns An EvaluateTable with formatted headers and body rows for display
 */
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

    const displayVars = getDisplayVars(result);
    for (const varName of Object.keys(displayVars || {})) {
      varsForHeader.add(varName);
    }

    varValuesForRow.set(result.testIdx, displayVars as Record<string, string>);
    rowMap[result.testIdx] = row;

    row.outputs[result.promptIdx] = convertEvalResultToTableCell({
      ...result,
      ...(displayVars && { vars: displayVars }),
    });
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
