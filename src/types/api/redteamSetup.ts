import { z } from 'zod';
import {
  AnthropicMessagesConfigInputSchema,
  AnthropicProviderOptionsInputSchema,
} from '../../contracts/providerConfig/anthropic';
import {
  HttpProviderConfigFieldsSchema,
  HttpProviderConfigInputJsonSchema,
  HttpProviderConfigInputSchema,
} from '../../contracts/providerConfig/http';
import {
  OpenAiChatConfigInputSchema,
  OpenAiProviderOptionsInputSchema,
  OpenAiResponsesConfigInputSchema,
} from '../../contracts/providerConfig/openai';

// Credential selectors, alternate services, tools and callbacks need local review.
// Check everything else against the selected provider's own inference schema.
const privilegedOption =
  /^(?:apiKey.*|apiHost|apiBaseUrl|headers|organization|useDefaultApiKey|functionToolCallbacks|mcp|passthrough|extra_body|webhook_url|tools|tool_resources|functions|previous_response_id)$/i;
export function isSetupModelConfig(id: string, config: Record<string, unknown>) {
  if (Object.keys(config).some((key) => privilegedOption.test(key))) {
    return false;
  }
  if (/^https?(?::\/\/|$)/.test(id)) {
    // Prompt and test options can override any provider, including a gateway.
    return (
      OpenAiChatConfigInputSchema.safeParse(config).success ||
      OpenAiResponsesConfigInputSchema.safeParse(config).success
    );
  }
  // Match native API routes, not a model catalog. Provider prefixes alone
  // are insufficient because some routes start local agents or load code.
  if (!/^[\w.:-]+(?:\/[\w.:-]+)*$/.test(id) || /(?:^|[:/])\.{1,2}(?:[:/]|$)/.test(id)) {
    return false;
  }
  if (id.startsWith('openai:')) {
    if (/^openai:(?:gpt-|o\d|chatgpt-)[\w.-]*$/.test(id)) {
      return (
        OpenAiChatConfigInputSchema.safeParse(config).success ||
        OpenAiResponsesConfigInputSchema.safeParse(config).success
      );
    }
    return OpenAiProviderOptionsInputSchema.safeParse({ id, config }).success;
  }
  if (id.startsWith('anthropic:')) {
    return /^anthropic:claude-(?!code|agent)[\w.-]+$/.test(id)
      ? AnthropicMessagesConfigInputSchema.safeParse(config).success
      : AnthropicProviderOptionsInputSchema.safeParse({ id, config }).success;
  }
  if (/^(?:openrouter|groq):.+/.test(id)) {
    return (
      id.startsWith('groq:responses:')
        ? OpenAiResponsesConfigInputSchema
        : OpenAiChatConfigInputSchema
    ).safeParse(config).success;
  }
  if (!/^(?:ollama:.+|google:(?:chat:.+|gemini-[\w.-]+))$/.test(id)) {
    return false;
  }
  // These adapters have no portable config schema. Limit overrides to their
  // inference controls and leave unknown options intact for CLI review.
  const numeric = id.startsWith('ollama:')
    ? /^(?:num_predict|num_keep|num_ctx|seed|top_k|top_p|min_p|temperature|repeat_last_n|repeat_penalty|presence_penalty|frequency_penalty)$/
    : /^(?:temperature|topK|topP|maxOutputTokens|candidateCount|seed|frequencyPenalty|presencePenalty)$/;
  return Object.entries(config).every(
    ([key, value]) => typeof value === 'number' && numeric.test(key),
  );
}

// These expressions also run in the native HTTP provider. Admit property reads,
// including optional chaining, without allowing calls or computed expressions.
export function isSetupReplyPath(path: string): boolean {
  return (
    path.length <= 200 &&
    /^(?:[A-Za-z_$][\w$]*|\[(?:0|[1-9]\d*|"[\w-]+"|'[\w-]+')\])(?:(?:\?\.|\.)[A-Za-z_$][\w$]*|(?:\?\.)?\[(?:0|[1-9]\d*|"[\w-]+"|'[\w-]+')\])*$/.test(
      path,
    ) &&
    !/(?:^|[^\w$])(?:__proto__|prototype|constructor)(?:$|[^\w$])/.test(path)
  );
}

export function setupReplyPath(expression: string): string | undefined {
  const match = /^json(?:\?\.|\.(?!\[)|(?=\[))(.+)$/.exec(expression);
  return match && isSetupReplyPath(match[1]) ? match[1] : undefined;
}

const replyPath = z.string().refine(isSetupReplyPath);

// A model cannot control routing or HTTP framing through a header.
const reservedHeaders = new Set(
  (
    'host origin referer cookie cookie2 set-cookie connection keep-alive upgrade expect ' +
    'te trailer transfer-encoding content-encoding content-length forwarded via traceparent tracestate baggage ' +
    'x-real-ip x-host x-method-override constructor prototype'
  ).split(' '),
);
const reservedPrefixes =
  /^(?:proxy-|sec-|content-type.+|access-control-|x-(?:promptfoo|forwarded|original|rewrite|http|proxy|envoy)-)/;
const visibleHeaders =
  /^(?:accept|content-type|user-agent|x-org-id|x-organization-id|x-scope-orgid|x-tenant-id|openai-.*|x-openai-.*)$/;
const sensitive =
  /password|passwd|credential|secret|cookie|(?:^|[-_])(?:authorization|auth|token|key|signature)(?:$|[-_])|api[-_]?key|access[-_]?token/i;
const unsafe = /\{[{%#]|\$\{|file:\/\//i;
const inputs = /\{\{\s*([A-Za-z_]\w*)\s*(?:\|\s*(?:dump|trim|urlencode)\s*)?\}\}/g;

export function headerVariable(value: string): string | undefined {
  const template = value.replace(/^(?:Bearer|Basic|Token|ApiKey) /i, '');
  const match = /^\{\{\s*env(?:\.([a-zA-Z_]\w*)|\[(["'])([a-zA-Z_]\w*)\2\])\s*\}\}$/.exec(template);
  const name = match?.[1] ?? match?.[3];
  return name && !['constructor', 'prototype', '__proto__'].includes(name) ? name : undefined;
}

// Session-only references cannot override process settings or caller-named variables.
export const localKeyPrefix = 'PROMPTFOO_CHAT_KEY_';
const localKeyName = /^PROMPTFOO_CHAT_KEY_[A-F0-9]{32}$/;
export const localKeysSchema = z.record(
  z.string().regex(localKeyName),
  z
    .string()
    .min(1)
    .max(16000)
    .refine((v) => !unsafe.test(v) && !/[^\x20-\x7e]/.test(v)),
);

const shellReference =
  /^(?:(?:Bearer|Basic|Token|ApiKey) )?(?:\$[a-z_]\w*|\$\{[a-z_]\w*\}|process\.env\.[a-z_]\w*)$/i;

function safeHeader(name: string, value: string) {
  const normalized = name.toLowerCase().replace(/_/g, '-');
  if (
    !/^[a-z][\w-]*$/i.test(name) ||
    /[^\x20-\x7e]/.test(value) ||
    reservedHeaders.has(normalized)
  ) {
    return false;
  }
  if (reservedPrefixes.test(normalized) || shellReference.test(value)) {
    return false;
  }
  if (headerVariable(value)) {
    // Tracing intentionally preserves these routing/identification headers.
    return !visibleHeaders.test(normalized);
  }
  return !sensitive.test(normalized) && !unsafe.test(value);
}

const url = z.string().refine((value) => {
  if (!/^https?:\/\//i.test(value) || !URL.canParse(value) || /[\s\\{}#]/.test(value)) {
    return false;
  }
  const parsed = new URL(value);
  return (
    !parsed.username &&
    !parsed.password &&
    ![...parsed.searchParams.keys()].some((key) => sensitive.test(key))
  );
});

function safePayload(value: unknown): boolean {
  if (typeof value === 'string') {
    const literal = value.replace(inputs, (template, variable) =>
      /^(?:env|process|global|constructor|__proto__|prototype)$/i.test(variable) ? template : '',
    );
    return !unsafe.test(literal);
  }
  return (
    !value ||
    typeof value !== 'object' ||
    Object.entries(value).every(
      ([name, item]) =>
        !['$ref', 'constructor', 'prototype', '__proto__'].includes(name) &&
        !unsafe.test(name) &&
        safePayload(item),
    )
  );
}

const response = z
  .string()
  .refine((value) => value === 'text' || value === 'json' || setupReplyPath(value) !== undefined);

// Native settings carry through unless they execute code, load files, or can
// cause another request outside the verified destination and header bindings.
const config = HttpProviderConfigFieldsSchema.omit({
  request: true,
  auth: true,
  signatureAuth: true,
  tls: true,
  session: true,
  sessionParser: true,
  transformRequest: true,
  validateStatus: true,
}).extend({
  url: url.optional(),
  method: z
    .string()
    .regex(/^(?!(?:CONNECT|TRACE|TRACK)$)[a-z][a-z0-9-]*$/i)
    .optional(),
  transformResponse: response.optional(),
  responseParser: response.optional(),
});

const literal = z.string().refine((value) => !unsafe.test(value));
export const setupHttpTarget = z
  .strictObject({
    id: z.union([z.literal('http'), z.literal('https'), url]),
    label: literal.optional(),
    prompts: z.array(literal).optional(),
    delay: z.number().nonnegative().optional(),
    config,
  })
  .refine(({ id, config }) => {
    const destination = config.url ?? id;
    if (!url.safeParse(destination).success || (id.includes('://') && id !== destination)) {
      return false;
    }
    const headers = Object.entries(config.headers ?? {});
    const names = headers.map(([name]) => name.toLowerCase());
    if (new Set(names).size !== names.length || !headers.every(([k, v]) => safeHeader(k, v))) {
      return false;
    }
    const method = config.method ?? (config.multipart ? 'POST' : undefined);
    const payload = config.body || config.multipart;
    if (payload ? !method || /^(?:GET|HEAD)$/i.test(method) : method !== 'GET') {
      return false;
    }
    if (
      config.multipart &&
      (config.body ||
        config.multipart.parts.some((part) => part.kind === 'file' && part.source.type === 'path'))
    ) {
      return false;
    }
    const contentType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (
      config.body &&
      contentType &&
      typeof config.body !== 'string' &&
      !contentType.includes('application/json')
    ) {
      return false;
    }
    if (
      !safePayload([
        config.body,
        config.queryParams,
        config.tools,
        config.tool_choice,
        config.multipart,
      ])
    ) {
      return false;
    }
    // Native JSON rendering decodes stringified JSON before evaluating templates.
    if (typeof config.body === 'string' && contentType?.includes('application/json')) {
      try {
        if (!safePayload(JSON.parse(config.body))) {
          return false;
        }
      } catch {
        return false;
      }
    }
    if (headers.some(([, value]) => headerVariable(value))) {
      const parsed = new URL(destination);
      return (
        config.redirect === 'error' &&
        (parsed.protocol === 'https:' ||
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
      );
    }
    return true;
  });

// Validate native drafts without constructing a provider or loading external files.
function httpTargetValidationIssue(target: unknown): string | undefined {
  const value = typeof target === 'string' ? { id: target } : target;
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !/^https?(?::\/\/|$)/.test(value.id)
  ) {
    return;
  }
  const config = 'config' in value ? value.config : {};
  const fields = HttpProviderConfigFieldsSchema.safeParse(config);
  if (!fields.success) {
    const issue = fields.error.issues[0];
    const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[0];
    return typeof field === 'string' && /^[a-z_][\w-]{0,63}$/i.test(field)
      ? 'Invalid HTTP target option config.' + field + '.'
      : 'Unknown or invalid HTTP target config option.';
  }
  if (Object.values(fields.data.headers ?? {}).some((value) => shellReference.test(value))) {
    return 'HTTP headers use {{env.name}} for environment variables. Preserve the exact spelling and case of the name.';
  }
  // Missing fields are normal during a conversation. Only complete, safe
  // requests qualify for execution under setupHttpTarget.
  if (
    fields.data.body === undefined &&
    fields.data.request === undefined &&
    !fields.data.multipart
  ) {
    return;
  }
  if (!HttpProviderConfigInputSchema.safeParse(config).success) {
    return 'An HTTP target needs a body, raw request, multipart upload, or explicit GET method.';
  }
  if (!fields.data.request && fields.data.body && !fields.data.method) {
    return 'Set an explicit HTTP method for the request body. The HTTP provider defaults to GET and would omit the body.';
  }
  if (
    !fields.data.request &&
    fields.data.body &&
    /^(?:GET|HEAD)$/i.test(fields.data.method ?? '')
  ) {
    return 'GET and HEAD requests cannot include a body.';
  }
}

function probeInputs(config: z.infer<typeof setupHttpTarget>['config']) {
  const json = Object.entries(config.headers ?? {}).some(
    ([name, value]) => name.toLowerCase() === 'content-type' && value.includes('application/json'),
  );
  let body = config.body;
  if (json && typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  const payload = JSON.stringify([body, config.queryParams, config.multipart]);
  return Array.from(payload.matchAll(inputs), (match) => match[1]);
}

const pathBudget = 2048;
export const SetupConnectionTest = {
  pathBudget,
  usesPrompt: (config: z.infer<typeof setupHttpTarget>['config']) =>
    probeInputs(config)?.includes('prompt') ?? false,
  configSchema: HttpProviderConfigInputJsonSchema,
  validationIssue: httpTargetValidationIssue,
  Request: setupHttpTarget.refine(({ config }) => {
    // Leave provider-specific tool transformations and generated file uploads
    // to the scan. Never silently probe a different payload.
    if (
      (config.transformToolsFormat && config.transformToolsFormat !== 'openai') ||
      config.multipart?.parts.some((part) => part.kind === 'file')
    ) {
      return false;
    }
    // A probe cannot reproduce per-test variables. Keep them intact for Run.
    const variables = probeInputs(config);
    if (!variables) {
      return false;
    }
    return variables.every(
      (name) =>
        name === 'prompt' ||
        name === 'sessionId' ||
        (name === 'tools' && config.tools !== undefined) ||
        (name === 'tool_choice' && config.tool_choice !== undefined),
    );
  }),
  Response: z.strictObject({
    success: z.boolean(),
    retryable: z.boolean().optional(),
    message: z.string().max(500),
    paths: z
      .array(z.union([z.literal('Plain text'), replyPath]))
      .refine((paths) => JSON.stringify(paths).length <= pathBudget)
      .optional(),
  }),
};
export type SetupConnection = z.infer<typeof SetupConnectionTest.Request>;

// Preserve the authored document. The installed server validates it with the
// runtime schemas, whose defaults and collection expansions aren't edits.
export const SetupConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((config) => JSON.stringify(config).length <= 128000);

export const HostedSetupReplySchema = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  config: SetupConfigSchema.optional(),
  testTarget: z.int().nonnegative().optional(),
  testPrompt: z.string().min(1).max(16000).optional(),
});

export const RedteamSetupReplySchema = HostedSetupReplySchema.extend({
  runnable: z.boolean(),
  runIssue: z.string().optional(),
  testableTargets: z.array(z.int().nonnegative()),
});
