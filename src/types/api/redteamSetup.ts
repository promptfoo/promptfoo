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

export const RedteamSetupReplySchema = z.union([
  z.strictObject({ question: setupText(400) }),
  z.strictObject({ explanation: setupText(300) }),
  RedteamSetupPlanSchema,
]);

// The HTTP provider evaluates transformResponse. Only property reads may become a reply path.
export function isSetupReplyPath(path: string): boolean {
  return (
    path.length <= 200 &&
    /^[A-Za-z_]\w*(?:(?:\.[A-Za-z_]\w*)|(?:\[(?:0|[1-9]\d*)\]))*$/.test(path) &&
    !path.split(/[.\[\]]/).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
  );
}

const replyPath = z.string().refine(isSetupReplyPath);
export const SetupConnectionTest = {
  Request: z.strictObject({
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
        !/\{[{%#]|\$\{|file:\/\/|"\$ref":/i.test(json.replace(/\{\{(?:prompt|sessionId)\}\}/g, ''))
      );
    }),
    authEnv: z.union([
      z.literal(''),
      z
        .string()
        .max(128)
        .regex(/^[A-Z_][A-Z0-9_]*$/),
    ]),
    responsePath: z.union([z.literal(''), replyPath]).optional(),
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
