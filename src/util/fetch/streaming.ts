import type { ProviderResponse } from '../../types/providers';

export type StreamingMetrics = NonNullable<ProviderResponse['streamingMetrics']>;

type StreamFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages';
const MAX_SSE_EVENT_CHARS = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function hasTextDelta(event: unknown, format: StreamFormat): boolean {
  if (!isRecord(event)) {
    return false;
  }
  switch (format) {
    case 'openai-chat':
      return (
        Array.isArray(event.choices) &&
        event.choices.some(
          (choice) =>
            isRecord(choice) &&
            isRecord(choice.delta) &&
            (hasText(choice.delta.content) || hasText(choice.delta.refusal)),
        )
      );
    case 'openai-responses':
      return (
        (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') &&
        hasText(event.delta)
      );
    case 'anthropic-messages':
      return (
        event.type === 'content_block_delta' &&
        isRecord(event.delta) &&
        event.delta.type === 'text_delta' &&
        hasText(event.delta.text)
      );
  }
}

function createTextDetector(format?: StreamFormat): (chunk: string, final?: boolean) => boolean {
  if (!format) {
    return (chunk) => /\S/.test(chunk);
  }

  let lineParts: string[] = [];
  let dataLines: string[] = [];
  let lineLength = 0;
  let eventLength = 0;
  let previousWasCr = false;

  const append = (part: string) => {
    lineLength += part.length;
    if (lineLength + eventLength > MAX_SSE_EVENT_CHARS) {
      throw new Error('SSE event exceeds 64 KiB before first text output');
    }
    lineParts.push(part);
  };
  const consumeLine = () => {
    const line = lineParts.join('');
    lineParts = [];
    lineLength = 0;
    if (line.startsWith('data:')) {
      const data = line.slice(5).replace(/^ /, '');
      dataLines.push(data);
      eventLength += data.length + 1;
    }
    if (line !== '') {
      return false;
    }
    const data = dataLines.join('\n');
    dataLines = [];
    eventLength = 0;
    try {
      return hasTextDelta(JSON.parse(data), format);
    } catch {
      return false;
    }
  };

  return (chunk, final = false) => {
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      if (previousWasCr && char === '\n') {
        previousWasCr = false;
        start = i + 1;
        continue;
      }
      previousWasCr = char === '\r';
      if (char === '\r' || char === '\n') {
        append(chunk.slice(start, i));
        if (consumeLine()) {
          return true;
        }
        start = i + 1;
      }
    }
    append(chunk.slice(start));
    if (final) {
      return consumeLine() || consumeLine();
    }
    return false;
  };
}

/** Read the body once, preserving its text for the provider's response transform. */
export async function processStreamingResponse(
  response: Response,
  requestStartTime: number,
  opts?: { streamFormat?: StreamFormat },
): Promise<{ text: string; streamingMetrics: StreamingMetrics }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response has no readable body (status ${response.status})`);
  }
  const detectToken = createTextDetector(opts?.streamFormat);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let firstTokenTime: number | undefined;
  let firstByteTime: number | undefined;
  let lastByteTime: number | undefined;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value.length === 0) {
        continue;
      }
      const now = Date.now();
      firstByteTime ??= now;
      lastByteTime = now;
      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      chunkCount++;
      if (firstTokenTime === undefined && detectToken(chunk)) {
        firstTokenTime = now - requestStartTime;
      }
    }
    const trailingText = decoder.decode();
    chunks.push(trailingText);
    if (
      firstTokenTime === undefined &&
      lastByteTime !== undefined &&
      detectToken(trailingText, true)
    ) {
      firstTokenTime = lastByteTime - requestStartTime;
    }
  } catch (error) {
    // Release the network body when parsing stops before EOF; preserve the original error.
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return {
    text: chunks.join(''),
    streamingMetrics: {
      timeToFirstToken: firstTokenTime,
      totalStreamTime:
        firstByteTime !== undefined && lastByteTime !== undefined
          ? lastByteTime - firstByteTime
          : undefined,
      multiChunkDelivery: chunkCount > 1,
    },
  };
}

/** Suppress throughput estimates for short windows dominated by transport buffering. */
const MIN_MEANINGFUL_STREAM_WINDOW_MS = 50;

export function estimateStreamingTokensPerSecond(
  completionChars: number,
  streamWindowMs: number | undefined,
): number | undefined {
  if (
    completionChars <= 0 ||
    streamWindowMs === undefined ||
    streamWindowMs < MIN_MEANINGFUL_STREAM_WINDOW_MS
  ) {
    return undefined;
  }
  return (Math.ceil(completionChars / 4) / streamWindowMs) * 1000;
}
