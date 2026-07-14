type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  text?: string;
  output_text?: { delta?: string };
  output_index?: number;
  content_index?: number;
  output?: any[];
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
};

type ResponsesStreamLogger = {
  debug(message: string, context?: Record<string, unknown>): unknown;
};

const MAX_STREAM_OUTPUT_INDEX = 1024;
const MAX_STREAM_CONTENT_INDEX = 1024;

function getOutputTextDelta(event: ResponsesStreamEvent): string | undefined {
  if (typeof event.delta === 'string') {
    return event.delta;
  }
  return typeof event.output_text?.delta === 'string' ? event.output_text.delta : undefined;
}

function getOutputTextKey(event: ResponsesStreamEvent): string | undefined {
  if (
    typeof event.output_index !== 'number' ||
    !Number.isInteger(event.output_index) ||
    event.output_index < 0 ||
    event.output_index > MAX_STREAM_OUTPUT_INDEX
  ) {
    return undefined;
  }
  if (
    event.content_index !== undefined &&
    (typeof event.content_index !== 'number' ||
      !Number.isInteger(event.content_index) ||
      event.content_index < 0 ||
      event.content_index > MAX_STREAM_CONTENT_INDEX)
  ) {
    return undefined;
  }
  const contentIndex = event.content_index ?? 0;
  return `${event.output_index}:${contentIndex}`;
}

function getInvalidOutputTextKey(event: ResponsesStreamEvent): string {
  return `${String(event.output_index ?? 'missing')}:${String(event.content_index ?? 0)}`;
}

function getTerminalOutputTexts(output: any[] | undefined): string[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .flatMap((item: any) =>
      item?.type === 'message' && Array.isArray(item.content)
        ? item.content
            .filter((content: any) => content?.type === 'output_text')
            .map((content: any) => (typeof content.text === 'string' ? content.text : ''))
        : [],
    )
    .filter(Boolean);
}

function recoverIncompleteOutput(
  output: any[] | undefined,
  outputTextByContent: Map<string, string>,
  unindexedOutputTexts: string[],
  allowTerminalTextReplacement: boolean,
): any[] | undefined {
  const recoveredOutput = Array.isArray(output)
    ? output.map((item: any) =>
        item?.type === 'message' && Array.isArray(item.content)
          ? { ...item, content: [...item.content] }
          : item,
      )
    : [];
  const terminalTextLocations = recoveredOutput.flatMap((item: any, outputIndex: number) =>
    item?.type === 'message' && Array.isArray(item.content)
      ? item.content.flatMap((content: any, contentIndex: number) =>
          content?.type === 'output_text' ? [{ outputIndex, contentIndex }] : [],
        )
      : [],
  );
  const unindexedTextLocations = terminalTextLocations.filter(
    ({ outputIndex, contentIndex }) => !outputTextByContent.has(`${outputIndex}:${contentIndex}`),
  );
  const streamedTexts = Array.from(outputTextByContent, ([key, text]) => {
    const [outputIndex, contentIndex] = key.split(':').map(Number);
    return { outputIndex, contentIndex, text };
  });
  if (unindexedOutputTexts.length === unindexedTextLocations.length) {
    unindexedOutputTexts.forEach((text, index) => {
      streamedTexts.push({ ...unindexedTextLocations[index], text });
    });
  }

  let recoveredText = false;
  const unmatchedStreamedTexts: string[] = [];
  for (const { outputIndex, contentIndex, text } of streamedTexts) {
    let item = recoveredOutput[outputIndex];
    if (!item) {
      item = { type: 'message', role: 'assistant', content: [] };
      recoveredOutput[outputIndex] = item;
    }
    if (item.type !== 'message') {
      unmatchedStreamedTexts.push(text);
      continue;
    }
    if (!Array.isArray(item.content)) {
      item.content = [];
    }
    while (item.content.length <= contentIndex) {
      item.content.push({ type: 'output_text', text: '' });
    }
    const content = item.content[contentIndex];
    if (content?.type !== 'output_text') {
      unmatchedStreamedTexts.push(text);
      continue;
    }
    if (
      typeof content.text !== 'string' ||
      content.text.length === 0 ||
      (allowTerminalTextReplacement && text.length > content.text.length)
    ) {
      item.content[contentIndex] = { ...content, text };
      recoveredText = true;
    }
  }

  for (const text of unmatchedStreamedTexts) {
    if (getTerminalOutputTexts(recoveredOutput).includes(text)) {
      continue;
    }
    recoveredOutput.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    });
    recoveredText = true;
  }

  if (unindexedOutputTexts.length !== unindexedTextLocations.length) {
    for (const text of unindexedOutputTexts) {
      const terminalTexts = getTerminalOutputTexts(recoveredOutput);
      if (terminalTexts.includes(text) || terminalTexts.join('') === text) {
        continue;
      }
      recoveredOutput.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      });
      recoveredText = true;
    }
  }

  return recoveredText ? recoveredOutput : undefined;
}

function parseSseEvent(
  chunk: string,
  providerName: string,
  logger: ResponsesStreamLogger,
): ResponsesStreamEvent | undefined {
  const data = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') {
    return undefined;
  }

  try {
    return JSON.parse(data) as ResponsesStreamEvent;
  } catch {
    logger.debug(`[${providerName} Responses] Ignoring malformed SSE payload`, {
      dataLength: data.length,
    });
    return undefined;
  }
}

export async function readResponsesStream(
  response: Response,
  providerName: string,
  logger: ResponsesStreamLogger,
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latestResponse: any;
  let outputText = '';
  const outputTextByContent = new Map<string, string>();
  let currentOutputTextKey: string | undefined;
  let pendingUnindexedOutputText = '';
  let unassignedUnindexedOutputText = '';
  const completedUnindexedOutputTexts: string[] = [];
  const invalidlyIndexedOutputTextByContent = new Map<string, string>();
  let currentInvalidOutputTextKey: string | undefined;

  const processOutputTextEvent = (event: ResponsesStreamEvent) => {
    const delta = getOutputTextDelta(event);
    if (!delta) {
      return;
    }

    outputText += delta;
    const key = getOutputTextKey(event);
    if (key) {
      const prependPending =
        event.output_index === 0 &&
        (event.content_index ?? 0) === 0 &&
        !outputTextByContent.has(key);
      if (!prependPending) {
        unassignedUnindexedOutputText += pendingUnindexedOutputText;
      }
      outputTextByContent.set(
        key,
        (outputTextByContent.get(key) ?? '') +
          (prependPending ? pendingUnindexedOutputText : '') +
          delta,
      );
      currentOutputTextKey = key;
      pendingUnindexedOutputText = '';
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (event.output_index !== undefined || event.content_index !== undefined) {
      const invalidKey = getInvalidOutputTextKey(event);
      invalidlyIndexedOutputTextByContent.set(
        invalidKey,
        (invalidlyIndexedOutputTextByContent.get(invalidKey) ?? '') +
          pendingUnindexedOutputText +
          delta,
      );
      currentOutputTextKey = undefined;
      pendingUnindexedOutputText = '';
      currentInvalidOutputTextKey = invalidKey;
      return;
    }
    if (currentInvalidOutputTextKey) {
      invalidlyIndexedOutputTextByContent.set(
        currentInvalidOutputTextKey,
        (invalidlyIndexedOutputTextByContent.get(currentInvalidOutputTextKey) ?? '') + delta,
      );
      return;
    }
    if (currentOutputTextKey) {
      outputTextByContent.set(
        currentOutputTextKey,
        (outputTextByContent.get(currentOutputTextKey) ?? '') + delta,
      );
      return;
    }

    pendingUnindexedOutputText += delta;
  };

  const processOutputTextDoneEvent = (event: ResponsesStreamEvent) => {
    if (typeof event.text !== 'string' || !event.text) {
      return;
    }

    const key = getOutputTextKey(event);
    if (key) {
      const previous = outputTextByContent.get(key) ?? '';
      outputText += event.text.startsWith(previous)
        ? event.text.slice(previous.length)
        : event.text;
      outputTextByContent.set(key, event.text);
      currentOutputTextKey = undefined;
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (event.output_index !== undefined || event.content_index !== undefined) {
      const invalidKey = getInvalidOutputTextKey(event);
      const previous = invalidlyIndexedOutputTextByContent.get(invalidKey) ?? '';
      outputText += event.text.startsWith(previous)
        ? event.text.slice(previous.length)
        : event.text;
      invalidlyIndexedOutputTextByContent.set(invalidKey, event.text);
      currentOutputTextKey = undefined;
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (currentInvalidOutputTextKey) {
      const previous = invalidlyIndexedOutputTextByContent.get(currentInvalidOutputTextKey) ?? '';
      outputText += event.text.startsWith(previous)
        ? event.text.slice(previous.length)
        : event.text;
      invalidlyIndexedOutputTextByContent.set(currentInvalidOutputTextKey, event.text);
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (currentOutputTextKey) {
      const previous = outputTextByContent.get(currentOutputTextKey) ?? '';
      outputText += event.text.startsWith(previous)
        ? event.text.slice(previous.length)
        : event.text;
      outputTextByContent.set(currentOutputTextKey, event.text);
      currentOutputTextKey = undefined;
      return;
    }

    outputText += event.text.startsWith(pendingUnindexedOutputText)
      ? event.text.slice(pendingUnindexedOutputText.length)
      : event.text;
    completedUnindexedOutputTexts.push(event.text);
    pendingUnindexedOutputText = '';
  };

  const processChunk = (chunk: string) => {
    const event = parseSseEvent(chunk, providerName, logger);
    if (!event) {
      return;
    }

    if (event.type === 'error') {
      const code = event.error?.code ?? event.code;
      const message = event.error?.message ?? event.message ?? 'unknown stream error';
      throw new Error(
        `${providerName} streaming response error${code ? ` (${code})` : ''}: ${message}`,
      );
    }

    if (event.response && typeof event.response === 'object') {
      latestResponse = event.response;
    } else if (Array.isArray(event.output)) {
      latestResponse = event;
    }

    if (event.type === 'response.output_text.delta') {
      processOutputTextEvent(event);
    } else if (event.type === 'response.output_text.done') {
      processOutputTextDoneEvent(event);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      processChunk(chunk);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    processChunk(buffer);
  }

  if (latestResponse && outputText) {
    if (
      unassignedUnindexedOutputText &&
      (!Array.isArray(latestResponse.output) || latestResponse.output.length === 0) &&
      invalidlyIndexedOutputTextByContent.size === 0
    ) {
      return {
        ...latestResponse,
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: outputText }],
          },
        ],
      };
    }

    const remainingUnindexedOutputText = unassignedUnindexedOutputText + pendingUnindexedOutputText;
    const recoveredOutput = recoverIncompleteOutput(
      latestResponse.output,
      outputTextByContent,
      [
        ...completedUnindexedOutputTexts,
        ...(remainingUnindexedOutputText ? [remainingUnindexedOutputText] : []),
      ],
      latestResponse.status === 'incomplete',
    );
    const output =
      recoveredOutput ?? (Array.isArray(latestResponse.output) ? latestResponse.output : []);
    let appendedInvalidOutput = false;
    for (const text of invalidlyIndexedOutputTextByContent.values()) {
      if (getTerminalOutputTexts(output).includes(text)) {
        continue;
      }
      output.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      });
      appendedInvalidOutput = true;
    }
    if (recoveredOutput || appendedInvalidOutput) {
      return { ...latestResponse, output };
    }
  }

  const hasOutputText =
    Array.isArray(latestResponse?.output) &&
    latestResponse.output.some(
      (item: any) =>
        item?.type === 'message' &&
        Array.isArray(item.content) &&
        item.content.some(
          (content: any) =>
            content?.type === 'output_text' &&
            typeof content.text === 'string' &&
            content.text.length > 0,
        ),
    );

  if (latestResponse && outputText && !hasOutputText) {
    return {
      ...latestResponse,
      output: [
        ...(Array.isArray(latestResponse.output) ? latestResponse.output : []),
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    };
  }

  if (latestResponse) {
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
