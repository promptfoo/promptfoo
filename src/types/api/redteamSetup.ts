import { z } from 'zod';

// The HTTP provider evaluates transformResponse. Only property reads may become a reply path.
export function isSetupReplyPath(path: string): boolean {
  return (
    path.length <= 200 &&
    /^[A-Za-z_]\w*(?:(?:\.[A-Za-z_]\w*)|(?:\[(?:0|[1-9]\d*)\]))*$/.test(path) &&
    !path.split(/[.\[\]]/).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
  );
}

const replyPath = z.string().refine(isSetupReplyPath);

// The local verifier never evaluates JavaScript or loads a provider. Accept
// only native options whose request it can reproduce and whose reply it can read.
const reservedHeaders = new Set(
  (
    'host origin referer cookie cookie2 set-cookie connection keep-alive upgrade expect ' +
    'te trailer transfer-encoding forwarded via user-agent range traceparent tracestate baggage ' +
    'x-real-ip x-host x-method-override constructor prototype'
  ).split(' '),
);
const reservedPrefixes =
  /^(?:accept-|content-|proxy-|sec-|access-control-|x-(?:promptfoo|forwarded|original|rewrite|http|proxy|envoy)-)/;
const visibleHeaders =
  /^(?:accept|content-type|x-org-id|x-organization-id|x-scope-orgid|x-tenant-id|openai-.*|x-openai-.*)$/;
const sensitive =
  /password|passwd|credential|secret|cookie|(?:^|[-_])(?:authorization|auth|token|key|signature)(?:$|[-_])|api[-_]?key|access[-_]?token/i;
const unsafe = /\{[{%#]|\$\{|file:\/\//i;
const publicValue = (value: string) =>
  !/\{\{(?!\s*(?:prompt|sessionId)\s*\}\})|\{[%#]|\$\{/.test(value) && !/file:\/\//i.test(value);

export function headerVariable(value: string): string | undefined {
  return /^(?:(?:Bearer|Basic|Token|ApiKey) )?\{\{\s*env\.([A-Z_][A-Z0-9_]*)\s*\}\}$/.exec(
    value,
  )?.[1];
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

function safeHeader(name: string, value: string) {
  const normalized = name.toLowerCase().replace(/_/g, '-');
  if (
    !/^[a-z][\w-]*$/i.test(name) ||
    /[^\x20-\x7e]/.test(value) ||
    reservedHeaders.has(normalized)
  ) {
    return false;
  }
  if (name.toLowerCase() === 'content-type') {
    return /^(?:application\/(?:json|x-www-form-urlencoded)|text\/plain)(?:;\s*charset=[uU][tT][fF]-8)?$/.test(
      value,
    );
  }
  if (reservedPrefixes.test(normalized)) {
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

function safePayload(body: unknown) {
  let safe = true;
  JSON.stringify(body, (name, value) => {
    if (
      ['$ref', 'constructor', 'prototype', '__proto__'].includes(name) ||
      unsafe.test(name) ||
      sensitive.test(name) ||
      (typeof value === 'string' && !publicValue(value))
    ) {
      safe = false;
    }
    return value;
  });
  return safe;
}

const response = z
  .string()
  .refine(
    (value) =>
      value === 'text' ||
      value === 'json' ||
      (value.startsWith('json.') && isSetupReplyPath(value.slice(5))),
  );
const config = z.strictObject({
  url: url.optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']),
  headers: z
    .record(z.string(), z.string())
    .refine((headers) => {
      const names = Object.keys(headers).map((name) => name.toLowerCase());
      return (
        new Set(names).size === names.length &&
        Object.entries(headers).every(([name, value]) => safeHeader(name, value))
      );
    })
    .optional(),
  body: z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.string()])
    .refine(safePayload)
    .optional(),
  queryParams: z.record(z.string(), z.string()).refine(safePayload).optional(),
  transformResponse: response.optional(),
  responseParser: response.optional(),
  redirect: z.literal('error').optional(),
  maxRetries: z.int().nonnegative().optional(),
  stateful: z.boolean().optional(),
  sessionSource: z.literal('client').optional(),
});

export const SetupConnectionTest = {
  Request: z
    .strictObject({
      id: z.union([z.literal('http'), z.literal('https'), url]),
      label: z
        .string()
        .refine((value) => !unsafe.test(value))
        .optional(),
      config,
    })
    .refine(({ id, config }) => {
      const destination = config.url ?? id;
      if (!url.safeParse(destination).success || (id.includes('://') && id !== destination)) {
        return false;
      }
      if (
        (config.method === 'GET') === Boolean(config.body) ||
        (config.transformResponse && config.responseParser)
      ) {
        return false;
      }
      const contentType = Object.entries(config.headers ?? {}).find(
        ([key]) => key.toLowerCase() === 'content-type',
      )?.[1];
      if (
        config.body &&
        contentType &&
        (typeof config.body !== 'string') !== contentType.startsWith('application/json')
      ) {
        return false;
      }
      if (!/\{\{\s*prompt\s*\}\}/.test(JSON.stringify([config.body, config.queryParams]))) {
        return false;
      }
      if (Object.values(config.headers ?? {}).some((value) => headerVariable(value))) {
        const parsed = new URL(destination);
        return (
          config.redirect === 'error' &&
          (parsed.protocol === 'https:' ||
            ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
        );
      }
      return true;
    }),
  Response: z.strictObject({
    success: z.boolean(),
    message: z.string().max(500),
    paths: z
      .array(z.union([z.literal('Plain text'), replyPath]))
      .max(4)
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
});

export const RedteamSetupReplySchema = HostedSetupReplySchema.extend({
  runnable: z.boolean(),
  runIssue: z.string().optional(),
  testableTargets: z.array(z.int().nonnegative()),
});
