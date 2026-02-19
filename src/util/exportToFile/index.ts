import type EvalResult from '../../models/evalResult';
import type {
  AtomicTestCase,
  EvaluateTableOutput,
  EvaluateTableRow,
  ProviderResponse,
} from '../../types/index';

export function convertEvalResultToTableCell(result: EvalResult): EvaluateTableOutput {
  let resultText: string | undefined;
  const rawOutput = result.response?.output;
  let outputTextDisplay: string;
  if (rawOutput !== null && typeof rawOutput === 'object') {
    outputTextDisplay = JSON.stringify(rawOutput);
  } else if (rawOutput == null || rawOutput === '') {
    outputTextDisplay = result.error || '';
  } else {
    outputTextDisplay = String(rawOutput);
  }
  if (result.testCase.assert) {
    if (result.success) {
      resultText = `${outputTextDisplay || result.error || ''}`;
    } else {
      resultText = `${outputTextDisplay}`;
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
          blobRef: result.response.audio.blobRef,
          transcript: result.response.audio.transcript,
          format: result.response.audio.format,
          sampleRate: result.response.audio.sampleRate,
          channels: result.response.audio.channels,
          duration: result.response.audio.duration,
        }
      : undefined,
    video: result.response?.video
      ? {
          id: result.response.video.id,
          blobRef: result.response.video.blobRef,
          storageRef: result.response.video.storageRef,
          url: result.response.video.url,
          format: result.response.video.format,
          size: result.response.video.size,
          duration: result.response.video.duration,
          thumbnail: result.response.video.thumbnail,
          spritesheet: result.response.video.spritesheet,
          model: result.response.video.model,
          aspectRatio: result.response.video.aspectRatio,
          resolution: result.response.video.resolution,
        }
      : undefined,
  };
}

/**
 * Strips redundant/large fields from a table cell for the API response.
 *
 * The full `convertEvalResultToTableCell` output includes data that is either
 * duplicated elsewhere in the response (testCase is in row.test, prompt is
 * reconstructible from head.prompts + row.vars) or unnecessary for the table
 * view (raw HTTP response, internal IDs).  Stripping these fields prevents
 * RangeError crashes from JSON.stringify on large evals (e.g. base64 images
 * repeated across every cell) and dramatically reduces payload size.
 *
 * Callers that need the full cell data (export, download) should use the
 * un-trimmed output from convertEvalResultToTableCell directly.
 */
export function trimTableCellForApi(cell: EvaluateTableOutput): EvaluateTableOutput {
  // Trim response to only the fields the frontend needs for the table view.
  // response.prompt (provider-reported prompt) is stripped here because it can
  // contain base64 images for multimodal providers; it's fetched on demand.
  let trimmedResponse: Partial<ProviderResponse> | undefined;
  if (cell.response) {
    trimmedResponse = {
      ...(cell.response.cached != null && { cached: cell.response.cached }),
      ...(cell.response.tokenUsage && { tokenUsage: cell.response.tokenUsage }),
    };
  }

  // Preserve evalId from the ...result spread in convertEvalResultToTableCell.
  // The frontend needs this for the detail endpoint, especially in comparison
  // mode where cells from different evals share the same table.
  const evalId = (cell as unknown as Record<string, unknown>).evalId as string | undefined;

  const trimmed: EvaluateTableOutput = {
    id: cell.id,
    text: cell.text,
    prompt: '', // Stripped — fetch on demand via /results/:id/detail
    provider: cell.provider,
    pass: cell.pass,
    score: cell.score,
    cost: cell.cost,
    latencyMs: cell.latencyMs,
    failureReason: cell.failureReason,
    namedScores: cell.namedScores,
    gradingResult: cell.gradingResult,
    tokenUsage: cell.tokenUsage,
    metadata: cell.metadata,
    error: cell.error,
    // testCase is already in row.test — only preserve provider for override badge.
    // All AtomicTestCase fields are optional, so {} is a valid value.
    testCase: cell.testCase?.provider
      ? ({ provider: cell.testCase.provider } as AtomicTestCase)
      : ({} as AtomicTestCase),
    response: trimmedResponse as ProviderResponse | undefined,
    audio: cell.audio,
    video: cell.video,
  };

  if (evalId) {
    (trimmed as unknown as Record<string, unknown>).evalId = evalId;
  }

  return trimmed;
}

export function convertTestResultsToTableRow(
  results: EvalResult[],
  varsForHeader: string[],
): EvaluateTableRow {
  const row = {
    description: results[0].description || undefined,
    outputs: [] as EvaluateTableRow['outputs'],
    vars: Object.values(varsForHeader)
      .map((varName) => {
        // For sessionId, check metadata first if not in testCase.vars
        // Multi-turn strategies (IterativeMeta, Crescendo, etc.) store multiple sessionIds in metadata.sessionIds array
        // Single-turn strategies store a single sessionId in metadata.sessionId
        if (varName === 'sessionId') {
          const sessionIdFromVars = results[0].testCase.vars?.sessionId;
          if (sessionIdFromVars != null && sessionIdFromVars !== '') {
            return typeof sessionIdFromVars === 'string'
              ? sessionIdFromVars
              : JSON.stringify(sessionIdFromVars);
          }
          // Check metadata.sessionIds array first (multi-turn strategies)
          const metadataSessionIds = results[0].metadata?.sessionIds;
          if (Array.isArray(metadataSessionIds) && metadataSessionIds.length > 0) {
            return metadataSessionIds
              .filter((id) => id != null && id !== '')
              .map(String)
              .join('\n');
          }
          // Fall back to metadata.sessionId (single-turn strategies)
          const metadataSessionId = results[0].metadata?.sessionId;
          if (metadataSessionId != null) {
            return typeof metadataSessionId === 'string'
              ? metadataSessionId
              : JSON.stringify(metadataSessionId);
          }
          return '';
        }
        const varValue = results[0].testCase.vars?.[varName] ?? '';
        if (typeof varValue === 'string') {
          return varValue;
        }
        return JSON.stringify(varValue);
      })
      .flat(),
    test: results[0].testCase,
    testIdx: results[0].testIdx,
  };

  for (const result of results) {
    row.outputs[result.promptIdx] = convertEvalResultToTableCell(result);
  }

  return row;
}
