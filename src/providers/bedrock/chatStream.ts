/** Collect SSE before dispatching any client tools. A failed/truncated stream is never a completion. */
export function collectBedrockChatStream(body: string): Record<string, any> {
  // HTTP errors on the streaming route still use the ordinary JSON error envelope.
  if (body.trimStart().startsWith('{')) {
    return JSON.parse(body);
  }
  const result: Record<string, any> = { choices: [] };
  const choices = new Map<number, Record<string, any>>();
  let done = false;
  for (const event of body.replace(/\r\n/g, '\n').split('\n\n')) {
    const payload = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!payload) {
      continue;
    }
    if (payload === '[DONE]') {
      done = true;
      break;
    }
    const chunk = JSON.parse(payload);
    if (chunk.error) {
      throw new Error(
        `Bedrock chat stream error: ${chunk.error.message ?? JSON.stringify(chunk.error)}`,
      );
    }
    for (const key of ['id', 'model', 'created', 'system_fingerprint', 'service_tier', 'usage']) {
      if (chunk[key] != null) {
        result[key] = chunk[key];
      }
    }
    for (const part of chunk.choices ?? []) {
      if (!Number.isInteger(part.index) || part.index < 0) {
        throw new Error('Bedrock chat stream contains an invalid choice index');
      }
      const choice = choices.get(part.index) ?? {
        index: part.index,
        message: { role: 'assistant', content: '' },
        finish_reason: null,
      };
      const delta = part.delta ?? {};
      for (const key of ['content', 'refusal', 'reasoning', 'reasoning_content']) {
        if (typeof delta[key] === 'string') {
          choice.message[key] = (choice.message[key] ?? '') + delta[key];
        }
      }
      if (delta.annotations) {
        choice.message.annotations = [...(choice.message.annotations ?? []), ...delta.annotations];
      }
      if (delta.audio) {
        const audio = choice.message.audio ?? {};
        choice.message.audio = { ...audio, ...delta.audio };
        for (const key of ['data', 'transcript']) {
          if (typeof delta.audio[key] === 'string') {
            choice.message.audio[key] = (audio[key] ?? '') + delta.audio[key];
          }
        }
      }
      for (const tool of delta.tool_calls ?? []) {
        if (!Number.isInteger(tool.index) || tool.index < 0) {
          throw new Error('Bedrock chat stream contains an invalid tool index');
        }
        choice.message.tool_calls ??= [];
        const current = choice.message.tool_calls[tool.index] ?? {
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (tool.id) {
          current.id = tool.id;
        }
        if (tool.type) {
          current.type = tool.type;
        }
        for (const key of ['name', 'arguments']) {
          if (typeof tool.function?.[key] === 'string') {
            current.function[key] += tool.function[key];
          }
        }
        choice.message.tool_calls[tool.index] = current;
      }
      if (part.finish_reason != null) {
        choice.finish_reason = part.finish_reason;
      }
      choices.set(part.index, choice);
    }
  }
  if (!done || !choices.size || [...choices.values()].some((choice) => !choice.finish_reason)) {
    throw new Error('Bedrock chat stream ended before a complete response');
  }
  result.choices = [...choices.values()].sort((a, b) => a.index - b.index);
  return result;
}
