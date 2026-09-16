import { createHash } from 'crypto';

/** Bind a verdict to its target turn without persisting another copy of the conversation. */
export function getGradingInputHash(
  prompt: string,
  output: string,
  messages?: unknown,
  pluginId?: string,
): string {
  const conversation = Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            (message?.role === 'user' || message?.role === 'assistant') &&
            typeof message.content === 'string',
        )
        .map(({ role, content }) => ({ role, content }))
    : [];
  return createHash('sha256')
    .update(JSON.stringify([pluginId, prompt, output, conversation]))
    .digest('hex');
}
