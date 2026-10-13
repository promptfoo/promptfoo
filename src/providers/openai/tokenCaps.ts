/** Preserve the legacy request defaults for pre-reasoning OpenAI families. */
export function isLegacyOpenAiChatModel(modelName: string): boolean {
  // Match the base model segment, not a fine-tune's organization or experiment name.
  const model = modelName
    .toLowerCase()
    .replace(/(^|\/)ft:/, '$1')
    .split(':')[0];
  return /(^|\/|-)gpt-(?:3\.5(?:-|$)|4(?:[.-]|o(?:-|$)|$)|audio(?:-|$))/.test(model);
}

/** Explicit Chat caps are resolved per config scope before environment fallbacks. */
function getObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type ChatOutputCapConfig = {
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  passthrough?: unknown;
};

function getChatOutputCap(config: ChatOutputCapConfig | undefined, isOpenRouter: boolean) {
  const passthrough = getObject(config?.passthrough) as
    | Omit<ChatOutputCapConfig, 'passthrough'>
    | undefined;
  return [
    passthrough?.max_completion_tokens,
    ...(isOpenRouter
      ? [passthrough?.max_tokens, config?.max_completion_tokens]
      : [config?.max_completion_tokens, passthrough?.max_tokens]),
    config?.max_tokens,
  ].find((value) => value !== undefined);
}

export function resolveChatOutputCap(
  providerConfig: ChatOutputCapConfig,
  promptConfig: ChatOutputCapConfig | undefined,
  isOpenRouter: boolean,
  environment: { maxCompletionTokens?: number; maxTokens?: number },
): number | undefined {
  const cap = [
    getChatOutputCap(promptConfig, isOpenRouter),
    getChatOutputCap(providerConfig, isOpenRouter),
    environment.maxCompletionTokens,
    environment.maxTokens,
  ].find((value) => value !== undefined);
  return cap ?? undefined;
}
