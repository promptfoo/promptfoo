type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  output_text?: { delta?: string };
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
      if (typeof event.delta === 'string') {
        outputText += event.delta;
      } else if (typeof event.output_text?.delta === 'string') {
        outputText += event.output_text.delta;
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

  const hasOutputText =
    Array.isArray(latestResponse?.output) &&
    latestResponse.output.some(
      (item: any) =>
        item?.type === 'message' &&
        Array.isArray(item.content) &&
        item.content.some((content: any) => content?.type === 'output_text' && content.text),
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
