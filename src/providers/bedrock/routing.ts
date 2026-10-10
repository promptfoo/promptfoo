// Pure routing helpers shared by the provider factory and browser configuration UI.
// Keep this module free of SDK, environment, and other server-only imports.
export type BedrockApiMode =
  | 'invoke'
  | 'converse'
  | 'responses'
  | 'chat'
  | 'messages'
  | 'runtime-chat'
  | 'runtime-responses';

export function getBedrockRuntimeModelError(
  mode: 'runtime-chat' | 'runtime-responses',
  modelName: string,
): string | undefined {
  if (modelName.includes(':application-inference-profile/')) {
    return 'Bedrock Runtime Chat and Responses do not support application inference profiles. Use a foundation model or system inference profile.';
  }
  if (
    mode === 'runtime-responses' &&
    /(?:^|[/.])openai\.gpt-oss-(?:20b|120b)(?:-1:0)?$/.test(modelName)
  ) {
    return 'GPT OSS does not support Bedrock Runtime Responses. Use Runtime Chat or Mantle Responses.';
  }
  const foundationModel = modelName.replace(
    /^arn:[^:]+:bedrock:[^:]+:[^:]*:foundation-model\//,
    '',
  );
  if (mode === 'runtime-responses' && /^(?:openai\.)?gpt-\d/.test(foundationModel)) {
    return 'Closed OpenAI GPT models on Bedrock Runtime Responses require a system inference profile, such as us.openai.gpt-5.6-sol or global.openai.gpt-5.6-sol.';
  }
  return undefined;
}

export function isRejectedPrefixedMythosId(modelName: string): boolean {
  return /^[^.]+\.(anthropic\.claude-mythos-(?:5|preview))$/.test(modelName);
}

// Grok 4.6 profiles are served natively; all inference profiles are invalid Mantle IDs.
// These are the backend's existing compatibility rules, not an exhaustive model catalog.
const NATIVE_GROK_PROFILE_MODELS = new Set(['us.xai.grok-4.6', 'global.xai.grok-4.6']);

export function isRejectedPrefixedGrokId(
  modelName: string,
  explicitMantleRequest: boolean,
): boolean {
  return (
    modelName.includes('.xai.') &&
    (explicitMantleRequest || !NATIVE_GROK_PROFILE_MODELS.has(modelName))
  );
}

const RUNTIME_MESSAGES_MODELS = new Set([
  'us.anthropic.claude-fable-5-1',
  'global.anthropic.claude-fable-5-1',
  'us.anthropic.claude-mythos-5-1',
  'global.anthropic.claude-mythos-5-1',
]);

export function isBedrockRuntimeMessagesModel(modelName: string): boolean {
  return RUNTIME_MESSAGES_MODELS.has(modelName);
}

export function isBedrockAnthropicMessagesModel(modelName: string): boolean {
  return (
    [
      'anthropic.claude-fable-5',
      'anthropic.claude-mythos-5',
      'anthropic.claude-fable-5-1',
      'anthropic.claude-mythos-preview',
      'anthropic.claude-opus-4-7',
      'anthropic.claude-opus-4-8',
      'anthropic.claude-opus-5',
      'anthropic.claude-sonnet-5',
    ].includes(modelName) || isBedrockRuntimeMessagesModel(modelName)
  );
}

export function isBedrockOpenAiResponsesModel(modelName: string): boolean {
  return modelName.startsWith('openai.') && !modelName.includes('gpt-oss');
}

export function isBedrockGptOssResponsesModel(modelName: string): boolean {
  return /^openai\.gpt-oss-(?:20b|120b)$/.test(modelName);
}

export function isBedrockGrokModel(modelName: string): boolean {
  return modelName.startsWith('xai.grok-');
}

export function isBedrockMantleResponsesModel(modelName: string): boolean {
  return isBedrockOpenAiResponsesModel(modelName) || isBedrockGrokModel(modelName);
}

export function requiresBedrockAnthropicMessagesModel(modelName: string): boolean {
  return (
    modelName === 'anthropic.claude-mythos-5' || modelName === 'anthropic.claude-mythos-preview'
  );
}

/** Resolve text API aliases, not model availability or regional access. */
export function getBedrockTextRoute(id: string):
  | {
      apiMode: BedrockApiMode;
      modelId: string;
    }
  | undefined {
  if (!id.startsWith('bedrock:')) {
    return undefined;
  }
  const [subtype, ...parts] = id.slice('bedrock:'.length).split(':');
  if (subtype === 'runtime') {
    const [api, ...model] = parts;
    return api === 'chat' || api === 'responses'
      ? { apiMode: api === 'chat' ? 'runtime-chat' : 'runtime-responses', modelId: model.join(':') }
      : undefined;
  }
  const explicitModes: Record<string, BedrockApiMode> = {
    completion: 'invoke',
    converse: 'converse',
    responses: 'responses',
    mantle: 'chat',
    messages: 'messages',
  };
  const explicitMode = Object.prototype.hasOwnProperty.call(explicitModes, subtype)
    ? explicitModes[subtype]
    : undefined;
  const modelId = explicitMode ? parts.join(':') : id.slice('bedrock:'.length);
  if (explicitMode === 'responses' || explicitMode === 'chat' || explicitMode === 'messages') {
    return { apiMode: explicitMode, modelId };
  }
  // Only bare IDs and legacy completion/converse aliases get automatic Responses routing.
  if ((explicitMode || parts.length === 0) && isBedrockMantleResponsesModel(modelId)) {
    return { apiMode: 'responses', modelId };
  }
  if (!explicitMode && requiresBedrockAnthropicMessagesModel(modelId)) {
    return { apiMode: 'messages', modelId };
  }
  if (explicitMode) {
    return { apiMode: explicitMode, modelId };
  }
  // Do not interpret specialized providers (kb, agents, embeddings, etc.) as text models.
  // Native model IDs may contain version colons; application profile ARNs contain several.
  if (parts.length > 0 && !subtype.includes('.') && subtype !== 'arn') {
    return undefined;
  }
  return { apiMode: 'invoke', modelId };
}
