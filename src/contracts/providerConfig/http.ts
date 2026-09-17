import { z } from 'zod';
import { HttpAuthInputSchema } from './httpAuth.js';
import { HttpMultipartInputSchema } from './httpMultipart.js';
import { HttpSignatureAuthInputSchema } from './httpSignature.js';
import { HttpTlsInputSchema } from './httpTls.js';

const JsonValueSchema = z.json();
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
const BodySchema = z.union([JsonObjectSchema, z.string(), z.array(JsonValueSchema)]);
const StringMapSchema = z.record(z.string(), z.string());

export const HttpSessionInputSchema = z.strictObject({
  /** URL of the session endpoint. */
  url: z.string().describe('Session endpoint URL; supports templates'),
  /** HTTP method for the session endpoint; defaults to POST at runtime. */
  method: z
    .enum(['GET', 'POST'])
    .optional()
    .describe('Session endpoint method; defaults to POST at runtime'),
  /** Headers to send with the session endpoint request. */
  headers: StringMapSchema.optional().describe('Session request headers; values support templates'),
  /** Request body for the session endpoint, for POST requests. */
  body: z
    .union([JsonObjectSchema, z.string()])
    .optional()
    .describe('Session request body for POST requests'),
  /** Expression or module reference extracting the session ID from the response. */
  responseParser: z
    .string()
    .describe('Expression or module reference extracting the session ID, e.g. data.body.sessionId'),
});

export const HttpTokenEstimationInputSchema = z.strictObject({
  enabled: z
    .boolean()
    .optional()
    .describe('Defaults to false inside an explicit tokenEstimation object'),
  multiplier: z
    .number()
    .min(0.01)
    .optional()
    .describe('Token estimate multiplier; defaults to 1.3 at runtime'),
});

export const HttpProviderConfigFieldsSchema = z.strictObject({
  body: BodySchema.optional().describe(
    'Request payload or template/file reference; object keys and JSON payloads are intentionally open',
  ),
  headers: StringMapSchema.optional().describe(
    'HTTP headers; names are open and values support templates',
  ),
  maxRetries: z
    .number()
    .min(0)
    .optional()
    .describe('Maximum retry count; omitted uses the execution-time default'),
  method: z
    .string()
    .optional()
    .describe('HTTP method; supports templates. Defaults to POST for multipart, otherwise GET'),
  multipart: HttpMultipartInputSchema.optional().describe(
    'Multipart upload; cannot be combined with body or a nonempty raw request',
  ),
  queryParams: StringMapSchema.optional().describe(
    'Query parameters; names are open and values support templates',
  ),
  request: z
    .string()
    .optional()
    .describe('Raw HTTP request or file reference; takes precedence over body'),
  /** Tools in OpenAI format; transformToolsFormat converts them for other providers. */
  tools: z
    .array(JsonObjectSchema)
    .optional()
    .describe(
      'OpenAI-format tool objects, including provider-specific JSON fields and tool parameter schemas',
    ),
  /** Tool choice in OpenAI format; transformToolsFormat converts it for other providers. */
  tool_choice: JsonValueSchema.optional().describe(
    'Provider tool-choice payload; intentionally open JSON',
  ),
  /** Convert OpenAI-format tools and tool_choice to the selected provider format. */
  transformToolsFormat: z
    .enum(['openai', 'anthropic', 'bedrock', 'google'])
    .optional()
    .describe('Convert OpenAI-format tools and tool_choice to this provider format'),
  useHttps: z.boolean().optional().describe('Use HTTPS; applies only to raw requests'),
  /** Call a separate endpoint to obtain a session ID before the main API request. */
  session: HttpSessionInputSchema.optional().describe(
    'Endpoint called to obtain a session ID before the main request',
  ),
  sessionParser: z
    .string()
    .optional()
    .describe('Expression or module reference extracting the session ID from the main response'),
  sessionSource: z.enum(['client', 'server', 'endpoint']).optional(),
  stateful: z.boolean().optional(),
  transformRequest: z
    .string()
    .optional()
    .describe('Request transform expression or module reference; executed only at runtime'),
  transformResponse: z
    .string()
    .optional()
    .describe('Response transform expression or module reference; executed only at runtime'),
  url: z.string().optional().describe('Overrides the provider URL; supports templates'),
  validateStatus: z
    .string()
    .optional()
    .describe('Expression or module reference deciding whether a status code is successful'),
  /** @deprecated Use transformResponse instead. */
  responseParser: z
    .string()
    .optional()
    .meta({ description: 'Deprecated alias for transformResponse', deprecated: true }),
  tokenEstimation: HttpTokenEstimationInputSchema.optional().describe(
    'Token estimation settings; omitted may enable estimation for red-team runs',
  ),
  auth: HttpAuthInputSchema.optional(),
  signatureAuth: HttpSignatureAuthInputSchema.optional(),
  tls: HttpTlsInputSchema.optional(),
});

const RequestModeSchema = z.union([
  z.object({ request: z.string().min(1), multipart: z.never().optional() }),
  z.object({
    body: z.union([JsonObjectSchema, z.string().min(1), z.array(JsonValueSchema)]),
    multipart: z.never().optional(),
  }),
  z.object({ method: z.literal('GET'), multipart: z.never().optional() }),
  z.object({
    multipart: HttpMultipartInputSchema,
    method: z
      .string()
      .regex(/^(?!(?:[Gg][Ee][Tt]|[Hh][Ee][Aa][Dd])$)[\s\S]*$/)
      .optional(),
    request: z.literal('').optional(),
    body: z.never().optional(),
  }),
]);

type HttpProviderConfigInputFields = z.input<typeof HttpProviderConfigFieldsSchema>;

interface HttpProviderConfigInputDocumentation {
  /** Tools in OpenAI format; transformToolsFormat converts them for other providers. */
  tools?: HttpProviderConfigInputFields['tools'];
  /** Tool choice in OpenAI format; transformToolsFormat converts it for other providers. */
  tool_choice?: HttpProviderConfigInputFields['tool_choice'];
  /** Convert OpenAI-format tools and tool_choice to the selected provider format. */
  transformToolsFormat?: HttpProviderConfigInputFields['transformToolsFormat'];
  /** Call a separate endpoint to obtain a session ID before the main API request. */
  session?: HttpProviderConfigInputFields['session'];
  /** @deprecated Use transformResponse instead. */
  responseParser?: HttpProviderConfigInputFields['responseParser'];
}

export type HttpProviderConfigInput = HttpProviderConfigInputDocumentation &
  HttpProviderConfigInputFields &
  z.input<typeof RequestModeSchema>;

export const HttpProviderConfigInputSchema: z.ZodType<
  HttpProviderConfigInput,
  HttpProviderConfigInput
> = z
  .union([
    HttpProviderConfigFieldsSchema.extend(RequestModeSchema.options[0].shape),
    HttpProviderConfigFieldsSchema.extend(RequestModeSchema.options[1].shape),
    HttpProviderConfigFieldsSchema.extend(RequestModeSchema.options[2].shape),
    HttpProviderConfigFieldsSchema.extend(RequestModeSchema.options[3].shape),
  ])
  .describe(
    'Complete serializable HTTP provider configuration. Supply a body, raw request, multipart upload, or literal GET method. Files, credentials, templates and response transforms are resolved only during execution',
  );

export const HttpProviderConfigInputJsonSchema = z.toJSONSchema(HttpProviderConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
  reused: 'ref',
});
