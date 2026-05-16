import { type EvaluateTable, type EvaluateTableRow, type ResultsFile } from '../types/index';
import invariant from '../util/invariant';
import { getActualPrompt } from '../util/providerResponse';

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
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();
  const rowMap: Record<number, EvaluateTableRow> = {};

  for (const result of results.results) {
    addResultVars(result, varsForHeader);
    const row = rowMap[result.testIdx] || createTableRow(result, varsForHeader);
    applyActualPromptToVars(result);
    applySessionVars(result, varsForHeader);
    applyTransformDisplayVars(result, varsForHeader);
    varValuesForRow.set(result.testIdx, result.vars as Record<string, string>);
    rowMap[result.testIdx] = row;
    row.outputs[result.promptIdx] = createOutputCell(result);
    invariant(result.promptId, 'Prompt ID is required');
    row.testIdx = result.testIdx;
  }

  const rows = Object.values(rowMap);
  const sortedVars = [...varsForHeader].sort();
  for (const row of rows) {
    row.vars = sortedVars.map((varName) => {
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
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}

function addResultVars(
  result: ResultsFile['results']['results'][number],
  varsForHeader: Set<string>,
) {
  for (const varName of Object.keys(result.vars || {})) {
    varsForHeader.add(varName);
  }
}

function createTableRow(
  result: ResultsFile['results']['results'][number],
  varsForHeader: Set<string>,
): EvaluateTableRow {
  return {
    description: result.description || undefined,
    outputs: [],
    vars: result.vars
      ? [...varsForHeader].map((varName) => formatVarValue(result.vars?.[varName]))
      : [],
    test: result.testCase,
    testIdx: result.testIdx,
  };
}

function applyActualPromptToVars(result: ResultsFile['results']['results'][number]): void {
  const actualPrompt =
    getActualPrompt(result.response) || (result.metadata?.redteamFinalPrompt as string);
  if (!result.vars || !actualPrompt) {
    return;
  }
  const varKeys = Object.keys(result.vars);
  if (varKeys.length === 1 && varKeys[0] !== 'harmCategory') {
    result.vars[varKeys[0]] = actualPrompt;
    return;
  }
  if (varKeys.length <= 1) {
    return;
  }
  const keyToUpdate = ['prompt', 'query', 'question'].find((key) => result.vars?.[key]);
  if (keyToUpdate) {
    result.vars[keyToUpdate] = actualPrompt;
  }
}

function applySessionVars(
  result: ResultsFile['results']['results'][number],
  varsForHeader: Set<string>,
): void {
  if (result.vars?.sessionId) {
    return;
  }
  const metadataSessionIds = result.metadata?.sessionIds;
  const sessionValue =
    Array.isArray(metadataSessionIds) && metadataSessionIds.length > 0
      ? metadataSessionIds
          .filter((id) => id != null && id !== '')
          .map(String)
          .join('\n')
      : result.metadata?.sessionId;
  if (!sessionValue) {
    return;
  }
  result.vars = result.vars || {};
  result.vars.sessionId = sessionValue;
  varsForHeader.add('sessionId');
}

function applyTransformDisplayVars(
  result: ResultsFile['results']['results'][number],
  varsForHeader: Set<string>,
): void {
  const transformDisplayVars = result.response?.metadata?.transformDisplayVars as
    | Record<string, string>
    | undefined;
  if (!transformDisplayVars) {
    return;
  }
  result.vars = result.vars || {};
  for (const [key, value] of Object.entries(transformDisplayVars)) {
    if (result.vars[key]) {
      continue;
    }
    result.vars[key] = value;
    varsForHeader.add(key);
  }
}

function createOutputCell(result: ResultsFile['results']['results'][number]) {
  return {
    id: result.id || `${result.testIdx}-${result.promptIdx}`,
    ...result,
    text: buildResultText(result),
    prompt: result.prompt.raw,
    provider: result.provider?.label || result.provider?.id || 'unknown provider',
    pass: result.success,
    failureReason: result.failureReason,
    cost: result.cost || 0,
    tokenUsage: result.tokenUsage,
    audio: mapAudio(result.response?.audio),
    video: mapVideo(result.response?.video),
    images: result.response?.images?.map((img) => ({
      data: img.data,
      blobRef: img.blobRef,
      mimeType: img.mimeType,
    })),
  };
}

function buildResultText(result: ResultsFile['results']['results'][number]): string {
  const outputTextDisplay = formatOutputText(result.response?.output, result.error);
  if (result.testCase.assert) {
    return result.success ? `${outputTextDisplay || result.error || ''}` : `${outputTextDisplay}`;
  }
  if (result.error) {
    return `${result.error}`;
  }
  return outputTextDisplay;
}

function formatOutputText(output: unknown, error?: string | null): string {
  if (output !== null && typeof output === 'object') {
    return JSON.stringify(output);
  }
  if (output == null || output === '') {
    return error || '';
  }
  return String(output);
}

function formatVarValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

function mapAudio(
  audio: NonNullable<ResultsFile['results']['results'][number]['response']>['audio'],
) {
  if (!audio) {
    return undefined;
  }
  return {
    id: audio.id,
    expiresAt: audio.expiresAt,
    data: audio.data,
    blobRef: audio.blobRef,
    transcript: audio.transcript,
    format: audio.format,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    duration: audio.duration,
  };
}

function mapVideo(
  video: NonNullable<ResultsFile['results']['results'][number]['response']>['video'],
) {
  if (!video) {
    return undefined;
  }
  return {
    id: video.id,
    blobRef: video.blobRef,
    storageRef: video.storageRef,
    url: video.url,
    format: video.format,
    size: video.size,
    duration: video.duration,
    thumbnail: video.thumbnail,
    spritesheet: video.spritesheet,
    model: video.model,
    aspectRatio: video.aspectRatio,
    resolution: video.resolution,
  };
}
