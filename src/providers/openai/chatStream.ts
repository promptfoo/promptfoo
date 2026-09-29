import type OpenAI from 'openai';

function validateTokenCounts(value: unknown, fields: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid streaming usage');
  }
  for (const field of fields) {
    const count = (value as Record<string, unknown>)[field];
    if (count != null && (typeof count !== 'number' || !Number.isFinite(count) || count < 0)) {
      throw new Error('Invalid streaming usage');
    }
  }
}

function validateUsage(usage: OpenAiStreamingUsage): void {
  validateTokenCounts(usage, [
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'audio_prompt_tokens',
    'audio_completion_tokens',
  ]);
  if (usage.prompt_tokens_details != null) {
    validateTokenCounts(usage.prompt_tokens_details, ['cached_tokens', 'audio_tokens']);
  }
  if (usage.completion_tokens_details != null) {
    validateTokenCounts(usage.completion_tokens_details, [
      'reasoning_tokens',
      'audio_tokens',
      'accepted_prediction_tokens',
      'rejected_prediction_tokens',
    ]);
  }
}

function appendText(current: string, delta: unknown): string {
  if (delta == null) {
    return current;
  }
  if (typeof delta !== 'string') {
    throw new Error('Invalid streamed text');
  }
  return current + delta;
}

type OpenAiStreamingUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  audio_prompt_tokens?: number;
  audio_completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
};

type OpenAiStreamingFunctionCall = { name: string; arguments: string };

type OpenAiStreamingToolCall = {
  id: string;
  type: string;
  function: OpenAiStreamingFunctionCall;
};

type OpenAiStreamingChoice = {
  index: number;
  content: string | null;
  refusal: string;
  reasoning: string;
  reasoningContent: string;
  logProbs: number[];
  finishReason: string | null;
  error?: unknown;
  functionCall: OpenAiStreamingFunctionCall | null;
  toolCalls: Map<number, OpenAiStreamingToolCall>;
};

type OpenAiStreamingState = {
  choices: Map<number, OpenAiStreamingChoice>;
  usage?: OpenAiStreamingUsage;
  serviceTier?: string | null;
  error?: unknown;
  completed: boolean;
  malformed: boolean;
  response: Record<string, unknown>;
  events: number;
};

function getSseData(line: string): string | undefined {
  if (!line || line.startsWith(':') || !line.startsWith('data:')) {
    return undefined;
  }
  const data = line.slice(5);
  return data.startsWith(' ') ? data.slice(1) : data;
}

function validateStreamingError(error: unknown): void {
  if (
    error != null &&
    !(typeof error === 'string' && error.trim()) &&
    !(typeof error === 'object' && !Array.isArray(error))
  ) {
    throw new Error('Invalid streaming error');
  }
}

function appendFunctionCall(
  choice: OpenAiStreamingChoice,
  functionCallDelta: { name?: string; arguments?: string },
) {
  choice.functionCall ??= { name: '', arguments: '' };
  if (functionCallDelta.name != null) {
    choice.functionCall.name = appendText('', functionCallDelta.name);
  }
  choice.functionCall.arguments = appendText(
    choice.functionCall.arguments,
    functionCallDelta.arguments,
  );
}

function appendToolCalls(
  choice: OpenAiStreamingChoice,
  toolCallDeltas: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>,
) {
  for (const toolCallDelta of toolCallDeltas) {
    if (toolCallDelta.type != null && toolCallDelta.type !== 'function') {
      throw new Error('Unsupported streaming tool call type');
    }
    const index = toolCallDelta.index;
    if (!Number.isSafeInteger(index) || index < 0 || index >= 128) {
      throw new Error('Invalid streaming tool call index');
    }
    const toolCall = choice.toolCalls.get(index) ?? {
      id: '',
      type: 'function',
      function: { name: '', arguments: '' },
    };
    if (toolCallDelta.id != null) {
      toolCall.id = appendText('', toolCallDelta.id);
    }
    if (toolCallDelta.function?.name != null) {
      toolCall.function.name = appendText('', toolCallDelta.function.name);
    }
    toolCall.function.arguments = appendText(
      toolCall.function.arguments,
      toolCallDelta.function?.arguments,
    );
    choice.toolCalls.set(index, toolCall);
  }
}

function getOpenAiStreamingChoice(
  state: OpenAiStreamingState,
  index: number,
): OpenAiStreamingChoice {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 128) {
    throw new Error('Invalid streaming choice index');
  }
  let choice = state.choices.get(index);
  if (!choice) {
    choice = {
      index,
      content: null,
      refusal: '',
      reasoning: '',
      reasoningContent: '',
      logProbs: [],
      finishReason: null,
      functionCall: null,
      toolCalls: new Map(),
    };
    state.choices.set(index, choice);
  }
  return choice;
}

function appendStreamingChoice(
  state: OpenAiStreamingState,
  choice?: {
    index?: number;
    delta?: {
      content?: string;
      refusal?: string;
      reasoning?: string;
      reasoning_content?: string;
      function_call?: { name?: string; arguments?: string };
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    logprobs?: {
      content?: Array<{ token?: string; logprob?: number }>;
    } | null;
    finish_reason?: string | null;
    error?: unknown;
  },
) {
  if (!choice || typeof choice !== 'object') {
    throw new Error('Invalid streaming choice');
  }
  const streamingChoice = getOpenAiStreamingChoice(state, choice.index ?? 0);
  if (choice.delta?.content != null) {
    streamingChoice.content = appendText(streamingChoice.content ?? '', choice.delta.content);
  }
  validateStreamingError(choice.error);
  if (choice.error != null) {
    streamingChoice.error = choice.error;
  }
  streamingChoice.refusal = appendText(streamingChoice.refusal, choice.delta?.refusal);
  streamingChoice.reasoning = appendText(streamingChoice.reasoning, choice.delta?.reasoning);
  streamingChoice.reasoningContent = appendText(
    streamingChoice.reasoningContent,
    choice.delta?.reasoning_content,
  );
  for (const logProb of choice.logprobs?.content ?? []) {
    if (typeof logProb.logprob !== 'number' || !Number.isFinite(logProb.logprob)) {
      throw new Error('Invalid streaming log probability');
    }
    streamingChoice.logProbs.push(logProb.logprob);
  }
  if (choice.delta?.function_call) {
    appendFunctionCall(streamingChoice, choice.delta.function_call);
  }
  if (choice.delta?.tool_calls) {
    appendToolCalls(streamingChoice, choice.delta.tool_calls);
  }
  if (choice.finish_reason != null) {
    streamingChoice.finishReason = appendText('', choice.finish_reason);
  }
}

function processOpenAiStreamingChunk(state: OpenAiStreamingState, data: string): boolean {
  if (data === '[DONE]') {
    state.completed = true;
    return true;
  }

  try {
    if (++state.events > 250_000) {
      throw new Error('Too many streaming events');
    }
    const chunk = JSON.parse(data) as {
      choices?: Array<Parameters<typeof appendStreamingChoice>[1]>;
      usage?: OpenAiStreamingUsage;
      service_tier?: string | null;
      error?: unknown;
    };
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) {
      throw new Error('Invalid streaming chunk');
    }
    validateStreamingError(chunk.error);
    if (chunk.error !== undefined && chunk.error !== null) {
      state.error = chunk.error;
    }
    if (chunk.choices !== undefined && !Array.isArray(chunk.choices)) {
      throw new Error('Invalid streaming choices');
    }
    for (const choice of chunk.choices ?? []) {
      appendStreamingChoice(state, choice);
    }
    if (chunk.usage != null) {
      validateUsage(chunk.usage);
      state.usage = chunk.usage;
    }
    const { choices: _choices, usage: _usage, error: _error, ...metadata } = chunk;
    Object.assign(state.response, metadata);
    if (chunk.service_tier !== undefined) {
      state.serviceTier = chunk.service_tier;
    }
    if (state.error != null || chunk.choices?.some((choice) => choice?.error != null)) {
      return true;
    }
  } catch {
    state.malformed = true;
    return true;
  }

  return false;
}

function processOpenAiSseEvent(state: OpenAiStreamingState, event: string): boolean {
  const dataLines = event
    .split(/\r\n|\r|\n/)
    .map(getSseData)
    .filter((data): data is string => data !== undefined);
  if (dataLines.length === 0) {
    return false;
  }

  const joinedData = dataLines.join('\n');
  try {
    if (joinedData !== '[DONE]') {
      JSON.parse(joinedData);
    }
    return processOpenAiStreamingChunk(state, joinedData);
  } catch {
    // Some OpenAI-compatible proxies omit blank event separators and emit each
    // data line as an independent JSON chunk. Preserve that compatibility only
    // when every line is independently valid; otherwise fail closed below.
    const independentlyValid = dataLines.every((data) => {
      if (data === '[DONE]') {
        return true;
      }
      try {
        JSON.parse(data);
        return true;
      } catch {
        return false;
      }
    });
    if (independentlyValid && dataLines.length > 1) {
      return dataLines.some((data) => processOpenAiStreamingChunk(state, data));
    }
    return processOpenAiStreamingChunk(state, joinedData);
  }
}

export async function readOpenAiChatStream(
  response: Response,
  abortRequest: () => void,
): Promise<OpenAI.ChatCompletion> {
  if (!response.body) {
    throw new Error('No response body for streaming request');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: OpenAiStreamingState = {
    choices: new Map(),
    completed: false,
    malformed: false,
    response: Object.create(null),
    events: 0,
  };
  let buffer = '';
  let bufferedBytes = 0;
  let searchFrom = 0;
  let bytes = 0;
  let streamDone = false;
  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) {
        const finalText = decoder.decode();
        buffer += finalText;
        bufferedBytes += Buffer.byteLength(finalText);
        if (bufferedBytes > 1024 * 1024) {
          throw new Error('Streaming event exceeds the 1 MiB limit');
        }
        if (buffer) {
          processOpenAiSseEvent(state, buffer);
        }
        break;
      }
      bytes += value.byteLength;
      if (bytes > 32 * 1024 * 1024) {
        throw new Error('Streaming response exceeds the 32 MiB limit');
      }
      const text = decoder.decode(value, { stream: true });
      buffer += text;
      bufferedBytes += Buffer.byteLength(text);
      const separator = /(?:\r\n|\r(?!\n)|\n){2}/g;
      separator.lastIndex = searchFrom;
      let start = 0;
      let match: RegExpExecArray | null;
      while ((match = separator.exec(buffer))) {
        const event = buffer.slice(start, match.index);
        if (Buffer.byteLength(event) > 1024 * 1024) {
          throw new Error('Streaming event exceeds the 1 MiB limit');
        }
        streamDone = processOpenAiSseEvent(state, event);
        start = separator.lastIndex;
        if (streamDone) {
          break;
        }
      }
      bufferedBytes -= Buffer.byteLength(buffer.slice(0, start));
      buffer = buffer.slice(start);
      if (bufferedBytes > 1024 * 1024 && !streamDone) {
        throw new Error('Streaming event exceeds the 1 MiB limit');
      }
      searchFrom = Math.max(0, buffer.length - 3);
    }
    const error = getOpenAiStreamingValidationError(state);
    if (error) {
      throw new Error(error);
    }
    return {
      ...state.response,
      ...(state.error != null && { error: state.error }),
      usage: state.usage,
      service_tier: state.serviceTier,
      choices: [...state.choices.values()]
        .sort((a, b) => a.index - b.index)
        .map((choice) => ({
          index: choice.index,
          finish_reason: choice.error == null ? choice.finishReason : 'error',
          ...(choice.error != null && { error: choice.error }),
          ...(choice.logProbs.length && {
            logprobs: { content: choice.logProbs.map((logprob) => ({ logprob })) },
          }),
          message: {
            role: 'assistant',
            content: choice.content,
            ...(choice.refusal && { refusal: choice.refusal }),
            ...(choice.reasoning && { reasoning: choice.reasoning }),
            ...(choice.reasoningContent && { reasoning_content: choice.reasoningContent }),
            ...(choice.functionCall && { function_call: choice.functionCall }),
            ...(choice.toolCalls.size && { tool_calls: getOpenAiStreamingToolCalls(choice) }),
          },
        })),
    } as OpenAI.ChatCompletion;
  } finally {
    abortRequest();
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function getOpenAiStreamingValidationError(state: OpenAiStreamingState): string | undefined {
  if (state.malformed) {
    return 'API returned malformed SSE data during streaming request';
  }
  if (state.error != null || state.choices.get(0)?.error != null) {
    return undefined;
  }
  if (!state.completed) {
    return 'Streaming response ended before the [DONE] completion marker was received';
  }
  if (!state.choices.has(0)) {
    return 'Streaming response did not include a primary choice';
  }
  if ([...state.choices.values()].some((choice) => choice.finishReason === 'error')) {
    return 'API returned a streaming completion error';
  }
  if ([...state.choices.values()].some((choice) => !choice.finishReason)) {
    return 'Streaming response ended before every choice finished';
  }
  for (const choice of state.choices.values()) {
    if (choice.functionCall && !choice.functionCall.name.trim()) {
      return 'Streaming response contains an incomplete function call';
    }
    for (const tool of choice.toolCalls.values()) {
      if (!tool.id.trim() || !tool.function.name.trim()) {
        return 'Streaming response contains an incomplete tool call';
      }
    }
  }
  return undefined;
}

function getOpenAiStreamingToolCalls(choice: OpenAiStreamingChoice): OpenAiStreamingToolCall[] {
  return Array.from(choice.toolCalls.entries())
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => toolCall);
}
