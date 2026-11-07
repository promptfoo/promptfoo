import { z } from 'zod';
import { resolveLimits, WorkBudget } from './limits';
import { captureJson } from './values';

import type { AnalysisLimits, MetamorphicPlan } from './types';

// Logical IDs are report-visible. Provider IDs are exact selectors, never emitted.
const id = z.string().min(1).max(128);
const pointer = z
  .string()
  .max(2048)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !/~(?:[^01]|$)/u.test(value)),
    'Expected an RFC 6901 JSON pointer',
  );
const selector = z
  .strictObject({
    source: z.enum(['output', 'namedScores']),
    pointer: pointer.default(''),
    decode: z.enum(['none', 'json']).default('none'),
    normalize: z
      .array(z.enum(['trim', 'collapse-whitespace', 'lowercase', 'nfkc']))
      .max(4)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.normalize).size !== value.normalize.length) {
      ctx.addIssue({ code: 'custom', message: 'Normalizers must not repeat' });
    }
    if (value.source === 'namedScores' && value.decode !== 'none') {
      ctx.addIssue({ code: 'custom', message: 'Named scores are already structured JSON' });
    }
  });
const relationFields = {
  id,
  left: id,
  right: id,
  leftSelector: selector,
  rightSelector: selector,
};
const relation = z.discriminatedUnion('kind', [
  z.strictObject({ ...relationFields, kind: z.literal('equal') }),
  z.strictObject({ ...relationFields, kind: z.literal('not-equal') }),
  z.strictObject({
    ...relationFields,
    kind: z.literal('affine'),
    scale: z.number().finite(),
    offset: z.number().finite().default(0),
    absoluteTolerance: z.number().finite().nonnegative().default(0),
    relativeTolerance: z.number().finite().nonnegative().default(0),
  }),
  z.strictObject({ ...relationFields, kind: z.literal('nondecreasing') }),
  z.strictObject({ ...relationFields, kind: z.literal('nonincreasing') }),
  z.strictObject({ ...relationFields, kind: z.literal('set-equal') }),
  z.strictObject({ ...relationFields, kind: z.literal('subset') }),
  z.strictObject({ ...relationFields, kind: z.literal('superset') }),
  z.strictObject({ ...relationFields, kind: z.literal('disjoint') }),
  z.strictObject({ ...relationFields, kind: z.literal('prefix') }),
  z.strictObject({ ...relationFields, kind: z.literal('subsequence') }),
]);
const schema = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1).max(256),
  datasetRevision: z.string().min(1).max(256).optional(),
  repetitions: z.number().int().positive().max(10_000),
  sourceAssertions: z.enum(['require-pass', 'observe-output']).default('require-pass'),
  contexts: z
    .array(
      z.strictObject({
        id,
        promptIdx: z.number().int().nonnegative(),
        providerId: z.string().min(1).max(4096),
        providerLabel: z.string().max(4096).optional(),
      }),
    )
    .min(1)
    .max(1000),
  families: z
    .array(
      z.strictObject({
        id,
        variants: z.array(id).min(2).max(1000),
        relations: z.array(relation).min(1).max(1000),
      }),
    )
    .min(1)
    .max(10_000),
});
function unique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(message);
  }
}

/** Validate the entire panel before inspecting any results, including empty exports. */
export function parsePlan(input: unknown, overrides?: Partial<AnalysisLimits>): MetamorphicPlan {
  const limits = resolveLimits(overrides);
  const snapshot = captureJson(
    input,
    {
      ...limits,
      maxValueBytes: Math.min(limits.maxFileBytes, 4 * 1024 * 1024),
    },
    new WorkBudget(limits.maxWork),
  );
  const parsed = schema.safeParse(snapshot);
  if (!parsed.success) {
    // Zod's issue payload may contain values. Keep errors intentionally value-free.
    const paths = parsed.error.issues.slice(0, 8).map((issue) => issue.path.join('.'));
    throw new Error(`Invalid metamorphic plan fields: ${paths.join(', ') || '(root)'}`);
  }
  const plan = parsed.data;
  unique(
    plan.contexts.map((context) => context.id),
    'Duplicate context IDs',
  );
  unique(
    plan.contexts.map((context) =>
      JSON.stringify([context.promptIdx, context.providerId, context.providerLabel ?? null]),
    ),
    'Duplicate context selectors',
  );
  unique(
    plan.families.map((family) => family.id),
    'Duplicate family IDs',
  );
  let variants = 0;
  let relations = 0;
  for (const family of plan.families) {
    unique(family.variants, 'Duplicate variant IDs within a family');
    unique(
      family.relations.map((item) => item.id),
      'Duplicate relation IDs within a family',
    );
    const declared = new Set(family.variants);
    const used = new Set<string>();
    for (const item of family.relations) {
      if (!declared.has(item.left) || !declared.has(item.right)) {
        throw new Error('Relation refers to an undeclared variant');
      }
      if (item.left === item.right) {
        throw new Error('Self relations are not supported');
      }
      used.add(item.left);
      used.add(item.right);
    }
    if (used.size !== declared.size) {
      throw new Error('Every declared variant must participate in a relation');
    }
    variants += family.variants.length;
    relations += family.relations.length;
  }
  const observations = variants * plan.contexts.length * plan.repetitions;
  const checks = relations * plan.contexts.length * plan.repetitions;
  if (!Number.isSafeInteger(observations) || observations > limits.maxObservations) {
    throw new Error('Declared observation panel exceeds the analysis limit');
  }
  if (!Number.isSafeInteger(checks) || checks > limits.maxChecks) {
    throw new Error('Declared relation panel exceeds the analysis limit');
  }
  return plan;
}
