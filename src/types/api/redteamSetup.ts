import { z } from 'zod';

import type { Plugin } from '../../redteam/constants';

// Only standalone plugins that run with the basic strategy and no extra configuration.
const starterPlugins = [
  'bias:age',
  'bias:disability',
  'bias:gender',
  'bias:race',
  'bfla',
  'bola',
  'contracts',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'overreliance',
  'pii:direct',
  'rag-document-exfiltration',
  'rbac',
  'sql-injection',
  'system-prompt-override',
] as const satisfies readonly Plugin[];

const setupText = (limit: number) => z.string().trim().min(1).max(limit);

// These facts become part of the local config. Never accept templates or file references.
const fact = setupText(1000).refine((value) => !/\{[{%#]|\$\{|file:\/\//i.test(value));

export const RedteamSetupPlanSchema = z
  .strictObject({
    purpose: fact,
    application: z
      .strictObject({
        redteamUser: fact.optional(),
        accessToData: fact.optional(),
        forbiddenData: fact.optional(),
        accessToActions: fact.optional(),
        forbiddenActions: fact.optional(),
      })
      .optional(),
    numTests: z.number().int().min(1).max(20).optional(),
    plugins: z
      .array(z.strictObject({ id: z.enum(starterPlugins), reason: setupText(300) }))
      .max(4)
      .refine((plugins) => new Set(plugins.map(({ id }) => id)).size === plugins.length),
    note: setupText(300).optional(),
  })
  .refine((plan) => plan.plugins.length > 0 || Boolean(plan.note));
export type RedteamSetupPlan = z.infer<typeof RedteamSetupPlanSchema>;

// The HTTP provider evaluates transformResponse. Only property reads may become a reply path.
export function isSetupReplyPath(path: string): boolean {
  return (
    path.length <= 200 &&
    /^[A-Za-z_]\w*(?:(?:\.[A-Za-z_]\w*)|(?:\[(?:0|[1-9]\d*)\]))*$/.test(path) &&
    !path.split(/[.\[\]]/).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
  );
}

const replyPath = z.string().refine(isSetupReplyPath);

// The caller names the credential header. Reserve HTTP control headers, routing,
// and identifiers that are intentionally visible in logs and traces.
const reservedHeaders = new Set(
  (
    'host origin referer cookie cookie2 set-cookie connection keep-alive upgrade expect ' +
    'te trailer transfer-encoding forwarded via accept user-agent range traceparent tracestate baggage ' +
    'x-real-ip x-host x-method-override x-org-id x-organization-id x-scope-orgid x-tenant-id ' +
    'constructor prototype'
  ).split(' '),
);
const reservedPrefixes =
  /^(?:accept-|content-|proxy-|sec-|access-control-|openai-|x-(?:promptfoo|openai|forwarded|original|rewrite|http|proxy|envoy)-)/;

export function isSetupAuthHeader(name: string): boolean {
  const normalized = name.toLowerCase().replace(/_/g, '-');
  return (
    /^[a-z][a-z0-9_-]{0,127}$/i.test(name) &&
    !reservedHeaders.has(normalized) &&
    !reservedPrefixes.test(normalized)
  );
}

export const SetupConnectionTest = {
  Request: z
    .strictObject({
      url: z
        .url({ protocol: /^https?$/ })
        .max(4096)
        .refine((value) => {
          if (!/^https?:\/\//i.test(value) || !URL.canParse(value)) {
            return false;
          }
          const url = new URL(value);
          return !url.username && !url.password && !url.hash && !/[\s\\{}]/.test(value);
        }),
      body: z.record(z.string(), z.unknown()).refine((body) => {
        const json = JSON.stringify(body);
        return (
          json.length <= 16000 &&
          json.includes('{{prompt}}') &&
          !/\{[{%#]|\$\{|file:\/\/|"\$ref":/i.test(
            json.replace(/\{\{(?:prompt|sessionId)\}\}/g, ''),
          )
        );
      }),
      authEnv: z.union([
        z.literal(''),
        z
          .string()
          .max(128)
          .regex(/^[A-Z_][A-Z0-9_]*$/),
      ]),
      authHeader: z.string().refine(isSetupAuthHeader).optional(),
      responsePath: z.union([z.literal(''), replyPath]).optional(),
    })
    .refine(({ authHeader, authEnv }) => !authHeader || !!authEnv),
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

// Drafts can be incomplete. Bind proposed URLs and credentials to user input
// before turning a draft into a testable or runnable target.
export const SetupConnectionDraftSchema = z.strictObject({
  url: setupText(4096).optional(),
  body: z
    .record(z.string(), z.unknown())
    .refine((body) => JSON.stringify(body).length <= 16000)
    .optional(),
  authEnv: z.string().max(128).optional(),
  authHeader: setupText(128).optional(),
  responsePath: z.string().max(200).optional(),
  model: setupText(200).optional(),
});
export type SetupConnectionDraft = z.infer<typeof SetupConnectionDraftSchema>;

export const RedteamSetupReplySchema = z.strictObject({
  message: setupText(2000),
  plan: RedteamSetupPlanSchema.optional(),
  connection: SetupConnectionDraftSchema.optional(),
});
