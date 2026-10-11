import { describe, expect, it } from 'vitest';
import {
  getBedrockTextRoute,
  isRejectedPrefixedGrokId,
  isRejectedPrefixedMythosId,
} from '../../../src/providers/bedrock/routing';

describe('Bedrock inference-profile compatibility', () => {
  it.each([
    ['xai.grok-4.3', false, false],
    ['xai.grok-4.3', true, false],
    ['us.xai.grok-4.6', false, false],
    ['global.xai.grok-4.6', false, false],
    ['us.xai.grok-4.6', true, true],
    ['global.xai.grok-4.6', true, true],
    ['us.xai.grok-4.3', false, true],
    ['eu.xai.grok-4.6', false, true],
    ['custom.future-model', false, false],
  ])('checks Grok ID %s with explicit Mantle=%s', (id, explicitMantle, rejected) => {
    expect(isRejectedPrefixedGrokId(id, explicitMantle)).toBe(rejected);
  });

  it.each([
    ['anthropic.claude-mythos-5', false],
    ['us.anthropic.claude-mythos-5', true],
    ['global.anthropic.claude-mythos-5', true],
    ['us.anthropic.claude-mythos-5-1', false],
  ])('checks Mythos ID %s', (id, rejected) => {
    expect(isRejectedPrefixedMythosId(id)).toBe(rejected);
  });
});

describe('getBedrockTextRoute', () => {
  it.each([
    ['bedrock:openai.gpt-5.5', 'responses', 'openai.gpt-5.5'],
    ['bedrock:converse:openai.gpt-5.5', 'responses', 'openai.gpt-5.5'],
    ['bedrock:completion:xai.grok-4.3', 'responses', 'xai.grok-4.3'],
    ['bedrock:responses:openai.gpt-oss-120b', 'responses', 'openai.gpt-oss-120b'],
    ['bedrock:openai.gpt-oss-120b-1:0', 'invoke', 'openai.gpt-oss-120b-1:0'],
    ['bedrock:converse:us.openai.gpt-5.6-sol', 'converse', 'us.openai.gpt-5.6-sol'],
    ['bedrock:converse:us.xai.grok-4.6', 'converse', 'us.xai.grok-4.6'],
    ['bedrock:completion:amazon.nova-pro-v1:0', 'invoke', 'amazon.nova-pro-v1:0'],
    ['bedrock:mantle:openai.gpt-oss-120b', 'chat', 'openai.gpt-oss-120b'],
    ['bedrock:mantle:xai.grok-4.3', 'chat', 'xai.grok-4.3'],
    ['bedrock:messages:us.anthropic.claude-fable-5-1', 'messages', 'us.anthropic.claude-fable-5-1'],
    ['bedrock:anthropic.claude-mythos-5', 'messages', 'anthropic.claude-mythos-5'],
    ['bedrock:anthropic.claude-fable-5', 'invoke', 'anthropic.claude-fable-5'],
    // Invalid model/API combinations are still validated by the provider factory.
    ['bedrock:converse:anthropic.claude-mythos-5', 'converse', 'anthropic.claude-mythos-5'],
    ['bedrock:responses:', 'responses', ''],
    ['bedrock:', 'invoke', ''],
    [
      'bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/example',
      'invoke',
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/example',
    ],
  ])('resolves %s to %s without changing the model ID', (id, apiMode, modelId) => {
    expect(getBedrockTextRoute(id)).toEqual({ apiMode, modelId });
  });

  it.each([
    'openai:responses:gpt-5.5',
    'bedrock:kb:openai.gpt-5.5',
    'bedrock:agents:xai.grok-4.3',
    'bedrock:embeddings:openai.gpt-5.5',
    'bedrock:video:amazon.nova-reel-v1:0',
    'bedrock:toString:openai.gpt-5.5',
    'bedrock:__proto__:openai.gpt-5.5',
  ])('does not treat %s as a text route', (id) => {
    expect(getBedrockTextRoute(id)).toBeUndefined();
  });
});
