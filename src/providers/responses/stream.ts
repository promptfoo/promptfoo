import logger from '../../logger';

type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  output_text?: { delta?: string };
  output?: any[];
};

function parseSseEvent(chunk: string, providerName: string): ResponsesStreamEvent | undefined {
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
    logger.debug(`[${providerName} Responses] Ignoring malformed SSE payload`, { data });
    return undefined;
  }
}

export async function readResponsesStream(response: Response, providerName: string): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latestResponse: any;
  let outputText = '';

  const processChunk = (chunk: string) => {
    const event = parseSseEvent(chunk, providerName);
    if (!event) {
      return;
    }

    if (event.response && typeof event.response === 'object') {
      latestResponse = event.response;
    } else if (Array.isArray(event.output)) {
      latestResponse = event;
    }

    if (event.type === 'response.output_text.delta') {
      outputText += event.delta ?? event.output_text?.delta ?? '';
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
