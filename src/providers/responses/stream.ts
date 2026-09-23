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
  error?: { code?: string; message?: string };
};

type ResponsesStreamLogger = {
  debug(message: string, context?: Record<string, unknown>): unknown;
};

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
  onResponse?: (response: any) => void,
  options?: { preserveFailedOutput?: boolean },
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latestResponse: any;
  let outputText = '';
  const textByOutputIndex = new Map<number, Map<number, string>>();

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
      onResponse?.(latestResponse);
    } else if (Array.isArray(event.output)) {
      latestResponse = event;
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
