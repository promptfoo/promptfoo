import type EvalResult from '../../models/evalResult';
import type { EvaluateTableOutput, EvaluateTableRow } from '../../types/index';

export function convertEvalResultToTableCell(result: EvalResult): EvaluateTableOutput {
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
        if (varName === 'sessionId') {
          const varValue =
            results[0].testCase.vars?.sessionId || results[0].metadata?.sessionId || '';
          if (typeof varValue === 'string') {
            return varValue;
          }
          return JSON.stringify(varValue);
        }
        const varValue = results[0].testCase.vars?.[varName] || '';
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
