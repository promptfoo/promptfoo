const MAX_SSE_EVENT_BYTES = 64 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

const textDetectors = {
  'openai-chat': (event) =>
    Array.isArray(event.choices) &&
    event.choices.some(
      (choice) =>
        isRecord(choice) &&
        isRecord(choice.delta) &&
        (hasText(choice.delta.content) || hasText(choice.delta.refusal)),
    ),
  'openai-responses': (event) =>
    (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') &&
    hasText(event.delta),
  'anthropic-messages': (event) =>
    event.type === 'content_block_delta' &&
    isRecord(event.delta) &&
    event.delta.type === 'text_delta' &&
    hasText(event.delta.text),
} satisfies Record<string, (event: Record<string, unknown>) => boolean>;

type StreamFormat = keyof typeof textDetectors;

function createTextDetector(format?: StreamFormat): (chunk: string, final?: boolean) => boolean {
  if (!format) {
    return (chunk) => /\S/.test(chunk);
  }

  const detectText = Object.prototype.hasOwnProperty.call(textDetectors, format)
    ? textDetectors[format]
    : () => false;
  let lineParts: string[] = [];
  let dataLines: string[] = [];
  let eventBytes = 0;
  let previousWasCr = false;

  const append = (part: string) => {
    eventBytes += Buffer.byteLength(part);
    if (eventBytes > MAX_SSE_EVENT_BYTES) {
      throw new Error('SSE event exceeds 64 KiB before first text output');
    }
    lineParts.push(part);
  };
  const consumeLine = () => {
    const line = lineParts.join('');
    lineParts = [];
    if (line.startsWith('data:')) {
      const data = line.slice(5).replace(/^ /, '');
      dataLines.push(data);
    }
    if (line !== '') {
      eventBytes++;
      return false;
    }
    eventBytes = 0;
    if (!dataLines.length) {
      return false;
    }
    const data = dataLines.join('\n');
    dataLines = [];
    try {
      const event: unknown = JSON.parse(data);
      return isRecord(event) && detectText(event);
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
      if (consumeLine()) {
        return true;
      }
      return consumeLine();
    }
    return false;
  };
}

/** Read the body once, preserving its text for the provider's response transform. */
export async function processStreamingResponse(
  response: Response,
  requestStartTime: number,
  opts?: { streamFormat?: StreamFormat },
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return { text: '', streamingMetrics: { multiChunkDelivery: false } };
  }
  const detectToken = createTextDetector(opts?.streamFormat);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let firstTokenTime: number | undefined;
  let firstByteTime: number | undefined;
  let lastByteTime: number | undefined;
  let chunkCount = 0;
  let byteCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value.length === 0) {
        continue;
      }
      byteCount += value.byteLength;
      if (byteCount > MAX_STREAM_BYTES) {
        throw new Error('HTTP streaming response exceeds 16 MiB');
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
    // A cloned body waits for both branches to cancel; let the caller abort its transport.
    void reader.cancel().catch(() => {});
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
