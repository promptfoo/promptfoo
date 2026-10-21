import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../env.js';
import { McpClientConfigInputSchema } from './mcp.js';

const JsonObject = z.record(z.string(), z.json());
const ResponseSchema = z.union([z.string(), JsonObject]);
const Voice = z.strictObject({
  voice: z.string().optional(),
  prebuiltVoiceConfig: z.strictObject({ voiceName: z.string().optional() }).optional(),
});
const Speech = z.strictObject({
  voiceConfig: Voice.optional(),
  languageCode: z.string().optional(),
  multiSpeakerVoiceConfig: z
    .strictObject({
      speakerVoiceConfigs: z.array(z.strictObject({ speaker: z.string(), voiceConfig: Voice })),
    })
    .optional(),
});
const Sampling = z.strictObject({
  context: z.string().optional(),
  examples: z.array(z.strictObject({ input: z.string(), output: z.string() })).optional(),
  stopSequences: z.array(z.string()).optional(),
  temperature: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
});
const CallingMode = z.enum([
  'MODE_UNSPECIFIED',
  'AUTO',
  'VALIDATED',
  'ANY',
  'NONE',
  'auto',
  'validated',
  'any',
  'none',
]);
const FunctionDeclaration = z.strictObject({
  name: z.string(),
  description: z.string().optional(),
  behavior: z.enum(['BLOCKING', 'NON_BLOCKING']).optional(),
  parameters: JsonObject.optional(),
  response: JsonObject.optional(),
});
const Tool = z.strictObject({
  functionDeclarations: z.array(FunctionDeclaration).optional(),
  function_declarations: z.array(FunctionDeclaration).optional(),
  googleSearchRetrieval: z
    .strictObject({
      dynamicRetrievalConfig: z.strictObject({
        mode: z.enum(['MODE_UNSPECIFIED', 'MODE_DYNAMIC']).optional(),
        dynamicThreshold: z.number().optional(),
      }),
    })
    .optional(),
  codeExecution: JsonObject.optional(),
  googleSearch: JsonObject.optional(),
  googleMaps: z.strictObject({ enableWidget: z.boolean().optional() }).optional(),
  urlContext: JsonObject.optional(),
  fileSearch: z
    .strictObject({
      fileSearchStoreNames: z.array(z.string()),
      metadataFilter: z.string().optional(),
    })
    .optional(),
  computerUse: z
    .strictObject({
      environment: z.enum(['ENVIRONMENT_BROWSER', 'ENVIRONMENT_MOBILE', 'ENVIRONMENT_DESKTOP']),
      enablePromptInjectionDetection: z.boolean().optional(),
      excludedPredefinedFunctions: z.array(z.string()).optional(),
      disabledSafetyPolicies: z.array(z.string()).optional(),
    })
    .optional(),
});

export const GeminiSharedConfigInputSchema = Sampling.extend({
  apiKey: z.string().optional(),
  apiHost: z.string().optional(),
  apiVersion: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  cost: z.number().optional(),
  inputCost: z.number().optional(),
  outputCost: z.number().optional(),
  audioCost: z.number().optional(),
  audioInputCost: z.number().optional(),
  audioOutputCost: z.number().optional(),
  imageInputCost: z.number().optional(),
  service_tier: z.enum(['standard', 'priority', 'flex']).optional(),
  passthrough: JsonObject.optional(),
  safetySettings: z
    .array(
      z.strictObject({
        category: z.string(),
        threshold: z.string().optional(),
        probability: z.string().optional(),
      }),
    )
    .optional(),
  generationConfig: Sampling.extend({
    response_mime_type: z.string().optional(),
    response_schema: ResponseSchema.optional(),
    response_modalities: z.array(z.string()).optional(),
    responseModalities: z.array(z.string()).optional(),
    speechConfig: Speech.optional(),
    thinkingConfig: z
      .strictObject({
        thinkingBudget: z.number().optional(),
        thinkingLevel: z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']).optional(),
      })
      .optional(),
  }).optional(),
  responseSchema: ResponseSchema.optional(),
  toolConfig: z
    .strictObject({
      functionCallingConfig: z
        .strictObject({
          mode: CallingMode.optional(),
          allowedFunctionNames: z.array(z.string()).optional(),
          streamFunctionCallArguments: z.boolean().optional(),
        })
        .optional(),
      retrievalConfig: z
        .strictObject({
          latLng: z.strictObject({ latitude: z.number(), longitude: z.number() }).optional(),
          languageCode: z.string().optional(),
        })
        .optional(),
      includeServerSideToolInvocations: z.boolean().optional(),
    })
    .optional(),
  tool_config: z
    .strictObject({
      function_calling_config: z
        .strictObject({
          mode: CallingMode.optional(),
          allowed_function_names: z.array(z.string()).optional(),
          stream_function_call_arguments: z.boolean().optional(),
        })
        .optional(),
      retrieval_config: z
        .strictObject({
          lat_lng: z.strictObject({ latitude: z.number(), longitude: z.number() }).optional(),
          language_code: z.string().optional(),
        })
        .optional(),
      include_server_side_tool_invocations: z.boolean().optional(),
    })
    .optional(),
  tool_choice: z
    .union([
      z.enum(['auto', 'none', 'required']),
      z.strictObject({
        type: z.literal('function'),
        function: z.strictObject({ name: z.string() }),
      }),
    ])
    .optional(),
  tools: z.union([z.array(Tool), z.string().regex(/^file:\/\/[\s\S]+/)]).optional(),
  functionToolCallbacks: z.record(z.string(), z.string()).optional(),
  functionToolStatefulApi: z
    .strictObject({
      url: z.string(),
      file: z.string().optional(),
      pythonExecutable: z.string().optional(),
    })
    .optional(),
  systemInstruction: z
    .union([
      z.string(),
      z.strictObject({ role: z.string().optional(), parts: z.array(JsonObject) }),
    ])
    .optional(),
  mcp: McpClientConfigInputSchema.optional(),
  useAssistantRole: z.boolean().optional(),
  streaming: z.boolean().optional(),
});

export const GoogleAiStudioConfigInputSchema = GeminiSharedConfigInputSchema.extend({
  apiKeyRequired: z.boolean().optional(),
  apiBaseUrl: z.string().optional(),
});
export const VertexGeminiConfigInputSchema = GeminiSharedConfigInputSchema.extend({
  projectId: z.string().optional(),
  region: z.string().optional(),
  publisher: z.string().optional(),
  credentials: z.string().optional(),
  expressMode: z.boolean().optional(),
  keyFilename: z.string().optional(),
  scopes: z.union([z.string(), z.array(z.string())]).optional(),
  googleAuthOptions: JsonObject.optional(),
  modelArmor: z
    .strictObject({
      promptTemplate: z.string().optional(),
      responseTemplate: z.string().optional(),
    })
    .optional(),
});

const Model =
  'gemini-(?!(?:omni-flash-preview|omni-1\\.1-flash(?:-preview)?|robotics-er-2-preview|3\\.5-live-translate-preview)$)(?!robotics-er-2-streaming-)(?![^:]*-image)(?!nano-banana-2\\.1$)[^:]+';
const Options = z.strictObject({
  label: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.catchall(z.string()).optional(),
});
export const GoogleAiStudioProviderOptionsInputSchema = Options.extend({
  id: z.string().regex(new RegExp(`^(?:google|palm):${Model}$`)),
  config: GoogleAiStudioConfigInputSchema.optional(),
});
export const VertexGeminiProviderOptionsInputSchema = Options.extend({
  id: z.string().regex(new RegExp(`^vertex:(?:chat:)?${Model}$`)),
  config: VertexGeminiConfigInputSchema.optional(),
});
export const GeminiProviderOptionsInputSchema = z.union([
  GoogleAiStudioProviderOptionsInputSchema,
  VertexGeminiProviderOptionsInputSchema,
]);
export type GoogleAiStudioConfigInput = z.input<typeof GoogleAiStudioConfigInputSchema>;
export type VertexGeminiConfigInput = z.input<typeof VertexGeminiConfigInputSchema>;
export type GeminiProviderOptionsInput = z.input<typeof GeminiProviderOptionsInputSchema>;
export const GoogleAiStudioConfigInputJsonSchema = z.toJSONSchema(GoogleAiStudioConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
});
export const VertexGeminiConfigInputJsonSchema = z.toJSONSchema(VertexGeminiConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
});
export const GeminiProviderOptionsInputJsonSchema = z.toJSONSchema(
  GeminiProviderOptionsInputSchema,
  { target: 'draft-07', io: 'input', unrepresentable: 'throw' },
);
