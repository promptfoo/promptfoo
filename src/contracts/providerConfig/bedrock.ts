import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../env.js';
import { InputsInputSchema } from '../shared.js';
import { McpClientConfigInputSchema } from './mcp.js';

const JsonObject = z.record(z.string(), z.json());
const NamedTool = z.strictObject({ name: z.string() });
const Tool = z.union([
  z.strictObject({
    toolSpec: z.strictObject({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.strictObject({ json: z.json() }).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('function'),
    function: z.strictObject({
      name: z.string(),
      description: z.string().optional(),
      parameters: JsonObject.optional(),
    }),
  }),
  z.strictObject({
    name: z.string(),
    description: z.string().optional(),
    input_schema: JsonObject.optional(),
    parameters: JsonObject.optional(),
  }),
]);
const ToolChoice = z.union([z.enum(['auto', 'any', 'none']), z.strictObject({ tool: NamedTool })]);
const OpenAiToolChoice = z.union([
  ToolChoice,
  z.enum(['none', 'required']),
  z.strictObject({ type: z.literal('function'), function: NamedTool }),
]);

export const BedrockConverseConfigInputSchema = z.strictObject({
  accessKeyId: z.string().optional(),
  apiKey: z.string().optional(),
  profile: z.string().optional(),
  region: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  endpoint: z.string().optional(),
  guardrailIdentifier: z.union([z.string(), z.number()]).optional(),
  guardrailVersion: z.union([z.string(), z.number()]).optional(),
  trace: z.enum(['enabled', 'disabled', 'enabled_full']).optional(),
  showThinking: z.boolean().optional(),
  maxTokens: z.number().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  top_p: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  stop: z.array(z.string()).optional(),
  thinking: z
    .union([
      z.strictObject({
        type: z.literal('enabled'),
        budget_tokens: z.number(),
        display: z.enum(['summarized', 'omitted']).optional(),
      }),
      z.strictObject({
        type: z.literal('adaptive'),
        display: z.enum(['summarized', 'omitted']).optional(),
      }),
      z.strictObject({ type: z.literal('disabled') }),
      z.strictObject({ type: z.literal('between_tools') }),
    ])
    .optional(),
  reasoningConfig: z
    .strictObject({
      type: z.enum(['enabled', 'disabled']),
      maxReasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
    })
    .optional(),
  performanceConfig: z.strictObject({ latency: z.enum(['standard', 'optimized']) }).optional(),
  serviceTier: z
    .strictObject({ type: z.enum(['priority', 'default', 'flex', 'reserved']) })
    .optional(),
  tools: z
    .union([
      z.array(Tool),
      z.string().regex(/^file:\/\/[\s\S]+/),
      z.array(z.string().regex(/^file:\/\/[\s\S]+/)),
    ])
    .optional(),
  toolChoice: ToolChoice.optional(),
  tool_choice: OpenAiToolChoice.optional(),
  mcp: McpClientConfigInputSchema.optional(),
  functionToolCallbacks: z.record(z.string(), z.string()).optional(),
  additionalModelRequestFields: JsonObject.optional(),
  additionalModelResponseFieldPaths: z.array(z.string()).optional(),
  streaming: z.boolean().optional(),
});

export const BedrockConverseProviderOptionsInputSchema = z.strictObject({
  id: z
    .string()
    .regex(
      /^bedrock:converse:(?!openai\.(?![^:]*gpt-oss))(?!xai\.grok-)(?!anthropic\.claude-mythos-(?:5|preview)$)(?![^.]+\.anthropic\.claude-mythos-(?:5|preview)$)(?!(?!(?:us|global)\.xai\.grok-4\.6$)[^:]*\.xai\.)(?!(?:[^.]+\.)?amazon\.nova(?:-2)?-sonic-v1:0$).+$/,
    ),
  config: BedrockConverseConfigInputSchema.optional(),
  inputs: InputsInputSchema.optional(),
  label: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.catchall(z.string()).optional(),
});
export type BedrockConverseConfigInput = z.input<typeof BedrockConverseConfigInputSchema>;
export type BedrockConverseProviderOptionsInput = z.input<
  typeof BedrockConverseProviderOptionsInputSchema
>;
export const BedrockConverseConfigInputJsonSchema = z.toJSONSchema(
  BedrockConverseConfigInputSchema,
  { target: 'draft-07', io: 'input', unrepresentable: 'throw' },
);
export const BedrockConverseProviderOptionsInputJsonSchema = z.toJSONSchema(
  BedrockConverseProviderOptionsInputSchema,
  { target: 'draft-07', io: 'input', unrepresentable: 'throw' },
);
