import type { EvaluateResult } from '../types/index';

export function getTableCellText(
  result: Pick<EvaluateResult, 'response' | 'error' | 'testCase' | 'success'>,
) {
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

  return resultText;
}

export function getTableCellMedia(result: Pick<EvaluateResult, 'response'>) {
  return {
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
    images: result.response?.images?.map((img) => ({
      data: img.data,
      blobRef: img.blobRef,
      mimeType: img.mimeType,
    })),
  };
}
