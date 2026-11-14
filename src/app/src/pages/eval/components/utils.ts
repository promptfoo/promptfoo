import { useSyncExternalStore } from 'react';

import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import { sanitizeGradingProviderDisplay } from '../../../../../util/sanitizer';
import type {
  EvaluateTable,
  EvaluateTableOutput,
  GradingResult,
  PromptMetrics,
} from '@promptfoo/types';

const EVAL_OUTPUT_PROMPT_HASH_PATTERN = /^#details-row-(\d+)-prompt-(\d+)$/;

export interface EvalOutputPromptHashTarget {
  rowIndex: number;
  promptIndex: number;
}

export interface EvalUrlParts {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Builds the URL hash used for deep-linking to an eval output details dialog.
 * Public URLs use one-based row/prompt numbers while the UI uses zero-based indexes internally.
 */
export function buildEvalOutputPromptHash(rowIndex: number, promptIndex: number): string {
  return `#details-row-${rowIndex + 1}-prompt-${promptIndex + 1}`;
}

/**
 * Parses an eval output details hash into zero-based row/prompt indexes.
 */
export function parseEvalOutputPromptHash(hash: string): EvalOutputPromptHashTarget | null {
  const match = hash.match(EVAL_OUTPUT_PROMPT_HASH_PATTERN);
  if (!match) {
    return null;
  }

  const rowNumber = Number.parseInt(match[1], 10);
  const promptNumber = Number.parseInt(match[2], 10);

  if (rowNumber < 1 || promptNumber < 1) {
    return null;
  }

  return {
    rowIndex: rowNumber - 1,
    promptIndex: promptNumber - 1,
  };
}

/**
 * Builds router location parts after mutating search params while preserving the current hash.
 *
 * If `source.hash` is omitted, reads the live `window.location.hash`. The dialog deep-link
 * code mutates the hash via `history.replaceState`, which doesn't update React Router's
 * `useLocation()`, so callers that read `location` from React Router must pass the hash
 * explicitly or omit it (in which case we read live).
 */
export function buildEvalUrlWithSearchParams(
  source: { pathname: string; search: string; hash?: string },
  mutateSearchParams: (params: URLSearchParams) => void,
): EvalUrlParts {
  const nextSearchParams = new URLSearchParams(source.search);
  mutateSearchParams(nextSearchParams);
  const nextSearch = nextSearchParams.toString();

  let hash: string;
  if (source.hash !== undefined) {
    hash = source.hash;
  } else if (typeof window === 'undefined') {
    hash = '';
  } else {
    hash = window.location.hash;
  }

  return {
    pathname: source.pathname,
    search: nextSearch ? `?${nextSearch}` : '',
    hash,
  };
}

/**
 * Shared subscription for the URL hash that the eval-output details dialogs use as a deep
 * link. We need a single source of truth because:
 *   1. `history.replaceState` (used by the dialog open/close handlers) does not fire
 *      `hashchange`, so per-component listeners would go stale silently.
 *   2. Tables can render thousands of cells; one global listener is much cheaper than one
 *      listener per cell.
 *
 * Components subscribe via `useEvalDetailsHash()`. Code that mutates the hash should call
 * `setEvalDetailsHash()`, which performs the `replaceState` and notifies subscribers.
 */
const evalDetailsHashListeners = new Set<() => void>();

function notifyEvalDetailsHashListeners(): void {
  for (const cb of evalDetailsHashListeners) {
    cb();
  }
}

if (typeof window !== 'undefined') {
  // Covers direct address-bar edits and back/forward navigation. `replaceState` is handled
  // explicitly by `setEvalDetailsHash`.
  window.addEventListener('hashchange', notifyEvalDetailsHashListeners);
}

function subscribeEvalDetailsHash(callback: () => void): () => void {
  evalDetailsHashListeners.add(callback);
  return () => {
    evalDetailsHashListeners.delete(callback);
  };
}

function getCurrentEvalDetailsHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export function setEvalDetailsHash(hash: string, rowPositionIndex?: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  const next = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
  const url = new URL(window.location.href);
  if (rowPositionIndex !== undefined) {
    url.searchParams.set('rowId', String(rowPositionIndex + 1));
  } else if (!next) {
    url.searchParams.delete('rowId');
  }
  url.hash = next;
  if (url.href === window.location.href) {
    return;
  }
  window.history.replaceState(window.history.state, '', url);
  notifyEvalDetailsHashListeners();
}

export function useEvalDetailsHash(): string {
  return useSyncExternalStore(subscribeEvalDetailsHash, getCurrentEvalDetailsHash, () => '');
}

/**
 * Creates a deterministic hash from a list of variable names.
 * Used to group evals with the same "schema" for column visibility persistence.
 * Evals with the same set of variables will share column visibility preferences.
 *
 * @param varNames - Array of variable names from the eval
 * @returns A string hash representing the schema
 */
export function hashVarSchema(varNames: string[]): string {
  // Sort to ensure consistent hash regardless of original order
  const sorted = [...varNames].sort();
  // Use JSON.stringify for robust serialization that handles any characters
  return JSON.stringify(sorted);
}

/**
 * Checks if an output has been manually rated by a user.
 * @param output - The evaluation output to check
 * @returns true if the output has a human rating in componentResults
 */
export function hasHumanRating(output: EvaluateTableOutput | null | undefined): boolean {
  if (!output?.gradingResult?.componentResults) {
    return false;
  }
  return output.gradingResult.componentResults.some(
    (result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE,
  );
}

/**
 * Retrieves the human rating componentResult if one exists.
 * @param output - The evaluation output to search
 * @returns The human rating componentResult or undefined if none exists
 */
export function getHumanRating(output: EvaluateTableOutput | null | undefined) {
  if (!output?.gradingResult?.componentResults) {
    return undefined;
  }
  return output.gradingResult.componentResults.find(
    (result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE,
  );
}

type NamedMetricTotalsSource = Pick<PromptMetrics, 'namedScoresCount' | 'namedScoreWeights'>;

export function getNamedMetricTotal(
  metrics: NamedMetricTotalsSource | null | undefined,
  metric: string,
): number {
  return metrics?.namedScoreWeights?.[metric] ?? metrics?.namedScoresCount?.[metric] ?? 0;
}

export function getNamedMetricTotals(
  metrics: NamedMetricTotalsSource | null | undefined,
): Record<string, number> | undefined {
  if (!metrics?.namedScoresCount && !metrics?.namedScoreWeights) {
    return undefined;
  }

  return {
    ...(metrics.namedScoresCount ?? {}),
    ...(metrics.namedScoreWeights ?? {}),
  };
}

/**
 * Assertion types whose `provider` is an LLM-as-a-judge (text grader), not an
 * embedding/classification/moderation provider. Used to gate the legacy
 * `assertion.provider` display fallback so e.g. `similar` embedding providers
 * are not labeled as Judges.
 */
const LLM_JUDGE_ASSERTION_TYPES = new Set<string>([
  'agent-rubric',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'conversation-relevance',
  'factuality',
  'g-eval',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'search-rubric',
  'trajectory:goal-success',
]);

function getAssertionBaseType(type: string | undefined): string | undefined {
  if (!type) {
    return undefined;
  }
  return type.startsWith('not-') ? type.slice(4) : type;
}

/**
 * Format a configured assertion provider for display. Unwraps typed maps such
 * as `{ text: 'litellm:judge' }` / `{ text: { id: '...' } }` the same way
 * `getGradingProvider` resolves the `text` entry for LLM judges.
 */
function formatConfiguredProvider(configured: unknown): string | undefined {
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }

  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    return undefined;
  }

  const record = configured as Record<string, unknown>;

  // Typed provider map: prefer the text grader entry used by LLM judges.
  if (Object.prototype.hasOwnProperty.call(record, 'text') && record.text != null) {
    return formatConfiguredProvider(record.text);
  }

  const id = record.id;
  if (typeof id === 'string' && id.trim()) {
    const label = record.label;
    return typeof label === 'string' && label.trim() && label.trim() !== id.trim()
      ? `${id.trim()} (${label.trim()})`
      : id.trim();
  }

  return undefined;
}

/**
 * Resolve the LLM-as-a-judge provider id for display.
 * Prefer the runtime-persisted `metadata.gradingProvider`; fall back to an
 * explicitly configured `assertion.provider` for older eval results, but only
 * when the assertion type actually invokes an LLM judge.
 */
export function getGradingProviderDisplay(
  result: GradingResult | null | undefined,
): string | undefined {
  const display = resolveGradingProviderDisplay(result);
  return display === undefined ? undefined : sanitizeGradingProviderDisplay(display);
}

function resolveGradingProviderDisplay(
  result: GradingResult | null | undefined,
): string | undefined {
  const fromMeta = result?.metadata?.gradingProvider;
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    return fromMeta.trim();
  }

  const baseType = getAssertionBaseType(result?.assertion?.type);
  if (!baseType || !LLM_JUDGE_ASSERTION_TYPES.has(baseType)) {
    return undefined;
  }

  // search-rubric may swap in a web-search-capable provider at runtime and
  // records that actual grader as metadata.searchProvider.
  if (baseType === 'search-rubric') {
    const fromSearch = result?.metadata?.searchProvider;
    if (typeof fromSearch === 'string' && fromSearch.trim()) {
      return fromSearch.trim();
    }
    if (result?.metadata?.graderError) {
      return undefined;
    }
  }

  return formatConfiguredProvider(result?.assertion?.provider);
}

function collectGradingProvidersFromResult(
  result: GradingResult | null | undefined,
  out: Set<string>,
): void {
  if (!result) {
    return;
  }
  const display = getGradingProviderDisplay(result);
  if (display) {
    out.add(display);
  }
  for (const child of result.componentResults ?? []) {
    collectGradingProvidersFromResult(child, out);
  }
}

/**
 * Unique judge provider ids found across loaded eval table outputs.
 */
export function collectUniqueGradingProviders(table: EvaluateTable | null | undefined): string[] {
  const providers = new Set<string>();
  if (!table?.body) {
    return [];
  }
  for (const row of table.body) {
    for (const output of row.outputs ?? []) {
      collectGradingProvidersFromResult(output?.gradingResult, providers);
    }
  }
  return Array.from(providers).sort((a, b) => a.localeCompare(b));
}
