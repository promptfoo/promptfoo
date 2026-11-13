// AWS lists in-region Responses and Chat Completions on Mantle for these frontier models.
// Use these regions for defaults and diagnostics. An explicitly configured region wins.
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards-openai.html
export const BEDROCK_OPENAI_MANTLE_REGIONS = new Map<string, readonly string[]>([
  ['openai.gpt-6.1-sol', ['us-east-1']],
  ['openai.gpt-6.1-terra', ['us-east-1']],
  ['openai.gpt-6-astra', ['us-west-2', 'us-east-1']],
  ['openai.gpt-6-sol', ['us-east-1']],
  ['openai.gpt-6-luna', ['us-east-1']],
  ['openai.gpt-5.6-sol', ['us-east-1', 'us-east-2']],
  ['openai.gpt-daybreak-blue-5.6-sol', ['us-east-2']],
  ['openai.gpt-5.6-cyber', ['us-east-2', 'us-gov-east-1']],
  [
    'openai.gpt-5.6-terra',
    ['us-east-1', 'us-east-2', 'us-west-2', 'us-gov-west-1', 'us-gov-east-1'],
  ],
  [
    'openai.gpt-5.6-luna',
    ['us-east-1', 'us-east-2', 'us-west-2', 'us-gov-west-1', 'us-gov-east-1'],
  ],
  ['openai.gpt-5.5', ['us-east-1', 'us-east-2']],
  ['openai.gpt-5.4', ['us-east-1', 'us-east-2', 'us-west-2', 'us-gov-west-1']],
]);

export function getBedrockCapabilityModelName(model: string): string {
  return model === 'openai.gpt-daybreak-blue-5.6-sol'
    ? 'gpt-5.6-sol'
    : model.replace(/^(openai|xai)\./, '');
}

export function getBedrockMantleBillingModelName(model: string): string {
  const name = model.replace(/^(openai|xai)\./, '');
  return /^gpt-5\.6(?:-|$)/.test(name) ||
    name === 'gpt-daybreak-blue-5.6-sol' ||
    name === 'grok-4.3'
    ? `bedrock:${name}`
    : name;
}
