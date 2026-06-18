type ReasoningModelOptions = {
  includeCodexMiniLatest?: boolean;
};

export function isOpenAiGpt5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5') || modelName.includes('/gpt-5');
}

export function isOpenAiOSeriesReasoningModel(modelName: string): boolean {
  return (
    modelName.startsWith('o1') ||
    modelName.startsWith('o3') ||
    modelName.startsWith('o4') ||
    modelName.includes('/o1') ||
    modelName.includes('/o3') ||
    modelName.includes('/o4')
  );
}

export function isOpenAiReasoningModel(
  modelName: string,
  { includeCodexMiniLatest = false }: ReasoningModelOptions = {},
): boolean {
  return (
    isOpenAiOSeriesReasoningModel(modelName) ||
    isOpenAiGpt5Model(modelName) ||
    (includeCodexMiniLatest && modelName === 'codex-mini-latest')
  );
}

export function isAzureOpenAiEndpoint(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const endpoint = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === 'openai.azure.com' || hostname.endsWith('.openai.azure.com');
  } catch {
    return false;
  }
}
