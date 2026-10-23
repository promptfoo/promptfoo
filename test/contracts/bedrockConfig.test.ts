import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BedrockConverseConfigInputSchema,
  BedrockConverseProviderOptionsInputJsonSchema,
  BedrockConverseProviderOptionsInputSchema,
} from '../../src/contracts';
import { getBedrockTextRoute } from '../../src/providers/bedrock/routing';

import type { BedrockConverseConfigInput } from '../../src/contracts';
import type { BedrockConverseOptions } from '../../src/providers/bedrock/converse';

const validate = new Ajv({ strict: false }).compile(BedrockConverseProviderOptionsInputJsonSchema);
describe('portable Bedrock Converse configuration', () => {
  const validIds = [
    'bedrock:converse:anthropic.claude-sonnet-4-5',
    'bedrock:converse:us.anthropic.claude-sonnet-4-5',
    'bedrock:converse:amazon.nova-pro-v1:0',
    'bedrock:converse:us.xai.grok-4.6',
    'bedrock:converse:global.xai.grok-4.6',
    'bedrock:converse:openai.gpt-oss-120b-1:0',
    'bedrock:converse:arn:aws:bedrock:us-east-1:123:application-inference-profile/test',
  ];
  const cases: [unknown, boolean][] = [
    ...[
      { tools: [{ name: 'lookup', parameters: { type: 'object' } }] },
      { tools: ['file://one.json', 'file://two.yaml'] },
      { tools: [{ type: 'function', function: { name: 'a' } }, { toolSpec: { name: 'b' } }] },
      { toolChoice: 'none' },
      { guardrailIdentifier: 123, guardrailVersion: 1 },
    ].map((config): [unknown, boolean] => [
      { id: 'bedrock:converse:amazon.nova-pro-v1:0', config },
      true,
    ]),
    [{ id: 'bedrock:converse:amazon.nova-pro-v1:0', inputs: { question: '{{query}}' } }, true],
    [
      {
        id: 'bedrock:converse:amazon.nova-pro-v1:0',
        config: { mcp: { enabled: true, server: { command: 'fixture' } } },
      },
      true,
    ],
    [
      {
        id: 'bedrock:converse:amazon.nova-pro-v1:0',
        config: { mcp: { server: { command: 'fixture' }, defaultArgs: { session: 'ignored' } } },
      },
      false,
    ],
    [
      {
        id: 'bedrock:converse:amazon.nova-pro-v1:0',
        config: { mcp: { server: { command: 'fixture' }, transform: 'output' } },
      },
      false,
    ],
    ...validIds.map((id): [unknown, boolean] => [{ id }, true]),
    [
      {
        id: validIds[0],
        config: {
          region: '{{ region }}',
          profile: 'test',
          max_tokens: 0,
          top_p: 0,
          stop: [],
          streaming: false,
          thinking: { type: 'adaptive' },
          additionalModelRequestFields: { output_config: { effort: 'high' } },
        },
      },
      true,
    ],
    [
      {
        id: validIds[0],
        config: {
          tools: [
            { toolSpec: { name: 'lookup', inputSchema: { json: { type: 'object' } } } },
            { type: 'function', function: { name: 'other', parameters: {} } },
            { name: 'legacy', input_schema: {} },
          ],
          tool_choice: { type: 'function', function: { name: 'lookup' } },
          functionToolCallbacks: { lookup: 'file://lookup.js' },
          guardrailIdentifier: 'guardrail',
          trace: 'enabled_full',
        },
      },
      true,
    ],
    [
      {
        id: validIds[0],
        config: {
          tools: 'file://tools.json',
          performanceConfig: { latency: 'optimized' },
          serviceTier: { type: 'flex' },
          reasoningConfig: { type: 'enabled', maxReasoningEffort: 'low' },
        },
      },
      true,
    ],
    ...[
      'bedrock:amazon.nova-pro-v1:0',
      'bedrock:completion:amazon.nova',
      'bedrock:converse:openai.gpt-5',
      'bedrock:converse:xai.grok-4',
      'bedrock:converse:us.anthropic.claude-mythos-5',
      'bedrock:converse:',
      'bedrock-agent:test',
      'bedrock:converse:anthropic.claude-mythos-5',
      'bedrock:converse:anthropic.claude-mythos-preview',
      'bedrock:converse:eu.xai.grok-4.6',
      'bedrock:converse:amazon.nova-sonic-v1:0',
      'bedrock:converse:us.amazon.nova-2-sonic-v1:0',
    ].map((id): [unknown, boolean] => [{ id }, false]),
    ...[
      { maxTokens: '100' },
      { maxToken: 100 },
      { tools: [{ toolSpec: { description: 'missing name' } }] },
      { thinking: { type: 'enabled' } },
      { toolChoice: 'required' },
      { serviceTier: { type: 'unknown' } },
      { additionalModelRequestFields: [] },
      { inferenceConfig: { maxTokens: 10 } },
    ].map((config): [unknown, boolean] => [{ id: validIds[0], config }, false]),
  ];
  it.each(cases)('preserves Zod/Ajv parity for %j', (input, accepted) => {
    expect(BedrockConverseProviderOptionsInputSchema.safeParse(input).success).toBe(accepted);
    expect(validate(input)).toBe(accepted);
  });
  it.each(validIds)('pairs %s with the actual Converse route', (id) => {
    expect(getBedrockTextRoute(id)?.apiMode).toBe('converse');
  });
  it('preserves defaults and excludes runtime callbacks', () => {
    expect(BedrockConverseConfigInputSchema.parse({})).toEqual({});
    expect(
      BedrockConverseConfigInputSchema.safeParse({
        functionToolCallbacks: { lookup: () => 'answer' },
      }).success,
    ).toBe(false);
    expect(
      BedrockConverseConfigInputSchema.safeParse({
        additionalModelRequestFields: { callback: () => 'answer' },
      }).success,
    ).toBe(false);
    expectTypeOf<BedrockConverseConfigInput['maxTokens']>().toEqualTypeOf<
      BedrockConverseOptions['maxTokens']
    >();
  });
});
