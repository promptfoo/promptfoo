import type { FunctionCallOutput } from '../types';

export const getPromptDisplayString = (prompt: string): string => {
  try {
    const parsedPrompt = JSON.parse(prompt);
    if (Array.isArray(parsedPrompt)) {
      const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
      if (lastPrompt?.content) {
        return lastPrompt.content || '-';
      }
    }
  } catch {
    console.debug('Failed to parse prompt as JSON, using raw string');
  }
  return prompt;
};

export const getOutputDisplay = (output: string | FunctionCallOutput[] | object): string => {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const items = output.filter((item): item is FunctionCallOutput => item.type === 'function');
    if (items.length > 0) {
      return JSON.stringify(
        items.map((item) => ({
          tool: item.function?.name,
          args: item.function?.arguments,
        })),
        null,
        2,
      );
    }
  }
  return JSON.stringify(output, null, 2);
};
