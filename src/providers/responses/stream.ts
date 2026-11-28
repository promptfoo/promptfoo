import { setImmediate } from 'node:timers/promises';

import type { ResponseOutputItem } from './types';

export class IncompleteResponsesStreamError extends Error {
  constructor(
    providerName: string,
    readonly response: any,
  ) {
    super(`${providerName} streaming response ended before a terminal response event`);
    this.name = 'IncompleteResponsesStreamError';
  }
}

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

export function isRootFinalAnswer(item: ResponseOutputItem | null | undefined): boolean {
  return (
    item?.type === 'message' &&
    item.role === 'assistant' &&
    item.phase === 'final_answer' &&
    item.agent?.agent_name === '/root'
  );
}

export function getResponsesOutputText(response: any, multiAgent = false): string | undefined {
  if (!multiAgent && typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    return undefined;
  }
  const result = response.output
    .flatMap((item: any) => {
      if (
        (multiAgent && !isRootFinalAnswer(item)) ||
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
    .split('\n')
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

/** Scan only newly decoded text. Flatten an unfinished frame once, when it is complete. */
async function readFrames(
  body: ReadableStream<Uint8Array>,
  providerName: string,
  dispatch: (frame: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const scanBudget = 64 * 1024;
  let frame = '';
  let events = 0;
  let bytes = 0;
  let reads = 0;
  let scanned = 0;
  let pendingNewline = false;
  let skipLF = false;

  function append(part: string) {
    if (frame.length + part.length > MAX_EVENT_CHARS) {
      throw new Error(`${providerName} streaming response exceeds the event limit`);
    }
    frame += part;
  }

  function emit() {
    if (++events > MAX_STREAM_EVENTS) {
      throw new Error(`${providerName} streaming response exceeds the event limit`);
    }
    signal?.throwIfAborted();
    dispatch(frame);
    frame = '';
  }

  async function consume(fragment: string) {
    if (!fragment) {
      return;
    }
    // CR ends a line immediately. Suppress only the LF half of a split CRLF.
    const part = skipLF && fragment[0] === '\n' ? fragment.slice(1) : fragment;
    skipLF = part.endsWith('\r');
    const text = (pendingNewline ? '\n' : '') + part.replace(/\r\n?/g, '\n');
    let start = 0;
    let end: number;
    while ((end = text.indexOf('\n\n', start)) !== -1) {
      append(text.slice(start, end));
      emit();
      start = end + 2;
      if (events % 256 === 0) {
        await setImmediate();
      }
    }
    // A single trailing newline may be the first half of a frame separator.
    pendingNewline = start < text.length && text.endsWith('\n');
    append(text.slice(start, pendingNewline ? -1 : undefined));
  }

  // Cancellation on a tee can wait indefinitely for its other reader.
  const cancel = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_STREAM_BYTES) {
        throw new Error(`${providerName} streaming response exceeds 64 MiB`);
      }
      // Bound work per turn even for a single large chunk or many tiny reads.
      for (let i = 0; i < value.byteLength; i += scanBudget) {
        const part = value.subarray(i, i + scanBudget);
        scanned += part.byteLength;
        if (scanned >= scanBudget) {
          await setImmediate();
          scanned = 0;
        }
        signal?.throwIfAborted();
        await consume(decoder.decode(part, { stream: true }));
      }
      if (++reads % 256 === 0) {
        await setImmediate();
      }
    }
    await consume(decoder.decode());
    if (frame.trim()) {
      emit();
    }
    signal?.throwIfAborted();
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function readResponsesStream(
  response: Response,
  providerName: string,
  logger: ResponsesStreamLogger,
  onResponse?: (response: any) => void,
  options?: {
    signal?: AbortSignal;
    multiAgent?: boolean;
    preserveFailedOutput?: boolean;
    requireTerminalEvent?: boolean;
    classifyError?: (response: unknown) => StreamErrorClassification | undefined;
  },
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  let latestResponse: any;
  let hasTerminalResponse = false;
  let snapshotType: string | undefined;
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
      snapshotType = event.type;
      hasTerminalResponse =
        ['completed', 'incomplete', 'failed'].includes(latestResponse.status) &&
        event.type === `response.${latestResponse.status}`;
      onResponse?.(latestResponse);
    } else if (Array.isArray(event.output)) {
      latestResponse = event;
      snapshotType = event.type;
      hasTerminalResponse = false;
    }

    // Multi-agent deltas can mix text from the root and its children. The terminal
    // snapshot carries each item's author and phase, including partial output.
    if (!options?.multiAgent && event.type === 'response.output_text.delta') {
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

  await readFrames(response.body, providerName, processChunk, options?.signal);

  if (malformedEvent && (latestResponse || outputText)) {
    // Only a completed snapshot can confirm output across a gap. Keep terminal failures
    // and explicit policy errors, but never supplement them with unconfirmed deltas.
    outputText = '';
    const status =
      latestResponse?.status ?? (snapshotType === 'response.completed' ? 'completed' : undefined);
    const confirmed =
      (status === 'completed' || (status === 'failed' && latestResponse.error)) &&
      (!snapshotType || snapshotType === `response.${status}`);
    if (!confirmed) {
      if (!pendingError) {
        throw new Error(`${providerName} streaming response contains malformed SSE data`);
      }
      latestResponse = undefined;
    }
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

  if ((options?.requireTerminalEvent || options?.multiAgent) && !hasTerminalResponse) {
    throw new IncompleteResponsesStreamError(providerName, latestResponse);
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
