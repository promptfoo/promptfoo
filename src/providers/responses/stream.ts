import { setImmediate } from 'node:timers/promises';

type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  output_index?: number;
  content_index?: number;
  output_text?: { delta?: string };
  output?: any[];
  code?: string;
  message?: string;
  error_type?: string;
  error?: {
    code?: string;
    message?: string;
    error_type?: string;
    metadata?: Record<string, unknown>;
  };
};

type ResponsesStreamLogger = {
  debug(message: string, context?: Record<string, unknown>): unknown;
};

const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_EVENT_CHARS = 16 * 1024 * 1024;
const MAX_STREAM_EVENTS = 100_000;

type StreamErrorClassification = 'refusal' | 'content_policy_violation' | 'potential' | 'technical';

export function getResponsesOutputText(response: any): string | undefined {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    return undefined;
  }
  const result = response.output
    .flatMap((item: any) => {
      if (
        !['message', 'output_message'].includes(item?.type) ||
        (item.role && item.role !== 'assistant')
      ) {
        return [];
      }
      const text = Array.isArray(item.content)
        ? item.content
            .filter(
              (part: any) =>
                ['output_text', 'text'].includes(part?.type) && typeof part.text === 'string',
            )
            .map((part: any) => part.text)
            .join('')
        : '';
      return text.trim() ? [text] : [];
    })
    .join('\n');
  return result || undefined;
}

function parseSseEvent(
  chunk: string,
  providerName: string,
  logger: ResponsesStreamLogger,
): ResponsesStreamEvent | null | undefined {
  const data = chunk
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') {
    return undefined;
  }

  try {
    const event = JSON.parse(data);
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('Expected a Responses event object');
    }
    return event as ResponsesStreamEvent;
  } catch {
    logger.debug(`[${providerName} Responses] Ignoring malformed SSE payload`, {
      dataLength: data.length,
    });
    return null;
  }
}

export async function readResponsesStream(
  response: Response,
  providerName: string,
  logger: ResponsesStreamLogger,
  onResponse?: (response: any) => void,
  options?: {
    signal?: AbortSignal;
    preserveFailedOutput?: boolean;
    classifyError?: (response: unknown) => StreamErrorClassification | undefined;
  },
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latestResponse: any;
  let latestResponseIsCompleted = false;
  let outputText = '';
  let malformedEvent = false;
  const textByOutputIndex = new Map<number, Map<number, string>>();
  let pendingError:
    | { error: Error; response: Record<string, unknown>; classification: StreamErrorClassification }
    | undefined;

  const processChunk = (chunk: string) => {
    const event = parseSseEvent(chunk, providerName, logger);
    if (!event) {
      malformedEvent ||= event === null;
      return;
    }

    if (event.type === 'error') {
      const code = event.error?.code ?? event.code;
      const message = event.error?.message ?? event.message ?? 'unknown stream error';
      const error = new Error(
        `${providerName} streaming response error${code ? ` (${code})` : ''}: ${message}`,
      );
      const errorResponse = {
        status: 'failed',
        error: event.error ?? { code, message },
        ...(event.error_type ? { error_type: event.error_type } : {}),
      };
      const classification = options?.preserveFailedOutput
        ? options.classifyError?.(errorResponse)
        : undefined;
      if (!classification || classification === 'technical') {
        throw error;
      }
      pendingError = { error, response: errorResponse, classification };
      return;
    }

    if (event.response && typeof event.response === 'object') {
      latestResponse = event.response;
      latestResponseIsCompleted =
        event.type === 'response.completed' || latestResponse.status === 'completed';
      onResponse?.(latestResponse);
    } else if (Array.isArray(event.output)) {
      latestResponse = event;
      latestResponseIsCompleted = event.type === 'response.completed';
    }

    if (event.type === 'response.output_text.delta') {
      const delta = typeof event.delta === 'string' ? event.delta : event.output_text?.delta;
      if (typeof delta === 'string') {
        outputText += delta;
        if (options?.preserveFailedOutput) {
          const index = typeof event.output_index === 'number' ? event.output_index : 0;
          const partIndex = typeof event.content_index === 'number' ? event.content_index : 0;
          const content = textByOutputIndex.get(index) ?? new Map<number, string>();
          content.set(partIndex, (content.get(partIndex) ?? '') + delta);
          textByOutputIndex.set(index, content);
        }
      }
    }
  };

  const signal = options?.signal;
  let bytesRead = 0;
  let eventCount = 0;
  let readCount = 0;
  let searchFrom = 0;
  let pendingCarriageReturn = false;
  let ended = false;
  const cancelReader = () => {
    void reader.cancel().catch(() => {});
  };
  const consumeBuffer = async () => {
    let start = 0;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n', searchFrom)) !== -1) {
      if (boundary - start > MAX_EVENT_CHARS || ++eventCount > MAX_STREAM_EVENTS) {
        throw new Error(`${providerName} streaming response exceeds the event limit`);
      }
      signal?.throwIfAborted();
      processChunk(buffer.slice(start, boundary));
      start = boundary + 2;
      searchFrom = start;
      // Let cancellation timers run even when the body is already buffered.
      if (eventCount % 256 === 0) {
        await setImmediate();
      }
    }
    buffer = buffer.slice(start);
    searchFrom = Math.max(0, buffer.length - 1);
    // The first delimiter newline may arrive in a separate chunk.
    if (buffer.length > MAX_EVENT_CHARS + (buffer.endsWith('\n') ? 1 : 0)) {
      throw new Error(`${providerName} streaming response exceeds the event limit`);
    }
  };

  signal?.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        ended = true;
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > MAX_STREAM_BYTES) {
        throw new Error(`${providerName} streaming response exceeds 64 MiB`);
      }
      let text: string =
        (pendingCarriageReturn ? '\r' : '') + decoder.decode(value, { stream: true });
      pendingCarriageReturn = text.endsWith('\r');
      if (pendingCarriageReturn) {
        text = text.slice(0, -1);
      }
      buffer += text.replace(/\r\n?/g, '\n');
      await consumeBuffer();
      if (++readCount % 256 === 0) {
        await setImmediate();
      }
    }
    buffer += (pendingCarriageReturn ? '\n' : '') + decoder.decode();
    await consumeBuffer();
    signal?.throwIfAborted();
    if (buffer.trim()) {
      if (++eventCount > MAX_STREAM_EVENTS) {
        throw new Error(`${providerName} streaming response exceeds the event limit`);
      }
      processChunk(buffer);
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    if (!ended) {
      cancelReader();
    }
    reader.releaseLock();
  }

  if (malformedEvent && outputText && !latestResponseIsCompleted) {
    if (latestResponse?.status === 'failed' && latestResponse.error) {
      return latestResponse;
    }
    throw new Error(`${providerName} streaming response contains malformed SSE data`);
  }

  if (pendingError) {
    const terminal =
      latestResponse?.status === 'failed' ? options?.classifyError?.(latestResponse) : undefined;
    if (
      terminal === 'technical' ||
      (terminal !== 'refusal' &&
        terminal !== 'content_policy_violation' &&
        pendingError.classification === 'potential')
    ) {
      throw pendingError.error;
    }
    if (terminal !== 'refusal' && terminal !== 'content_policy_violation') {
      latestResponse = {
        ...latestResponse,
        ...pendingError.response,
        error_type: pendingError.classification,
      };
    }
  }

  if (latestResponse) {
    if (options?.preserveFailedOutput && latestResponse.status === 'failed' && outputText) {
      const streamedText = Array.from(textByOutputIndex)
        .sort(([left], [right]) => left - right)
        .map(([, content]) =>
          Array.from(content)
            .sort(([left], [right]) => left - right)
            .map(([, text]) => text)
            .join(''),
        )
        .filter((text) => text.trim())
        .join('\n');
      const reportedText = getResponsesOutputText(latestResponse);
      if (
        streamedText &&
        (!reportedText ||
          (streamedText.length > reportedText.length && streamedText.startsWith(reportedText)))
      ) {
        return { ...latestResponse, output_text: streamedText };
      }
    }
    return latestResponse;
  }

  if (outputText) {
    return {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    };
  }

  throw new Error(`${providerName} streaming response did not include output content`);
}
