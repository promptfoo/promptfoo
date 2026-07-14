type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
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

function recoverIncompleteOutput(
  output: any[] | undefined,
  outputText: string,
  outputTextByContent: Map<string, string>,
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
  const streamedTexts =
    outputTextByContent.size > 0
      ? Array.from(outputTextByContent, ([key, text]) => {
          const [outputIndex, contentIndex] = key.split(':').map(Number);
          return { outputIndex, contentIndex, text };
        })
      : terminalTextLocations.length === 1
        ? [{ ...terminalTextLocations[0], text: outputText }]
        : [];

  let recoveredText = false;
  for (const { outputIndex, contentIndex, text } of streamedTexts) {
    let item = recoveredOutput[outputIndex];
    if (!item) {
      item = { type: 'message', role: 'assistant', content: [] };
      recoveredOutput[outputIndex] = item;
    }
    if (item.type !== 'message') {
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
      continue;
    }
    if (typeof content.text !== 'string' || text.length > content.text.length) {
      item.content[contentIndex] = { ...content, text };
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
  let invalidlyIndexedOutputText = '';
  let currentOutputIndexIsInvalid = false;

  const processOutputTextEvent = (event: ResponsesStreamEvent) => {
    const delta = getOutputTextDelta(event);
    if (!delta) {
      return;
    }

    outputText += delta;
    const key = getOutputTextKey(event);
    if (key) {
      outputTextByContent.set(
        key,
        (outputTextByContent.get(key) ?? '') + pendingUnindexedOutputText + delta,
      );
      currentOutputTextKey = key;
      pendingUnindexedOutputText = '';
      currentOutputIndexIsInvalid = false;
      return;
    }
    if (event.output_index !== undefined || event.content_index !== undefined) {
      invalidlyIndexedOutputText += pendingUnindexedOutputText + delta;
      currentOutputTextKey = undefined;
      pendingUnindexedOutputText = '';
      currentOutputIndexIsInvalid = true;
      return;
    }
    if (currentOutputIndexIsInvalid) {
      invalidlyIndexedOutputText += delta;
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

  if (latestResponse?.status === 'incomplete' && outputText) {
    const recoveredOutput = recoverIncompleteOutput(
      latestResponse.output,
      outputText,
      outputTextByContent,
    );
    if (invalidlyIndexedOutputText) {
      return {
        ...latestResponse,
        output: [
          ...(recoveredOutput ??
            (Array.isArray(latestResponse.output) ? latestResponse.output : [])),
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: invalidlyIndexedOutputText }],
          },
        ],
      };
    }
    if (recoveredOutput) {
      return { ...latestResponse, output: recoveredOutput };
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
