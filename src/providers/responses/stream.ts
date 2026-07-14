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
      const delta =
        typeof event.delta === 'string'
          ? event.delta
          : typeof event.output_text?.delta === 'string'
            ? event.output_text.delta
            : undefined;
      if (delta) {
        outputText += delta;
        if (typeof event.output_index === 'number' && Number.isInteger(event.output_index)) {
          const contentIndex =
            typeof event.content_index === 'number' && Number.isInteger(event.content_index)
              ? event.content_index
              : 0;
          const key = `${event.output_index}:${contentIndex}`;
          outputTextByContent.set(key, (outputTextByContent.get(key) ?? '') + delta);
        }
      }
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

  const terminalOutputTexts = Array.isArray(latestResponse?.output)
    ? latestResponse.output
        .filter((item: any) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item: any) => item.content)
        .filter(
          (content: any) => content?.type === 'output_text' && typeof content.text === 'string',
        )
    : [];
  const hasOutputText = terminalOutputTexts.some((content: any) => content.text.length > 0);

  if (latestResponse?.status === 'incomplete' && outputText && terminalOutputTexts.length > 0) {
    let recoveredText = false;
    const recoveredResponse = {
      ...latestResponse,
      output: latestResponse.output.map((item: any, outputIndex: number) =>
        item?.type === 'message' && Array.isArray(item.content)
          ? {
              ...item,
              content: item.content.map((content: any, contentIndex: number) => {
                if (content?.type !== 'output_text') {
                  return content;
                }
                const streamedText =
                  outputTextByContent.get(`${outputIndex}:${contentIndex}`) ??
                  (terminalOutputTexts.length === 1 ? outputText : undefined);
                if (
                  streamedText &&
                  (typeof content.text !== 'string' || streamedText.length > content.text.length)
                ) {
                  recoveredText = true;
                  return { ...content, text: streamedText };
                }
                return content;
              }),
            }
          : item,
      ),
    };
    if (recoveredText) {
      return recoveredResponse;
    }
  }

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
