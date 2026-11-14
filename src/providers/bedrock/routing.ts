import { BEDROCK_OPENAI_MANTLE_REGIONS } from './openaiModels';

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
    /(?:^|[/.])openai\.gpt-oss-(?:safeguard-)?(?:20b|120b)(?:-1:0)?$/.test(modelName)
  ) {
    return 'GPT OSS does not support Bedrock Runtime Responses. Use Runtime Chat or Mantle Responses.';
  }
  const foundationModel = modelName.replace(
    /^arn:[^:]+:bedrock:[^:]+:[^:]*:foundation-model\//,
    '',
  );
  const profileModel = foundationModel.replace(
    /^arn:[^:]+:bedrock:[^:]+:[^:]*:inference-profile\//,
    '',
  );
  const isFoundationModelArn = foundationModel !== modelName;
  if (
    /^(?:[^:/]+\.)?zai\.glm-5\.3$/.test(profileModel) &&
    (isFoundationModelArn || !/^(?:us|global)\.zai\.glm-5\.3$/.test(profileModel))
  ) {
    return 'GLM 5.3 on Bedrock Runtime requires a system inference profile, such as us.zai.glm-5.3 or global.zai.glm-5.3.';
  }
  if (
    /^(?:[^:/]+\.)?moonshotai\.kimi-k3$/.test(profileModel) &&
    (isFoundationModelArn || !/^(?:us|in|global)\.moonshotai\.kimi-k3$/.test(profileModel))
  ) {
    return 'Kimi K3 on Bedrock Runtime requires a system inference profile, such as us.moonshotai.kimi-k3, in.moonshotai.kimi-k3, or global.moonshotai.kimi-k3.';
  }
  if (
    /^(?:[^:/]+\.)?xai\.grok-4\.[67]$/.test(profileModel) &&
    (isFoundationModelArn || !NATIVE_GROK_PROFILE_MODELS.has(profileModel))
  ) {
    return 'Grok 4.6 and 4.7 on Bedrock Runtime require a system inference profile, such as us.xai.grok-4.6 or global.xai.grok-4.7.';
  }
  const mantleOnlyGpt =
    /^(?:[^:/]+\.)?(?:openai\.)?(gpt-5\.6-cyber|gpt-daybreak-blue-5\.6-sol)$/.exec(profileModel);
  if (mantleOnlyGpt) {
    return `Use the Mantle provider bedrock:responses:openai.${mantleOnlyGpt[1]} for this model.`;
  }
  // Validate published GPT profiles while allowing future profile IDs to reach Bedrock.
  const knownGpt =
    /^(?:[^:/]+\.)?(?:openai\.)?(gpt-(?:5\.[45]|5\.6-(?:luna|sol|terra)|6-(?:astra|luna|sol)|6\.1-(?:sol|terra)))$/.exec(
      profileModel,
    )?.[1];
  const supportedGptProfile =
    profileModel === `us.openai.${knownGpt}` ||
    profileModel === `global.openai.${knownGpt}` ||
    /^(?:in|us-gov)\.openai\.gpt-5\.6-(?:luna|terra)$/.test(profileModel);
  if (
    /^(?:openai\.)?gpt-\d/.test(profileModel) ||
    (knownGpt && (isFoundationModelArn || !supportedGptProfile))
  ) {
    return 'Closed OpenAI GPT models on Bedrock Runtime require a system inference profile, such as us.openai.gpt-5.6-sol or global.openai.gpt-5.6-sol.';
  }
  return undefined;
}

export function isRejectedPrefixedMythosId(modelName: string): boolean {
  return /^[^.]+\.(anthropic\.claude-mythos-(?:5|preview))$/.test(modelName);
}

// Grok Runtime profiles are served natively; inference profiles are invalid Mantle IDs.
// These are the backend's existing compatibility rules, not an exhaustive model catalog.
const NATIVE_GROK_PROFILE_MODELS = new Set([
  'us.xai.grok-4.6',
  'global.xai.grok-4.6',
  'us.xai.grok-4.7',
  'global.xai.grok-4.7',
]);

export function isRejectedPrefixedGrokId(
  modelName: string,
  explicitMantleRequest: boolean,
): boolean {
  return (
    modelName.includes('.xai.') &&
    // Native profile ARNs are not model IDs in Mantle's namespace. They may contain
    // the model ID or a user-chosen name; let the native provider handle them.
    (explicitMantleRequest ||
      (!modelName.startsWith('arn:') && !NATIVE_GROK_PROFILE_MODELS.has(modelName)))
  );
}

// Runtime Messages uses the inference profile IDs in each AWS model card. Mantle
// takes a bare model ID, which can differ from the Runtime ID (for example Haiku 4.5).
const RUNTIME_MESSAGES_PROFILES = new Map<string, readonly string[]>([
  ['anthropic.claude-fable-5', ['us', 'global']],
  ['anthropic.claude-fable-5-1', ['us', 'global']],
  ['anthropic.claude-mythos-5-1', ['us', 'global']],
  ['anthropic.claude-fable-5-2', ['us', 'global']],
  ['anthropic.claude-mythos-5-2', ['us', 'global']],
  ['anthropic.claude-haiku-4-5-20251001-v1:0', ['us', 'eu', 'au', 'jp', 'in', 'global']],
  ['anthropic.claude-haiku-5-5', ['us', 'ca', 'eu', 'au', 'jp', 'us-gov', 'global']],
  ['anthropic.claude-opus-4-7', ['us', 'eu', 'jp', 'au', 'global']],
  ['anthropic.claude-opus-4-8', ['us', 'eu', 'jp', 'au', 'us-gov', 'global']],
  ['anthropic.claude-opus-5', ['us', 'eu', 'au', 'in', 'global']],
  ['anthropic.claude-opus-5-5', ['us', 'eu', 'au', 'jp', 'us-gov', 'global']],
  ['anthropic.claude-sonnet-5', ['us', 'eu', 'au', 'in', 'global']],
  ['anthropic.claude-sonnet-5-5', ['us', 'eu', 'au', 'us-gov', 'global']],
]);

const IN_REGION_RUNTIME_MESSAGES_MODELS = new Map<string, readonly string[]>([
  ['anthropic.claude-opus-5', ['ap-northeast-2']],
  ['anthropic.claude-opus-5-5', ['eu-west-2']],
  ['anthropic.claude-sonnet-5', ['eu-west-2', 'ap-northeast-2', 'ap-southeast-1']],
]);

export function isBedrockRuntimeMessagesModel(modelName: string, region?: string): boolean {
  if (region && IN_REGION_RUNTIME_MESSAGES_MODELS.get(modelName)?.includes(region)) {
    return true;
  }
  const separator = modelName.indexOf('.');
  const profiles = RUNTIME_MESSAGES_PROFILES.get(modelName.slice(separator + 1));
  return profiles?.includes(modelName.slice(0, separator)) ?? false;
}

export function isBedrockAnthropicMessagesModel(modelName: string): boolean {
  return (
    [
      'anthropic.claude-fable-5',
      'anthropic.claude-mythos-5',
      'anthropic.claude-fable-5-1',
      'anthropic.claude-mythos-preview',
      'anthropic.claude-haiku-4-5',
      'anthropic.claude-haiku-5-5',
      'anthropic.claude-opus-5-5',
      'anthropic.claude-sonnet-5-5',
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

export function isBedrockOpenAiChatModel(modelName: string): boolean {
  return BEDROCK_OPENAI_MANTLE_REGIONS.has(modelName);
}

export function isBedrockGptOssResponsesModel(modelName: string): boolean {
  return /^openai\.gpt-oss-(?:safeguard-)?(?:20b|120b)$/.test(modelName);
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
